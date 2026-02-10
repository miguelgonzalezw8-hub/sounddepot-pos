// client/src/pages/ManagerCoupons.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  serverTimestamp,
  orderBy,
} from "firebase/firestore";
import { db } from "../firebase";
import { useSession } from "../session/SessionProvider";

function clampInt(n, min, max) {
  const x = Math.floor(Number(n));
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}
function toNum(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}
function uniq(arr) {
  return Array.from(new Set((arr || []).map(String))).filter(Boolean);
}
function codeFromAlphabet(len = 8) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1
  let s = "";
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}
function normalizeCategory(c) {
  return String(c || "").trim();
}

function Chip({ label, onRemove }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(0,0,0,0.10)",
        background: "white",
        fontSize: 12,
        fontWeight: 800,
        marginRight: 8,
        marginBottom: 8,
      }}
    >
      <span>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        style={{
          border: "none",
          background: "transparent",
          cursor: "pointer",
          fontWeight: 900,
          opacity: 0.7,
        }}
        title="Remove"
      >
        ✕
      </button>
    </span>
  );
}

export default function ManagerCoupons() {
  const navigate = useNavigate();
  const { terminal, booting } = useSession();
  const tenantId = terminal?.tenantId || null;
  const shopId = terminal?.shopId || null;

  const couponsCol = useMemo(() => {
    if (!shopId) return null;
    return collection(db, "shops", shopId, "coupons");
  }, [shopId]);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  // products for picking include/exclude
  const [products, setProducts] = useState([]);

  // create form
  const [codeMode, setCodeMode] = useState("auto"); // auto | manual
  const [code, setCode] = useState("");
  const [codeLen, setCodeLen] = useState(8);
  const [prefix, setPrefix] = useState("SD"); // optional

  const [name, setName] = useState("");
  const [active, setActive] = useState(true);

  const [discountType, setDiscountType] = useState("percent"); // percent | fixed
  const [amount, setAmount] = useState("10"); // percent or dollars

  const [minSubtotal, setMinSubtotal] = useState(""); // optional
  const [startsAt, setStartsAt] = useState(""); // datetime-local optional
  const [endsAt, setEndsAt] = useState(""); // datetime-local optional

  const [maxUses, setMaxUses] = useState(""); // optional
  const [maxUsesPerCustomer, setMaxUsesPerCustomer] = useState(""); // optional

  // rule scope
  const [scopeMode, setScopeMode] = useState("all"); // all | include
  const [includeProducts, setIncludeProducts] = useState([]); // productIds
  const [includeBrands, setIncludeBrands] = useState([]); // strings
  const [includeCategories, setIncludeCategories] = useState([]); // strings

  const [excludeProducts, setExcludeProducts] = useState([]); // productIds
  const [excludeBrands, setExcludeBrands] = useState([]); // strings
  const [excludeCategories, setExcludeCategories] = useState([]); // strings

  // pick helpers
  const [productPick, setProductPick] = useState("");
  const [excludeProductPick, setExcludeProductPick] = useState("");
  const [brandPick, setBrandPick] = useState("");
  const [excludeBrandPick, setExcludeBrandPick] = useState("");
  const [catPick, setCatPick] = useState("");
  const [excludeCatPick, setExcludeCatPick] = useState("");

  const brandOptions = useMemo(() => {
    const set = new Set();
    for (const p of products) if (p.brand) set.add(String(p.brand));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const categoryOptions = useMemo(() => {
    const set = new Set();
    for (const p of products) if (p.category) set.add(String(p.category));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products]);

  // load coupons list
  useEffect(() => {
    if (booting) return;
    if (!tenantId || !shopId || !couponsCol) return;

    setLoading(true);

    const qy = query(
      couponsCol,
      where("tenantId", "==", tenantId),
      orderBy("createdAt", "desc")
    );

    return onSnapshot(
      qy,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error("[ManagerCoupons] list error:", err);
        setRows([]);
        setLoading(false);
      }
    );
  }, [booting, tenantId, shopId, couponsCol]);

  // load products (for selectors)
  useEffect(() => {
    if (booting) return;
    if (!tenantId) return;

    const qy = query(collection(db, "products"), where("tenantId", "==", tenantId));
    return onSnapshot(
      qy,
      (snap) => setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => {
        console.error("[ManagerCoupons] products load error:", err);
        setProducts([]);
      }
    );
  }, [booting, tenantId]);

  const productOptions = useMemo(() => {
    // keep it manageable: sort by name
    return [...products].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  }, [products]);

  const resetForm = () => {
    setCodeMode("auto");
    setCode("");
    setCodeLen(8);
    setPrefix("SD");
    setName("");
    setActive(true);
    setDiscountType("percent");
    setAmount("10");
    setMinSubtotal("");
    setStartsAt("");
    setEndsAt("");
    setMaxUses("");
    setMaxUsesPerCustomer("");
    setScopeMode("all");
    setIncludeProducts([]);
    setIncludeBrands([]);
    setIncludeCategories([]);
    setExcludeProducts([]);
    setExcludeBrands([]);
    setExcludeCategories([]);
    setProductPick("");
    setExcludeProductPick("");
    setBrandPick("");
    setExcludeBrandPick("");
    setCatPick("");
    setExcludeCatPick("");
  };

  const generateCodePreview = () => {
    const len = clampInt(codeLen, 4, 16);
    const core = codeFromAlphabet(len);
    const pre = String(prefix || "").trim().toUpperCase();
    return pre ? `${pre}-${core}` : core;
  };

  const createCoupon = async () => {
    if (!tenantId || !shopId || !couponsCol) return;

    const cleanName = String(name || "").trim();
    const type = discountType === "fixed" ? "fixed" : "percent";

    const amt = toNum(amount);
    if (type === "percent" && (amt <= 0 || amt > 100)) {
      alert("Percent must be between 0 and 100.");
      return;
    }
    if (type === "fixed" && amt <= 0) {
      alert("$ off must be > 0.");
      return;
    }

    const minSub = String(minSubtotal || "").trim() ? toNum(minSubtotal) : null;

    const maxU = String(maxUses || "").trim() ? clampInt(maxUses, 1, 1_000_000) : null;
    const maxPer = String(maxUsesPerCustomer || "").trim()
      ? clampInt(maxUsesPerCustomer, 1, 1_000_000)
      : null;

    // code
    let finalCode = "";
    if (codeMode === "manual") {
      finalCode = String(code || "").trim().toUpperCase();
      if (!finalCode) {
        alert("Enter a code.");
        return;
      }
      if (!/^[A-Z0-9\-]{4,24}$/.test(finalCode)) {
        alert("Code must be 4-24 chars (A-Z, 0-9, dash).");
        return;
      }
    } else {
      finalCode = generateCodePreview();
    }

    const includes = {
      mode: scopeMode === "include" ? "include" : "all",
      productIds: uniq(includeProducts),
      brands: uniq(includeBrands),
      categories: uniq(includeCategories).map(normalizeCategory),
    };

    const excludes = {
      productIds: uniq(excludeProducts),
      brands: uniq(excludeBrands),
      categories: uniq(excludeCategories).map(normalizeCategory),
    };

    // If they chose include mode but selected nothing, that would match nothing — warn.
    if (
      includes.mode === "include" &&
      includes.productIds.length === 0 &&
      includes.brands.length === 0 &&
      includes.categories.length === 0
    ) {
      alert("Include mode selected, but no included products/brands/categories were chosen.");
      return;
    }

    const starts = startsAt ? new Date(startsAt) : null;
    const ends = endsAt ? new Date(endsAt) : null;
    if (starts && Number.isNaN(starts.getTime())) {
      alert("Invalid start date.");
      return;
    }
    if (ends && Number.isNaN(ends.getTime())) {
      alert("Invalid end date.");
      return;
    }
    if (starts && ends && starts.getTime() > ends.getTime()) {
      alert("Start date must be before end date.");
      return;
    }

    // ✅ Store coupon by docId = code for uniqueness
    const ref = doc(db, "shops", shopId, "coupons", finalCode);
    const exists = await getDoc(ref);
    if (exists.exists()) {
      if (codeMode === "manual") {
        alert("That code already exists. Choose another.");
        return;
      }
      // auto: try a few times
      for (let i = 0; i < 8; i++) {
        const attempt = generateCodePreview();
        const ref2 = doc(db, "shops", shopId, "coupons", attempt);
        const ex2 = await getDoc(ref2);
        if (!ex2.exists()) {
          finalCode = attempt;
          break;
        }
      }
      if (finalCode === ref.id) {
        alert("Could not generate a unique code. Try again.");
        return;
      }
    }

    const payload = {
      tenantId,
      shopId,

      code: finalCode,
      name: cleanName || null,
      active: Boolean(active),

      discount: {
        type, // percent | fixed
        amount: Number(amt),
      },

      minSubtotal: minSub,

      window: {
        startsAt: startsAt || null, // store as string for now (simple)
        endsAt: endsAt || null,
      },

      limits: {
        maxUses: maxU,
        maxUsesPerCustomer: maxPer,
      },

      // runtime counters (for later redemption)
      usage: {
        uses: 0,
      },

      appliesTo: includes,
      excludes,

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(doc(db, "shops", shopId, "coupons", finalCode), payload);

    alert(`Created coupon: ${finalCode}`);
    resetForm();
  };

  const toggleActive = async (c) => {
    if (!tenantId || !shopId) return;
    const id = c.id || c.code;
    if (!id) return;

    await updateDoc(doc(db, "shops", shopId, "coupons", id), {
      active: !c.active,
      updatedAt: serverTimestamp(),
    });
  };

  return (
    <div className="inventory-container">
      <div className="search-row" style={{ display: "flex", gap: 8 }}>
        <button
          className="search-box"
          onClick={() => navigate("/manager")}
          style={{ width: 120 }}
        >
          ← Back
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Coupons</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Auto-generate codes with comprehensive rules (products/brands/categories, limits, dates)
          </div>
        </div>

        <button className="search-box" onClick={resetForm} style={{ width: 140 }}>
          Reset Form
        </button>
      </div>

      {/* CREATE */}
      <div
        style={{
          marginTop: 12,
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 12,
          padding: 12,
          background: "white",
        }}
      >
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Create Coupon</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Code Mode</div>
            <select
              className="search-box"
              value={codeMode}
              onChange={(e) => setCodeMode(e.target.value)}
              style={{ width: "100%" }}
            >
              <option value="auto">Auto-generate</option>
              <option value="manual">Manual</option>
            </select>
          </div>

          {codeMode === "auto" ? (
            <>
              <div>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Prefix</div>
                <input
                  className="search-box"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  placeholder="SD"
                  style={{ width: "100%" }}
                />
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Code Length</div>
                <input
                  className="search-box"
                  value={String(codeLen)}
                  onChange={(e) => setCodeLen(e.target.value)}
                  placeholder="8"
                  style={{ width: "100%" }}
                />
              </div>
            </>
          ) : (
            <div style={{ gridColumn: "span 2" }}>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Code</div>
              <input
                className="search-box"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="SAVE10"
                style={{ width: "100%" }}
              />
            </div>
          )}

          <div style={{ gridColumn: "span 2" }}>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Name (optional)</div>
            <input
              className="search-box"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: February Promo"
              style={{ width: "100%" }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              Active
            </label>
            <div style={{ fontSize: 12, opacity: 0.65 }}>
              Preview:{" "}
              <strong>
                {codeMode === "manual"
                  ? (String(code || "").trim().toUpperCase() || "—")
                  : generateCodePreview()}
              </strong>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Discount Type</div>
            <select
              className="search-box"
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value)}
              style={{ width: "100%" }}
            >
              <option value="percent">% off</option>
              <option value="fixed">$ off</option>
            </select>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
              Amount {discountType === "percent" ? "(1-100)" : "($)"}
            </div>
            <input
              className="search-box"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Min Subtotal (optional)</div>
            <input
              className="search-box"
              value={minSubtotal}
              onChange={(e) => setMinSubtotal(e.target.value)}
              placeholder="Ex: 200"
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Starts At (optional)</div>
            <input
              type="datetime-local"
              className="search-box"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Ends At (optional)</div>
            <input
              type="datetime-local"
              className="search-box"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Max Uses (optional)</div>
            <input
              className="search-box"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              placeholder="Ex: 100"
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
              Max Uses / Customer (optional)
            </div>
            <input
              className="search-box"
              value={maxUsesPerCustomer}
              onChange={(e) => setMaxUsesPerCustomer(e.target.value)}
              placeholder="Ex: 1"
              style={{ width: "100%" }}
            />
          </div>
        </div>

        {/* APPLY SCOPE */}
        <div style={{ marginTop: 14, fontWeight: 900 }}>Applies To</div>
        <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="radio"
              checked={scopeMode === "all"}
              onChange={() => setScopeMode("all")}
            />
            All products
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="radio"
              checked={scopeMode === "include"}
              onChange={() => setScopeMode("include")}
            />
            Only included (products/brands/categories)
          </label>
        </div>

        {/* INCLUDE */}
        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Include Product</div>
            <select
              className="search-box"
              value={productPick}
              onChange={(e) => {
                const id = e.target.value;
                setProductPick("");
                if (!id) return;
                setIncludeProducts((prev) => uniq([...prev, id]));
              }}
              style={{ width: "100%" }}
            >
              <option value="">Select product…</option>
              {productOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.sku ? `(${p.sku})` : ""} — {p.brand || "—"}
                </option>
              ))}
            </select>
            <div style={{ marginTop: 8 }}>
              {includeProducts.map((id) => {
                const p = products.find((x) => x.id === id);
                return (
                  <Chip
                    key={id}
                    label={p ? p.name : id}
                    onRemove={() => setIncludeProducts((prev) => prev.filter((x) => x !== id))}
                  />
                );
              })}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Include Brand</div>
            <select
              className="search-box"
              value={brandPick}
              onChange={(e) => {
                const v = e.target.value;
                setBrandPick("");
                if (!v) return;
                setIncludeBrands((prev) => uniq([...prev, v]));
              }}
              style={{ width: "100%" }}
            >
              <option value="">Select brand…</option>
              {brandOptions.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <div style={{ marginTop: 8 }}>
              {includeBrands.map((b) => (
                <Chip
                  key={b}
                  label={b}
                  onRemove={() => setIncludeBrands((prev) => prev.filter((x) => x !== b))}
                />
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Include Category</div>
            <select
              className="search-box"
              value={catPick}
              onChange={(e) => {
                const v = e.target.value;
                setCatPick("");
                if (!v) return;
                setIncludeCategories((prev) => uniq([...prev, v]));
              }}
              style={{ width: "100%" }}
            >
              <option value="">Select category…</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <div style={{ marginTop: 8 }}>
              {includeCategories.map((c) => (
                <Chip
                  key={c}
                  label={c}
                  onRemove={() => setIncludeCategories((prev) => prev.filter((x) => x !== c))}
                />
              ))}
            </div>
          </div>
        </div>

        {/* EXCLUDES */}
        <div style={{ marginTop: 12, fontWeight: 900 }}>Exclusions (always removed)</div>
        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Exclude Product</div>
            <select
              className="search-box"
              value={excludeProductPick}
              onChange={(e) => {
                const id = e.target.value;
                setExcludeProductPick("");
                if (!id) return;
                setExcludeProducts((prev) => uniq([...prev, id]));
              }}
              style={{ width: "100%" }}
            >
              <option value="">Select product…</option>
              {productOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.sku ? `(${p.sku})` : ""} — {p.brand || "—"}
                </option>
              ))}
            </select>
            <div style={{ marginTop: 8 }}>
              {excludeProducts.map((id) => {
                const p = products.find((x) => x.id === id);
                return (
                  <Chip
                    key={id}
                    label={p ? p.name : id}
                    onRemove={() => setExcludeProducts((prev) => prev.filter((x) => x !== id))}
                  />
                );
              })}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Exclude Brand</div>
            <select
              className="search-box"
              value={excludeBrandPick}
              onChange={(e) => {
                const v = e.target.value;
                setExcludeBrandPick("");
                if (!v) return;
                setExcludeBrands((prev) => uniq([...prev, v]));
              }}
              style={{ width: "100%" }}
            >
              <option value="">Select brand…</option>
              {brandOptions.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <div style={{ marginTop: 8 }}>
              {excludeBrands.map((b) => (
                <Chip
                  key={b}
                  label={b}
                  onRemove={() => setExcludeBrands((prev) => prev.filter((x) => x !== b))}
                />
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Exclude Category</div>
            <select
              className="search-box"
              value={excludeCatPick}
              onChange={(e) => {
                const v = e.target.value;
                setExcludeCatPick("");
                if (!v) return;
                setExcludeCategories((prev) => uniq([...prev, v]));
              }}
              style={{ width: "100%" }}
            >
              <option value="">Select category…</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <div style={{ marginTop: 8 }}>
              {excludeCategories.map((c) => (
                <Chip
                  key={c}
                  label={c}
                  onRemove={() => setExcludeCategories((prev) => prev.filter((x) => x !== c))}
                />
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="search-box" onClick={createCoupon} style={{ width: 220 }}>
            + Create Coupon
          </button>
        </div>
      </div>

      {/* LIST */}
      <div
        style={{
          marginTop: 12,
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 12,
          padding: 12,
          background: "white",
        }}
      >
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Existing Coupons</div>

        {loading ? (
          <div style={{ opacity: 0.7 }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ opacity: 0.7 }}>No coupons yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {rows.map((c) => (
              <div
                key={c.id}
                style={{
                  border: "1px solid rgba(0,0,0,0.06)",
                  borderRadius: 12,
                  padding: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900 }}>
                    {c.code || c.id}{" "}
                    <span style={{ fontSize: 12, opacity: 0.7 }}>
                      {c.active ? "• Active" : "• Inactive"}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>
                    {c.discount?.type === "percent"
                      ? `${c.discount?.amount || 0}% off`
                      : `$${Number(c.discount?.amount || 0).toFixed(2)} off`}
                    {c.minSubtotal ? ` • Min $${Number(c.minSubtotal).toFixed(2)}` : ""}
                    {c.window?.startsAt ? ` • Starts ${c.window.startsAt}` : ""}
                    {c.window?.endsAt ? ` • Ends ${c.window.endsAt}` : ""}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
                    Applies: {c.appliesTo?.mode === "include" ? "Included only" : "All products"}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="search-box"
                    onClick={() => toggleActive(c)}
                    style={{ width: 150, opacity: 0.9 }}
                  >
                    {c.active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
