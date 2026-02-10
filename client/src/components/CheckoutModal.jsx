import { useState, useMemo, useEffect } from "react";
import visa from "../assets/cc/visa.svg";
import mastercard from "../assets/cc/mastercard.svg";
import amex from "../assets/cc/amex.svg";
import discover from "../assets/cc/discover.svg";

import { db } from "../firebase";
import { doc, getDoc, updateDoc, increment, serverTimestamp } from "firebase/firestore";
import { useSession } from "../session/SessionProvider";

function toNum(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
function clamp(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

// ✅ coupon applicability checker (products/brands/categories + excludes)
function couponMatchesCart({ coupon, cartItems = [], productsById = {} }) {
  if (!coupon) return false;

  const appliesTo = coupon.appliesTo || { mode: "all" };
  const excludes = coupon.excludes || {};

  const exProd = new Set((excludes.productIds || []).map(String));
  const exBrand = new Set((excludes.brands || []).map(String));
  const exCat = new Set((excludes.categories || []).map(String));

  const incProd = new Set((appliesTo.productIds || []).map(String));
  const incBrand = new Set((appliesTo.brands || []).map(String));
  const incCat = new Set((appliesTo.categories || []).map(String));

  const mode = appliesTo.mode === "include" ? "include" : "all";

  // lines that are eligible after exclusions (also ignore bundle parents if present)
  const eligibleLines = (cartItems || [])
    .filter((i) => !i?.isBundleParent) // pricing line, not a real product
    .filter((i) => {
      const pid = String(i.productId || "");
      if (!pid || pid.startsWith("bundle:")) return false;

      const p = productsById[pid] || {};
      const brand = String(p.brand || "");
      const cat = String(p.category || "");

      if (exProd.has(pid)) return false;
      if (brand && exBrand.has(brand)) return false;
      if (cat && exCat.has(cat)) return false;

      return true;
    });

  if (eligibleLines.length === 0) return false;

  // If mode=all => any eligible line qualifies (we still apply discount only on eligible subtotal)
  if (mode === "all") return true;

  // mode=include => must match include filters
  return eligibleLines.some((i) => {
    const pid = String(i.productId || "");
    const p = productsById[pid] || {};
    const brand = String(p.brand || "");
    const cat = String(p.category || "");

    if (incProd.size && incProd.has(pid)) return true;
    if (incBrand.size && brand && incBrand.has(brand)) return true;
    if (incCat.size && cat && incCat.has(cat)) return true;

    return false;
  });
}

function calcEligibleSubtotal({ coupon, cartItems = [], productsById = {} }) {
  if (!coupon) return 0;

  const appliesTo = coupon.appliesTo || { mode: "all" };
  const excludes = coupon.excludes || {};

  const exProd = new Set((excludes.productIds || []).map(String));
  const exBrand = new Set((excludes.brands || []).map(String));
  const exCat = new Set((excludes.categories || []).map(String));

  const incProd = new Set((appliesTo.productIds || []).map(String));
  const incBrand = new Set((appliesTo.brands || []).map(String));
  const incCat = new Set((appliesTo.categories || []).map(String));

  const mode = appliesTo.mode === "include" ? "include" : "all";

  const eligibleLines = (cartItems || [])
    .filter((i) => !i?.isBundleParent)
    .filter((i) => {
      const pid = String(i.productId || "");
      if (!pid || pid.startsWith("bundle:")) return false;

      const p = productsById[pid] || {};
      const brand = String(p.brand || "");
      const cat = String(p.category || "");

      if (exProd.has(pid)) return false;
      if (brand && exBrand.has(brand)) return false;
      if (cat && exCat.has(cat)) return false;

      if (mode === "all") return true;

      // include mode: must match at least one include dimension (if any provided)
      const matchesProd = incProd.size ? incProd.has(pid) : false;
      const matchesBrand = incBrand.size ? (brand && incBrand.has(brand)) : false;
      const matchesCat = incCat.size ? (cat && incCat.has(cat)) : false;

      return matchesProd || matchesBrand || matchesCat;
    });

  return eligibleLines.reduce(
    (s, i) => s + toNum(i.price) * toNum(i.qty),
    0
  );
}

export default function CheckoutModal({
  isOpen,
  onClose,
  subtotal,
  taxRate,
  onCompletePayment,

  // ✅ NEW (logic only; you can pass these from Sell.jsx without changing UI)
  cartItems = [],
  products = [],
  selectedCustomerId = null,
}) {
  const { terminal } = useSession();
  const tenantId = terminal?.tenantId || null;
  const shopId = terminal?.shopId || null;

  const [paymentType, setPaymentType] = useState(null);
  const [cardType, setCardType] = useState(null);

  // Existing manual discounts (kept)
  const [discountPercent, setDiscountPercent] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");

  // ✅ Coupon code support (no UI change required; uses existing $ discount box if you want)
  const [couponCode, setCouponCode] = useState("");
  const [couponState, setCouponState] = useState({
    applying: false,
    applied: null, // coupon doc
    error: "",
  });

  const cardOptions = useMemo(
    () => [
      { type: "Visa", img: visa },
      { type: "Mastercard", img: mastercard },
      { type: "Amex", img: amex },
      { type: "Discover", img: discover },
    ],
    []
  );

  const productsById = useMemo(() => {
    const map = {};
    (products || []).forEach((p) => {
      if (p?.id) map[String(p.id)] = p;
    });
    return map;
  }, [products]);

  // If user edits manual discounts, clear coupon (so you don't double-discount)
  useEffect(() => {
    if (discountPercent || discountAmount) {
      if (couponState.applied) {
        setCouponState({ applying: false, applied: null, error: "" });
        setCouponCode("");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discountPercent, discountAmount]);

  const applyCoupon = async () => {
    const code = String(couponCode || "").trim().toUpperCase();
    if (!code) return;

    if (!tenantId || !shopId) {
      setCouponState({ applying: false, applied: null, error: "No shop configured." });
      return;
    }

    setCouponState({ applying: true, applied: null, error: "" });

    try {
      const ref = doc(db, "shops", shopId, "coupons", code);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        setCouponState({ applying: false, applied: null, error: "Coupon not found." });
        return;
      }

      const c = { id: snap.id, ...snap.data() };

      // tenant guard
      if (String(c.tenantId || "") !== String(tenantId || "")) {
        setCouponState({ applying: false, applied: null, error: "Coupon not valid for this tenant." });
        return;
      }

      if (!c.active) {
        setCouponState({ applying: false, applied: null, error: "Coupon is inactive." });
        return;
      }

      // date window
      const startsAt = c.window?.startsAt ? new Date(c.window.startsAt) : null;
      const endsAt = c.window?.endsAt ? new Date(c.window.endsAt) : null;
      const now = new Date();

      if (startsAt && !Number.isNaN(startsAt.getTime()) && now < startsAt) {
        setCouponState({ applying: false, applied: null, error: "Coupon not started yet." });
        return;
      }
      if (endsAt && !Number.isNaN(endsAt.getTime()) && now > endsAt) {
        setCouponState({ applying: false, applied: null, error: "Coupon has expired." });
        return;
      }

      // min subtotal (uses your passed subtotal)
      const minSub = c.minSubtotal != null ? toNum(c.minSubtotal) : null;
      if (minSub != null && subtotal < minSub) {
        setCouponState({
          applying: false,
          applied: null,
          error: `Requires minimum subtotal of $${minSub.toFixed(2)}.`,
        });
        return;
      }

      // basic usage limit (global)
      const maxUses = c.limits?.maxUses != null ? toNum(c.limits.maxUses) : null;
      const uses = c.usage?.uses != null ? toNum(c.usage.uses) : 0;
      if (maxUses != null && uses >= maxUses) {
        setCouponState({ applying: false, applied: null, error: "Coupon usage limit reached." });
        return;
      }

      // per-customer limit (optional) — placeholder check (requires usageByCustomer map if you want strict)
      // We'll still enforce on finalize by writing usage. For now just allow.
      const maxPer = c.limits?.maxUsesPerCustomer != null ? toNum(c.limits.maxUsesPerCustomer) : null;
      if (maxPer != null && !selectedCustomerId) {
        // If you want, you can require a customer when per-customer limit exists
        // We'll allow it without forcing UI change:
        // setCouponState({ applying:false, applied:null, error:"Select a customer to use this coupon."}); return;
      }

      // cart rule match
      const ok = couponMatchesCart({ coupon: c, cartItems, productsById });
      if (!ok) {
        setCouponState({ applying: false, applied: null, error: "Coupon does not apply to items in cart." });
        return;
      }

      // Clear manual discounts (avoid stacking)
      setDiscountPercent("");
      setDiscountAmount("");

      setCouponState({ applying: false, applied: c, error: "" });
    } catch (e) {
      console.error("[CheckoutModal] applyCoupon error:", e);
      setCouponState({ applying: false, applied: null, error: "Failed to apply coupon." });
    }
  };

  const removeCoupon = () => {
    setCouponState({ applying: false, applied: null, error: "" });
    setCouponCode("");
  };

  /* ================= TOTAL CALCS (kept logic; now coupon can contribute discount) ================= */
  const totals = useMemo(() => {
    let discount = 0;

    // manual discount
    if (discountPercent) {
      discount = (subtotal * Number(discountPercent)) / 100;
    } else if (discountAmount) {
      discount = Number(discountAmount);
    }

    // coupon discount (if applied) — calculated against eligible subtotal, not entire cart
    const c = couponState.applied;
    if (!discount && c) {
      const eligibleSubtotal = calcEligibleSubtotal({ coupon: c, cartItems, productsById });

      const type = c.discount?.type === "fixed" ? "fixed" : "percent";
      const amt = toNum(c.discount?.amount);

      if (eligibleSubtotal > 0) {
        if (type === "percent") {
          discount = (eligibleSubtotal * clamp(amt, 0, 100)) / 100;
        } else {
          // $ off can't exceed eligible subtotal
          discount = Math.min(eligibleSubtotal, Math.max(0, amt));
        }
      }
    }

    const discountedSubtotal = Math.max(subtotal - discount, 0);
    const tax = discountedSubtotal * taxRate;
    const total = discountedSubtotal + tax;

    return {
      discount,
      discountedSubtotal,
      tax,
      total,
    };
  }, [subtotal, discountPercent, discountAmount, taxRate, couponState.applied, cartItems, productsById]);

  if (!isOpen) return null;

  /* ================= COMPLETE PAYMENT (adds coupon metadata + increments usage) ================= */
  const completePayment = async () => {
    // If coupon typed but not applied, try apply automatically
    if (couponCode && !couponState.applied && !discountPercent && !discountAmount) {
      await applyCoupon();
      // still allow proceed if coupon invalid? We'll block only if they meant to apply
      if (!couponState.applied) {
        // don't block payment; just proceed without coupon
      }
    }

    // bump usage counters for applied coupon
    if (couponState.applied && tenantId && shopId) {
      try {
        const code = String(couponState.applied.code || couponState.applied.id || "").toUpperCase();
        if (code) {
          await updateDoc(doc(db, "shops", shopId, "coupons", code), {
            "usage.uses": increment(1),
            updatedAt: serverTimestamp(),
          });
          // NOTE: if you want per-customer enforcement, we can store usageByCustomer.{customerId}: increment(1)
        }
      } catch (e) {
        console.error("[CheckoutModal] coupon usage increment failed:", e);
        // don't block payment
      }
    }

    onCompletePayment({
      payment: {
        method:
          paymentType === "Credit" || paymentType === "Debit"
            ? cardType || paymentType
            : paymentType,
        type: paymentType,
        cardType: cardType || null,
      },

      totals: {
        subtotal,
        tax: totals.tax,
        total: totals.total,

        // ✅ keep existing manual fields
        discount: discountAmount ? Number(discountAmount) : null,
        discountPercent: discountPercent ? Number(discountPercent) : null,

        // ✅ coupon fields
        couponCode: couponState.applied ? String(couponState.applied.code || couponState.applied.id) : null,
        couponDiscount: couponState.applied ? Number(totals.discount || 0) : null,
      },
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40">
      <div className="relative bg-white w-full max-w-md rounded-xl p-5 space-y-4 shadow-xl">
        {/* CLOSE */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 text-xl"
          aria-label="Close checkout"
        >
          ✕
        </button>

        <h2 className="text-lg font-semibold">💳 Payment</h2>

        {/* PAYMENT TYPE */}
        <div>
          <div className="text-sm font-semibold mb-1">Payment Type</div>
          <div className="grid grid-cols-2 gap-2">
            {["Cash", "Credit", "Debit", "Check", "Gift Card", "Store Credit"].map((type) => (
              <button
                key={type}
                onClick={() => {
                  setPaymentType(type);
                  if (type !== "Credit") setCardType(null);
                }}
                className={`py-2 rounded-lg text-sm transition ${
                  paymentType === type ? "bg-blue-600 text-white" : "bg-gray-100 hover:bg-gray-200"
                }`}
              >
                {type === "Cash" && "💵 "}
                {type === "Credit" && "💳 "}
                {type === "Debit" && "🏦 "}
                {type === "Check" && "🧾 "}
                {type === "Gift Card" && "🎁 "}
                {type === "Store Credit" && "🏪 "}
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* CARD TYPE */}
        {paymentType === "Credit" && (
          <div>
            <div className="text-sm font-semibold mb-1">Card Type</div>
            <div className="grid grid-cols-2 gap-3">
              {cardOptions.map((c) => (
                <button
                  key={c.type}
                  onClick={() => setCardType(c.type)}
                  className={`border rounded-lg p-3 flex items-center gap-3 transition ${
                    cardType === c.type ? "ring-2 ring-blue-600 bg-blue-50" : "bg-white hover:bg-gray-50"
                  }`}
                >
                  <img src={c.img} alt={c.type} className="h-7 w-auto" />
                  <span className="text-sm font-medium">{c.type}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* DISCOUNTS (existing UI kept) */}
        <div className="grid grid-cols-2 gap-2">
          <input
            placeholder="% Discount"
            value={discountPercent}
            onChange={(e) => {
              setDiscountPercent(e.target.value);
              setDiscountAmount("");
              // if manual discount chosen, clear coupon
              if (couponState.applied) removeCoupon();
            }}
            className="border rounded px-3 py-2 text-sm"
          />
          <input
            placeholder="$ Discount"
            value={discountAmount}
            onChange={(e) => {
              setDiscountAmount(e.target.value);
              setDiscountPercent("");
              if (couponState.applied) removeCoupon();
            }}
            className="border rounded px-3 py-2 text-sm"
          />
        </div>

        {/* ✅ COUPON (added, minimal footprint, no layout redesign) */}
        <div className="grid grid-cols-2 gap-2">
          <input
            placeholder="Coupon code"
            value={couponCode}
            onChange={(e) => {
              setCouponCode(e.target.value);
              // don't auto-clear applied until they apply/remove
              if (couponState.error) setCouponState((p) => ({ ...p, error: "" }));
            }}
            className="border rounded px-3 py-2 text-sm"
          />
          {!couponState.applied ? (
            <button
              onClick={applyCoupon}
              disabled={!couponCode || couponState.applying || !!discountPercent || !!discountAmount}
              className="border rounded px-3 py-2 text-sm font-semibold bg-gray-100 hover:bg-gray-200 disabled:opacity-60"
              title={discountPercent || discountAmount ? "Clear manual discount to apply coupon" : ""}
            >
              {couponState.applying ? "Applying..." : "Apply"}
            </button>
          ) : (
            <button
              onClick={removeCoupon}
              className="border rounded px-3 py-2 text-sm font-semibold bg-gray-100 hover:bg-gray-200"
            >
              Remove
            </button>
          )}
        </div>

        {couponState.error && (
          <div className="text-sm" style={{ color: "#b91c1c" }}>
            {couponState.error}
          </div>
        )}
        {couponState.applied && (
          <div className="text-sm" style={{ color: "#065f46" }}>
            Applied: <strong>{String(couponState.applied.code || couponState.applied.id)}</strong>
          </div>
        )}

        {/* TOTALS */}
        <div className="border-t pt-2 space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>

          {totals.discount > 0 && (
            <div className="flex justify-between" style={{ color: "#065f46" }}>
              <span>Discount</span>
              <span>-${Number(totals.discount || 0).toFixed(2)}</span>
            </div>
          )}

          <div className="flex justify-between">
            <span>Tax</span>
            <span>${totals.tax.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-semibold text-base">
            <span>Total</span>
            <span>${totals.total.toFixed(2)}</span>
          </div>
        </div>

        {/* CONFIRM */}
        <button
          onClick={completePayment}
          disabled={!paymentType || (paymentType === "Credit" && !cardType)}
          className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold disabled:opacity-60"
        >
          ✅ Complete Payment
        </button>

        {/* CANCEL */}
        <button
          onClick={onClose}
          className="w-full border py-2 rounded-lg text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
