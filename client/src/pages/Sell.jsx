// client/src/pages/Sell.jsx
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import VehicleFitment from "../components/VehicleFitment";
import CheckoutModal from "../components/CheckoutModal";
import { db } from "../firebase";
import { processOrderItem } from "../services/orderService";
import { getNextCounter, formatOrderNumber } from "../utils/counters";
import { useSession } from "../session/SessionProvider";
import { makeVehicleKey } from "../utils/vehicleKey";

import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";

function nnum(v, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

export default function Sell() {
  const navigate = useNavigate();

  // ✅ added posAccount + firebaseUser so we can default commission selection
  const { terminal, booting, isUnlocked, devMode, posAccount, firebaseUser } = useSession();
  const tenantId = terminal?.tenantId;
  const shopId = terminal?.shopId;

  /* ================= STATE ================= */
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [installer, setInstaller] = useState(null);
  const [installAt, setInstallAt] = useState(null);

  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [installers, setInstallers] = useState([]);

  const [search, setSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");

  const [cart, setCart] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const [heldCount, setHeldCount] = useState(0);

  // ✅ Bundles that match selected vehicle
  const [bundles, setBundles] = useState([]);

  // ✅ Labor settings + catalog
  const [laborMode, setLaborMode] = useState("catalog"); // "catalog" | "sku"
  const [laborSkuProductId, setLaborSkuProductId] = useState("");
  const [laborCatalog, setLaborCatalog] = useState([]);

  // ✅ Employees (PIN accounts) for commission dropdown (ADDED)
  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");

  /* ================= ADD CUSTOMER (RESTORED) ================= */
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [newCust, setNewCust] = useState({
    type: "Retail",
    firstName: "",
    lastName: "",
    companyName: "",
    phone: "",
    email: "",
    notes: "",
  });

  const createCustomerQuick = async () => {
    if (!tenantId) {
      alert("No tenant selected. Please set up the terminal.");
      return;
    }

    const payload = {
      tenantId, // ✅ REQUIRED for rules
      type: newCust.type || "Retail",
      firstName: (newCust.firstName || "").trim(),
      lastName: (newCust.lastName || "").trim(),
      companyName: (newCust.companyName || "").trim(),
      phone: (newCust.phone || "").trim(),
      email: (newCust.email || "").trim(),
      notes: (newCust.notes || "").trim(),
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const hasName =
      payload.companyName || payload.firstName || payload.lastName || payload.phone;

    if (!hasName) {
      alert("Enter at least a name/company or phone.");
      return;
    }

    const ref = await addDoc(collection(db, "customers"), payload);

    const created = { id: ref.id, ...payload };
    setSelectedCustomer(created);
    setCustomerSearch("");
    setAddCustomerOpen(false);

    setNewCust({
      type: "Retail",
      firstName: "",
      lastName: "",
      companyName: "",
      phone: "",
      email: "",
      notes: "",
    });
  };

  /* ================= VEHICLE KEY ================= */
  const selectedVehicleKey = useMemo(() => {
    if (!selectedVehicle) return "";
    return makeVehicleKey({
      year: selectedVehicle.year,
      make: selectedVehicle.make,
      model: selectedVehicle.model,
      trim: "",
    });
  }, [selectedVehicle]);

  /* ================= LOAD EMPLOYEES FOR COMMISSION (ADDED) ================= */
  useEffect(() => {
    if (booting) return;
    if (!devMode && !isUnlocked) return;
    if (!tenantId || !shopId) return;

    // IMPORTANT: This assumes your PIN accounts live in "posAccounts"
    // (matches your unlockWithPin concept). If your collection is named differently,
    // change "posAccounts" to that name.
    const qy = query(
      collection(db, "posAccounts"),
      where("tenantId", "==", tenantId),
      where("shopId", "==", shopId)
    );

    return onSnapshot(
      qy,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        // filter active if field exists; otherwise keep all
        const activeRows = rows
  .filter((r) => r.active !== false)
  // ✅ installers are NOT eligible for sales commission
  .filter((r) => String(r.role || "").toLowerCase() !== "installer");


        // sort client-side to avoid orderBy + composite index headaches
        activeRows.sort((a, b) => {
          const an = String(a.name || a.displayName || a.email || a.id || "").toLowerCase();
          const bn = String(b.name || b.displayName || b.email || b.id || "").toLowerCase();
          return an.localeCompare(bn);
        });

        setEmployees(activeRows);


        // default selection
        setSelectedEmployeeId((cur) => {
  // if current selection is no longer valid, pick PIN user or first eligible employee
  const stillValid = cur && activeRows.some((r) => r.id === cur);
  if (stillValid) return cur;

  if (posAccount?.id && activeRows.some((r) => r.id === posAccount.id)) return posAccount.id;
  return activeRows[0]?.id || "";
});
      },
      (err) => {
        console.error("[Sell employees] permission/index error:", err);
        setEmployees([]);
      }
    );
  }, [booting, isUnlocked, devMode, tenantId, shopId, posAccount?.id]);

  const selectedEmployee = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return employees.find((e) => e.id === selectedEmployeeId) || null;
  }, [employees, selectedEmployeeId]);

  const commissionEmployeeId =
    selectedEmployeeId || posAccount?.id || firebaseUser?.uid || null;

  const commissionEmployeeName =
    selectedEmployee?.name ||
    selectedEmployee?.displayName ||
    selectedEmployee?.email ||
    (posAccount?.id ? "PIN User" : firebaseUser?.email) ||
    "";

  /* ================= LOAD SHOP LABOR SETTINGS ================= */
  useEffect(() => {
    if (booting) return;
    if (!devMode && !isUnlocked) return;
    if (!tenantId || !shopId) return;

    let cancelled = false;

    (async () => {
      try {
        const snap = await getDoc(doc(db, "shops", shopId));
        if (cancelled) return;

        const d = snap.exists() ? snap.data() : null;
        const mode = String(d?.laborMode || "catalog");
        setLaborMode(mode === "sku" ? "sku" : "catalog");
        setLaborSkuProductId(String(d?.laborSkuProductId || ""));
      } catch (err) {
        console.error("[Sell labor settings] error:", err);
        setLaborMode("catalog");
        setLaborSkuProductId("");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [booting, isUnlocked, devMode, tenantId, shopId]);

  /* ================= LOAD LABOR CATALOG ================= */
  useEffect(() => {
    if (booting) return;
    if (!devMode && !isUnlocked) return;
    if (!tenantId || !shopId) return;

    const qy = query(
      collection(db, "shops", shopId, "laborCatalog"),
      where("tenantId", "==", tenantId),
      where("active", "==", true)
    );

    return onSnapshot(
      qy,
      (snap) => setLaborCatalog(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => {
        console.error("[Sell laborCatalog] permission/index error:", err);
        setLaborCatalog([]);
      }
    );
  }, [booting, isUnlocked, devMode, tenantId, shopId]);

  /* ================= LOAD DATA ================= */
  useEffect(() => {
    if (booting) return;
    if (!devMode && !isUnlocked) return;
    if (!tenantId) return;

    const qy = query(
      collection(db, "products"),
      where("tenantId", "==", tenantId),
      where("active", "==", true)
    );

    return onSnapshot(qy, (snap) =>
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  }, [booting, isUnlocked, devMode, tenantId]);

  useEffect(() => {
    if (booting) return;
    if (!devMode && !isUnlocked) return;
    if (!tenantId) return;

    const qy = query(collection(db, "customers"), where("tenantId", "==", tenantId));

    return onSnapshot(qy, (snap) =>
      setCustomers(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  }, [booting, isUnlocked, devMode, tenantId]);

  useEffect(() => {
    if (booting) return;
    if (!devMode && !isUnlocked) return;
    if (!tenantId) return;

    const qy = query(collection(db, "installers"), where("tenantId", "==", tenantId));

    return onSnapshot(qy, (snap) =>
      setInstallers(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((i) => i.active)
      )
    );
  }, [booting, isUnlocked, devMode, tenantId]);

  /* ================= LOAD BUNDLES FOR SELECTED VEHICLE ================= */
  useEffect(() => {
    if (booting) return;
    if (!devMode && !isUnlocked) return;
    if (!tenantId || !shopId) return;

    if (!selectedVehicleKey) {
      setBundles([]);
      return;
    }

    const qy = query(
      collection(db, "shops", shopId, "bundles"),
      where("tenantId", "==", tenantId),
      where("active", "==", true),
      where("vehicleKeys", "array-contains", selectedVehicleKey)
    );

    return onSnapshot(
      qy,
      (snap) => setBundles(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => {
        console.error("[Sell bundles] permission/index error:", err);
        setBundles([]);
      }
    );
  }, [booting, isUnlocked, devMode, tenantId, shopId, selectedVehicleKey]);

  /* ================= HELD COUNT ================= */
  useEffect(() => {
    if (booting) return;
    if (!devMode && !isUnlocked) return;
    if (!tenantId) return;

    const qy = query(collection(db, "heldReceipts"), where("tenantId", "==", tenantId));

    return onSnapshot(qy, (snap) => setHeldCount(snap.size));
  }, [booting, isUnlocked, devMode, tenantId]);

  /* ================= RESUME HELD ================= */
  useEffect(() => {
    const resume = sessionStorage.getItem("resumeReceipt");
    if (!resume) return;

    const data = JSON.parse(resume);

    const restoredCart = (data.cartItems || []).map((i) => ({
      ...i,
      qty: Number(i.qty ?? 1),
      price: Number(i.price || 0),
      discountTotal: Number(i.discountTotal || 0),
      serial:
        typeof i.serial === "string"
          ? i.serial
          : i.serial
          ? String(i.serial)
          : "",
      requiresSerial: !!i.requiresSerial,

      // bundle flags
      isBundleParent: !!i.isBundleParent,
      isBundleChild: !!i.isBundleChild,
      parentCartId: i.parentCartId || null,
      bundleId: i.bundleId || null,

      // labor flags
      isLabor: !!i.isLabor,
      priceEditable: !!i.priceEditable,
      laborMeta: i.laborMeta || null,
    }));

    setCart(restoredCart);
    setSelectedVehicle(data.vehicle || null);
    setInstallAt(data.installAt || null);

    sessionStorage.setItem("resumeCustomerId", data.customer?.id || "");
    sessionStorage.setItem("resumeInstallerId", data.installer?.id || "");

    sessionStorage.removeItem("resumeReceipt");
  }, []);

  useEffect(() => {
    const id = sessionStorage.getItem("resumeCustomerId");
    if (!id || !customers.length) return;
    const found = customers.find((c) => c.id === id);
    if (found) setSelectedCustomer(found);
    sessionStorage.removeItem("resumeCustomerId");
  }, [customers]);

  useEffect(() => {
    const id = sessionStorage.getItem("resumeInstallerId");
    if (!id || !installers.length) return;
    const found = installers.find((i) => i.id === id);
    if (found) setInstaller(found);
    sessionStorage.removeItem("resumeInstallerId");
  }, [installers]);

  /* ================= LABOR HELPERS ================= */
  const laborSkuProduct = useMemo(() => {
    if (!laborSkuProductId) return null;
    return products.find((p) => p.id === laborSkuProductId) || null;
  }, [products, laborSkuProductId]);

  const computeLaborDefaultPrice = (row) => {
    if (!row) return 0;
    const pricingModel = String(row.pricingModel || "flat");
    if (pricingModel === "hourly") {
      const rate = nnum(row.hourlyRate, 0);
      const hours = nnum(row.defaultHours, 0);
      return rate * hours;
    }
    return nnum(row.flatAmount, 0);
  };

  /* ================= CART ================= */
  const addToCart = (product, source = "search") => {
    // ✅ Bundle “product” comes from VehicleFitment as { isBundle:true, _bundle:{...} }
    if (product?.isBundle && product?._bundle) {
      const b = product._bundle;
      const parentCartId = crypto.randomUUID();

      const parentLine = {
        cartId: parentCartId,
        productId: `bundle:${b.id}`,
        name: b.name,
        price: Number(b.bundlePrice || 0),
        qty: 1,

        discountTotal: 0,
        serial: "",
        requiresSerial: false,

        source,
        isBundleParent: true,
        isBundleChild: false,
        parentCartId: null,
        bundleId: b.id,

        isLabor: false,
        priceEditable: false,
        laborMeta: null,
      };

      const childLines = (b.items || []).map((it) => {
        const prod = products.find((p) => p.id === it.productId);
        const requiresSerial =
          !!prod?.requiresSerial ||
          !!prod?.serialized ||
          !!prod?.trackSerials ||
          !!prod?.trackSerial;

        return {
          cartId: crypto.randomUUID(),
          productId: it.productId,
          name: prod?.name || `Item ${it.productId}`,
          price: 0,
          qty: Number(it.qty || 1),

          discountTotal: 0,
          serial: "",
          requiresSerial,

          source: "bundle",
          isBundleParent: false,
          isBundleChild: true,
          parentCartId: parentCartId,
          bundleId: b.id,

          isLabor: false,
          priceEditable: false,
          laborMeta: null,
        };
      });

      setCart((prev) => [...prev, parentLine, ...childLines]);
      return;
    }

    // ✅ Labor “product” (from search list injection below)
    if (product?.isLabor && product?._labor) {
      const row = product._labor;
      const defaultPrice = computeLaborDefaultPrice(row);

      const pricingModel = String(row.pricingModel || "flat");
      const hourlyRate = nnum(row.hourlyRate, 0);
      const defaultHours = nnum(row.defaultHours, 0);
      const flatAmount = nnum(row.flatAmount, 0);

      setCart((prev) => [
        ...prev,
        {
          cartId: crypto.randomUUID(),
          productId: `labor:${row.id}`,
          name: row.name || "Labor",
          price: Number(defaultPrice || 0),
          qty: 1,

          discountTotal: 0,
          serial: "",
          requiresSerial: false,

          source: "labor",
          isBundleParent: false,
          isBundleChild: false,
          parentCartId: null,
          bundleId: null,

          isLabor: true,
          priceEditable: true,
          laborMeta: {
            laborId: row.id,
            pricingModel: pricingModel === "hourly" ? "hourly" : "flat",
            hourlyRate,
            hours: pricingModel === "hourly" ? defaultHours : 0,
            flatAmount,
            taxable: !!row.taxable,
            commissionable: row.commissionable !== false,
          },
        },
      ]);

      if (source === "search") setSearch("");
      return;
    }

    // ✅ Labor SKU mode: add the chosen labor product but mark it as labor + editable
    if (product?.isLaborSku && laborSkuProduct) {
      setCart((prev) => [
        ...prev,
        {
          cartId: crypto.randomUUID(),
          productId: laborSkuProduct.id,
          name: laborSkuProduct.name || "Labor",
          price: Number(laborSkuProduct.price || 0),
          qty: 1,

          discountTotal: 0,
          serial: "",
          requiresSerial: false,

          source: "labor",
          isBundleParent: false,
          isBundleChild: false,
          parentCartId: null,
          bundleId: null,

          isLabor: true,
          priceEditable: true,
          laborMeta: {
            laborId: null,
            pricingModel: "sku",
            hourlyRate: 0,
            hours: 0,
            flatAmount: 0,
            taxable: false,
            commissionable: true,
          },
        },
      ]);

      if (source === "search") setSearch("");
      return;
    }

    // Normal product add
    setCart((prev) => [
      ...prev,
      {
        cartId: crypto.randomUUID(),
        productId: product.id,
        name: product.name,
        price: Number(product.price || 0),
        qty: 1,

        discountTotal: 0,

        serial: "",
        requiresSerial:
          !!product.requiresSerial ||
          !!product.serialized ||
          !!product.trackSerials ||
          !!product.trackSerial,

        source,
        isBundleParent: false,
        isBundleChild: false,
        parentCartId: null,
        bundleId: null,

        isLabor: false,
        priceEditable: false,
        laborMeta: null,
      },
    ]);
    if (source === "search") setSearch("");
  };

  const updateQty = (id, delta) => {
    setCart((prev) =>
      prev
        .map((i) => (i.cartId === id ? { ...i, qty: Number(i.qty || 0) + delta } : i))
        .filter((i) => Number(i.qty) > 0)
    );
  };

  const updateSerial = (id, serial) => {
    setCart((prev) => prev.map((i) => (i.cartId === id ? { ...i, serial } : i)));
  };

  const updatePrice = (id, price) => {
    setCart((prev) =>
      prev.map((i) =>
        i.cartId === id ? { ...i, price: nnum(price, 0) } : i
      )
    );
  };

  const removeItem = (id) => {
    setCart((prev) => {
      const target = prev.find((x) => x.cartId === id);
      if (!target) return prev;

      if (target.isBundleParent) {
        return prev.filter((x) => x.cartId !== id && x.parentCartId !== id);
      }

      return prev.filter((x) => x.cartId !== id);
    });
  };

  /* ================= TOTALS ================= */
  const subtotal = cart
    .filter((i) => !i.isBundleChild)
    .reduce((s, i) => s + Number(i.price || 0) * Number(i.qty || 0), 0);

  const taxRate = selectedCustomer?.type === "Wholesale" ? 0 : 0.095;
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  /* ================= HOLD ================= */
  const holdReceipt = async (print = false) => {
    if (!cart.length) return;

    if (!tenantId) {
      alert("No tenant selected. Please set up the terminal.");
      return;
    }

    const payload = {
      tenantId, // ✅ REQUIRED for rules
      cartItems: cart,
      customer: selectedCustomer ?? null,
      vehicle: selectedVehicle ?? null,
      installer: installer ?? null,
      installAt: installAt ?? null,
      subtotal,
      tax,
      total,

      // ✅ commission attribution (ADDED)
      commissionEmployeeId,
      commissionEmployeeName,

      status: "held",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const ref = await addDoc(collection(db, "heldReceipts"), payload);

    if (print) {
      localStorage.setItem("currentReceipt", JSON.stringify({ ...payload, id: ref.id }));
      window.location.href = "/print-receipt";
      return;
    }

    setCart([]);
    setSelectedCustomer(null);
    setSelectedVehicle(null);
    setInstaller(null);
    setInstallAt(null);
  };

  /* ================= ORDER FINALIZE ================= */
  const finalizeOrderWithInventory = async ({ payment, totals }) => {
    console.log("[SELL] finalizeOrderWithInventory START", { cartLen: cart?.length });

    if (!tenantId) {
      alert("No tenant selected. Please set up the terminal.");
      throw new Error("Checkout failed: missing tenantId.");
    }

    const normalizedCart = (cart || []).map((i) => ({
      ...i,
      qty: Number(i.qty),
      price: Number(i.price || 0),
      discountTotal: Number(i.discountTotal || 0),
      serial:
        typeof i.serial === "string"
          ? i.serial
          : i.serial
          ? String(i.serial)
          : "",
    }));

    const badQty = normalizedCart.filter((i) => !Number.isFinite(i.qty) || i.qty <= 0);
    if (badQty.length) {
      console.error("[SELL] Checkout blocked: invalid qty item(s):", badQty);
      alert("Checkout blocked: one or more items has invalid quantity.");
      throw new Error("Checkout failed: cart has item(s) with invalid qty.");
    }

    const missingSerial = normalizedCart.filter(
      (i) => i.requiresSerial && !String(i.serial || "").trim()
    );
    if (missingSerial.length) {
      console.warn("[SELL] Checkout blocked: missing serial(s):", missingSerial);
      alert(
        "One or more items require a serial number. Scan the serial into the cart before checkout."
      );
      throw new Error("Checkout failed: missing required serial number(s).");
    }

    const customerName =
      selectedCustomer?.companyName ||
      `${selectedCustomer?.firstName || ""} ${selectedCustomer?.lastName || ""}`.trim() ||
      "";
    const customerPhone = selectedCustomer?.phone || "";

    const seq = await getNextCounter("orders");
    const orderNumber = formatOrderNumber(seq);

    console.log("[SELL] creating order doc...");
    const orderRef = await addDoc(collection(db, "orders"), {
      tenantId, // ✅ REQUIRED for rules
      orderNumber,
      orderSeq: seq,

      customerId: selectedCustomer?.id || null,
      customerName,
      customerPhone,

      vehicle: selectedVehicle || null,
      installerId: installer?.id || null,
      installAt: installAt || null,

      // ✅ commission attribution (ADDED)
      commissionEmployeeId,
      commissionEmployeeName,

      payment,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,

      cartItems: normalizedCart,

      status: "OPEN",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    console.log("[SELL] order created:", orderRef.id, orderNumber);

    // ✅ Inventory lines:
    // - exclude bundle parents
    // - exclude labor lines (catalog + sku)
    const inventoryLines = normalizedCart.filter(
      (i) =>
        !i.isBundleParent &&
        !i.isLabor &&
        !String(i.productId || "").startsWith("labor:")
    );

    for (const cartItem of inventoryLines) {
      const product = products.find((p) => p.id === cartItem.productId);
      if (!product) continue;

      console.log("[SELL] processOrderItem START", {
        orderId: orderRef.id,
        productId: product.id,
        qty: cartItem.qty,
        serial: cartItem.serial || "",
        bundle: cartItem.isBundleChild ? cartItem.bundleId : null,
      });

      await processOrderItem({
        orderId: orderRef.id,
        product,
        quantity: Number(cartItem.qty || 0),
        unitPrice: Number(cartItem.price || 0),
        discountTotal: Number(cartItem.discountTotal || 0),
        taxable: true,
        serial: String(cartItem.serial || "").trim(),
      });

      console.log("[SELL] processOrderItem DONE", { productId: product.id });
    }

    await updateDoc(doc(db, "orders", orderRef.id), {
      updatedAt: serverTimestamp(),
    });

    console.log("[SELL] finalizeOrderWithInventory DONE", orderRef.id);
    return orderRef.id;
  };

  /* ================= SEARCH SUGGESTIONS (PRODUCTS + LABOR) ================= */
  const searchSuggestions = useMemo(() => {
    const s = String(search || "").trim().toLowerCase();
    if (!s) return [];

    const out = [];

    // Labor SKU quick option
    if (laborMode === "sku" && laborSkuProduct && "labor".includes(s)) {
      out.push({
        id: "__labor_sku__",
        name: `${laborSkuProduct.name || "Labor"} (Labor)`,
        price: Number(laborSkuProduct.price || 0),
        isLaborSku: true,
      });
    }

    // Labor catalog options
    if (laborMode === "catalog") {
      const matchesLabor =
        s === "l" ||
        s === "la" ||
        s === "lab" ||
        s === "labo" ||
        s === "labor" ||
        s.includes("labor");

      const laborRows =
        matchesLabor
          ? laborCatalog
          : laborCatalog.filter((r) =>
              String(r.name || "").toLowerCase().includes(s)
            );

      laborRows.slice(0, 8).forEach((r) => {
        out.push({
          id: `labor:${r.id}`,
          name: `${r.name} (Labor)`,
          price: computeLaborDefaultPrice(r),
          isLabor: true,
          _labor: r,
        });
      });
    }

    // Normal products
    products
      .filter((p) => `${p.name} ${p.sku || ""}`.toLowerCase().includes(s))
      .slice(0, 25)
      .forEach((p) => out.push(p));

    return out;
  }, [search, products, laborMode, laborSkuProduct, laborCatalog]);

  /* ================= UI ================= */
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* LEFT */}
      <VehicleFitment
        products={products}
        bundles={bundles}
        selectedVehicle={selectedVehicle}
        onVehicleSelected={setSelectedVehicle}
        onAddProduct={(p) => addToCart(p, p.isBundle ? "bundle" : "fitment")}
      />

      {/* RIGHT */}
      <div className="bg-app-panel dark:bg-app-panel p-4 rounded-xl shadow border flex flex-col">
        {/* ✅ COMMISSION EMPLOYEE (ADDED) */}
        <div className="flex items-center gap-2 mb-2">
          <div className="text-sm font-semibold whitespace-nowrap">
            Commission Employee:
          </div>

          <select
            value={selectedEmployeeId}
            onChange={(e) => setSelectedEmployeeId(e.target.value)}
            className="h-10 px-2 rounded-lg border flex-1"
          >
            {employees.length === 0 ? (
              <option value="">No employees found</option>
            ) : (
              employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name || e.displayName || e.email || e.id}
                </option>
              ))
            )}
          </select>

          {!!posAccount?.id && (
            <button
              type="button"
              onClick={() => setSelectedEmployeeId(posAccount.id)}
              className="px-3 h-10 rounded-lg border border-app-border bg-app-panel dark:bg-app-panel text-app-text hover:bg-slate-50 dark:hover:bg-white/10 text-sm font-semibold whitespace-nowrap"
            >
              Use PIN
            </button>
          )}
        </div>

        {/* CUSTOMER + HELD */}
        <div className="flex gap-2 mb-2">
          <div className="flex-1">
            {!selectedCustomer ? (
              <>
                <div className="flex gap-2">
                  <input
                    placeholder="Search customer…"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border"
                  />

                  <button
                    type="button"
                    onClick={() => setAddCustomerOpen(true)}
                    className="px-3 h-10 rounded-lg border border-app-border bg-app-panel dark:bg-app-panel text-app-text hover:bg-slate-50 dark:hover:bg-white/10 text-sm font-semibold whitespace-nowrap"
                  >
                    + Add Customer
                  </button>
                </div>

                {customerSearch && (
                  <div className="border rounded-lg mt-1 max-h-40 overflow-y-auto bg-app-panel dark:bg-app-panel">
                    {customers
                      .filter((c) =>
                        `${c.firstName || ""} ${c.lastName || ""} ${c.companyName || ""} ${
                          c.phone || ""
                        }`
                          .toLowerCase()
                          .includes(customerSearch.toLowerCase())
                      )
                      .map((c) => (
                        <div
                          key={c.id}
                          onMouseDown={() => {
                            setSelectedCustomer(c);
                            setCustomerSearch("");
                          }}
                          className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                        >
                          <strong>
                            {c.companyName || `${c.firstName || ""} ${c.lastName || ""}`}
                          </strong>
                          {c.phone && <div className="text-xs text-gray-500">{c.phone}</div>}
                        </div>
                      ))}
                  </div>
                )}
              </>
            ) : (
              <div className="flex justify-between items-center bg-gray-100 px-3 py-2 rounded-lg">
                <span className="font-semibold text-sm">
                  {selectedCustomer.companyName ||
                    `${selectedCustomer.firstName || ""} ${selectedCustomer.lastName || ""}`}
                </span>
                <button onClick={() => setSelectedCustomer(null)} className="text-xs text-red-600">
                  Clear
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => navigate("/held-receipts")}
            className="relative px-4 py-1.5 rounded-md border bg-gray-50 hover:bg-gray-100 text-sm font-semibold"
          >
            Held
            {heldCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full">
                {heldCount}
              </span>
            )}
          </button>
        </div>

        {/* INSTALLER + APPOINTMENT */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <select
            value={installer?.id || ""}
            onChange={(e) =>
              setInstaller(installers.find((i) => i.id === e.target.value) || null)
            }
            className="h-10 px-2 rounded-lg border"
          >
            <option value="">Select installer…</option>
            {installers.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>

          <input
            type="datetime-local"
            value={installAt || ""}
            onChange={(e) => setInstallAt(e.target.value)}
            className="h-10 px-2 rounded-lg border"
          />
        </div>

        {/* PRODUCT SEARCH */}
        <input
          placeholder="Search or scan product…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-11 px-3 rounded-lg border"
        />

        {search && (
          <div className="border rounded-lg mt-1 max-h-40 overflow-y-auto">
            {searchSuggestions.map((p) => {
              const isLaborRow = !!p.isLabor || !!p.isLaborSku;
              const key = p.id || p.productId || p.name;

              return (
                <div
                  key={key}
                  onMouseDown={() => addToCart(p)}
                  className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                >
                  <strong>{p.name}</strong>
                  <div className="text-xs text-gray-500">
                    ${Number(p.price || 0).toFixed(2)}
                    {isLaborRow ? " • editable" : ""}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* CART */}
        <div className="flex-1 mt-4 overflow-y-auto">
          {cart.map((i) => (
            <div key={i.cartId} className="border-b py-2 flex justify-between text-sm">
              <div className="flex flex-col">
                <span>
                  {i.name}
                  {i.isBundleParent ? " (Bundle)" : ""}
                  {i.isLabor ? " (Labor)" : ""}
                </span>

                {/* ✅ Labor price override (Option 2) */}
                {i.isLabor && i.priceEditable && (
                  <input
                    value={String(i.price ?? "")}
                    onChange={(e) => updatePrice(i.cartId, e.target.value)}
                    placeholder="Labor price"
                    className="mt-1 h-9 px-2 rounded border text-xs w-64"
                  />
                )}

                {/* Serial input (unchanged behavior) */}
                {!i.isLabor && (
                  <input
                    value={i.serial || ""}
                    onChange={(e) => updateSerial(i.cartId, e.target.value)}
                    placeholder={
                      i.requiresSerial ? "Scan serial # (required)" : "Scan serial # (optional)"
                    }
                    className="mt-1 h-9 px-2 rounded border text-xs w-64"
                  />
                )}
              </div>

              <div className="flex items-center gap-2">
                <button onClick={() => updateQty(i.cartId, -1)}>-</button>
                <span>{i.qty}</span>
                <button onClick={() => updateQty(i.cartId, 1)}>+</button>
                <span>${(Number(i.price || 0) * Number(i.qty || 0)).toFixed(2)}</span>
                <button onClick={() => removeItem(i.cartId)} className="text-red-600">
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* TOTALS */}
        <div className="border-t pt-3 space-y-2">
          <div className="flex justify-between font-semibold">
            <span>Subtotal</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              disabled={!cart.length}
              onClick={() => holdReceipt(false)}
              className="bg-orange-500 hover:bg-orange-600 text-white py-2 rounded font-semibold"
            >
              Hold
            </button>

            <button
              disabled={!cart.length}
              onClick={() => holdReceipt(true)}
              className="bg-brand-primary hover:bg-brand-primary/90 text-white py-2 rounded font-semibold"
            >
              Print
            </button>
          </div>

          <button
            disabled={!cart.length}
            onClick={() => setCheckoutOpen(true)}
            className="w-full bg-brand-accent hover:bg-brand-accent/90 text-white py-3 rounded-lg font-semibold"
          >
            Checkout
          </button>
        </div>
      </div>

      {/* ADD CUSTOMER MODAL */}
      {addCustomerOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="w-[720px] max-w-[94vw] bg-app-panel dark:bg-app-panel rounded-xl shadow-xl border p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-bold">Add Customer</div>
                <div className="text-sm text-slate-600">
                  Creates a customer and auto-selects them for this sale.
                </div>
              </div>
              <button
                className="px-3 py-2 rounded-lg border hover:bg-slate-50 dark:hover:bg-white/10"
                onClick={() => setAddCustomerOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              <div>
                <div className="text-xs font-bold text-slate-600 mb-1">Type</div>
                <select
                  value={newCust.type}
                  onChange={(e) => setNewCust((p) => ({ ...p, type: e.target.value }))}
                  className="w-full h-11 px-3 rounded-lg border"
                >
                  <option value="Retail">Retail</option>
                  <option value="Wholesale">Wholesale</option>
                </select>
              </div>

              <div>
                <div className="text-xs font-bold text-slate-600 mb-1">Phone</div>
                <input
                  value={newCust.phone}
                  onChange={(e) => setNewCust((p) => ({ ...p, phone: e.target.value }))}
                  className="w-full h-11 px-3 rounded-lg border"
                  placeholder="(555) 555-5555"
                />
              </div>

              <div>
                <div className="text-xs font-bold text-slate-600 mb-1">First Name</div>
                <input
                  value={newCust.firstName}
                  onChange={(e) => setNewCust((p) => ({ ...p, firstName: e.target.value }))}
                  className="w-full h-11 px-3 rounded-lg border"
                />
              </div>

              <div>
                <div className="text-xs font-bold text-slate-600 mb-1">Last Name</div>
                <input
                  value={newCust.lastName}
                  onChange={(e) => setNewCust((p) => ({ ...p, lastName: e.target.value }))}
                  className="w-full h-11 px-3 rounded-lg border"
                />
              </div>

              <div className="md:col-span-2">
                <div className="text-xs font-bold text-slate-600 mb-1">Company</div>
                <input
                  value={newCust.companyName}
                  onChange={(e) => setNewCust((p) => ({ ...p, companyName: e.target.value }))}
                  className="w-full h-11 px-3 rounded-lg border"
                  placeholder="Optional"
                />
              </div>

              <div className="md:col-span-2">
                <div className="text-xs font-bold text-slate-600 mb-1">Email</div>
                <input
                  value={newCust.email}
                  onChange={(e) => setNewCust((p) => ({ ...p, email: e.target.value }))}
                  className="w-full h-11 px-3 rounded-lg border"
                  placeholder="Optional"
                />
              </div>

              <div className="md:col-span-2">
                <div className="text-xs font-bold text-slate-600 mb-1">Notes</div>
                <input
                  value={newCust.notes}
                  onChange={(e) => setNewCust((p) => ({ ...p, notes: e.target.value }))}
                  className="w-full h-11 px-3 rounded-lg border"
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded-lg border hover:bg-slate-50 dark:hover:bg-white/10"
                onClick={() => setAddCustomerOpen(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-brand-accent hover:bg-brand-accent/90 text-white font-semibold"
                onClick={createCustomerQuick}
              >
                Save Customer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CHECKOUT MODAL */}
      <CheckoutModal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        subtotal={subtotal}
        taxRate={taxRate}
        cartItems={cart}
        products={products}
        selectedCustomerId={selectedCustomer?.id || null}
        onCompletePayment={async ({ payment, totals }) => {
          console.log("[SELL] onCompletePayment FIRED", { totals, cartLen: cart?.length });

          try {
            const orderId = await finalizeOrderWithInventory({ payment, totals });

            const receipt = {
              orderId,
              cartItems: cart,
              customer: selectedCustomer ?? null,
              vehicle: selectedVehicle ?? null,
              installer: installer ?? null,
              installAt: installAt ?? null,
              payment,
              subtotal: totals.subtotal,
              tax: totals.tax,
              total: totals.total,

              // ✅ include attribution on receipt too (ADDED)
              commissionEmployeeId,
              commissionEmployeeName,
            };

            localStorage.setItem("currentReceipt", JSON.stringify(receipt));

            setCheckoutOpen(false);
            setCart([]);
            setSelectedCustomer(null);
            setSelectedVehicle(null);
            setInstaller(null);
            setInstallAt(null);

            window.location.href = "/print-receipt";
          } catch (err) {
            console.error("[SELL] Checkout failed:", err);
            alert("Checkout failed. Inventory was NOT finalized. See console for details.");
          }
        }}
      ></CheckoutModal>
    </div>
  );
}








