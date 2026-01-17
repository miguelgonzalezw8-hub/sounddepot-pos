// client/src/pages/Sell.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import VehicleFitment from "../components/VehicleFitment";
import CheckoutModal from "../components/CheckoutModal";
import { db } from "../firebase";
import { processOrderItem } from "../services/orderService";
import { getNextCounter, formatOrderNumber } from "../utils/counters";

import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";

export default function Sell() {
  const navigate = useNavigate();

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
    const payload = {
      type: newCust.type || "Retail",
      firstName: (newCust.firstName || "").trim(),
      lastName: (newCust.lastName || "").trim(),
      companyName: (newCust.companyName || "").trim(),
      phone: (newCust.phone || "").trim(),
      email: (newCust.email || "").trim(),
      notes: (newCust.notes || "").trim(),
      active: true,
      createdAt: serverTimestamp(),
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

  /* ================= ORDER FINALIZE ================= */
  const finalizeOrderWithInventory = async ({ payment, totals }) => {
    console.log("[SELL] finalizeOrderWithInventory START", { cartLen: cart?.length });

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

    const badQty = normalizedCart.filter(
      (i) => !Number.isFinite(i.qty) || i.qty <= 0
    );
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

    // ✅ clean order number (SD-000123)
    const seq = await getNextCounter("orders");
    const orderNumber = formatOrderNumber(seq);

    console.log("[SELL] creating order doc...");
    const orderRef = await addDoc(collection(db, "orders"), {
      orderNumber,
      orderSeq: seq,

      customerId: selectedCustomer?.id || null,
      customerName,
      customerPhone,

      vehicle: selectedVehicle || null,
      installerId: installer?.id || null,
      installAt: installAt || null,

      payment,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,

      status: "OPEN",
      createdAt: serverTimestamp(),
    });

    console.log("[SELL] order created:", orderRef.id, orderNumber);

    // Process each item through service (service creates backorder docs + marks sold)
    for (const cartItem of normalizedCart) {
      const product = products.find((p) => p.id === cartItem.productId);
      if (!product) continue;

      console.log("[SELL] processOrderItem START", {
        orderId: orderRef.id,
        productId: product.id,
        qty: cartItem.qty,
        serial: cartItem.serial || "",
      });

      await processOrderItem({
        orderId: orderRef.id,
        product,

        quantity: Number(cartItem.qty || 0),

        unitPrice: Number(cartItem.price || 0),
        discountTotal: Number(cartItem.discountTotal || 0),
        taxable: true,

        serial: String(cartItem.serial || "").trim(),

        // (service no longer uses window.confirm in your latest logic)
      });

      console.log("[SELL] processOrderItem DONE", { productId: product.id });
    }

    // Order status updated by service updateOrderStatus(), but keep a safe final update:
    await updateDoc(doc(db, "orders", orderRef.id), {
      updatedAt: serverTimestamp(),
    });

    console.log("[SELL] finalizeOrderWithInventory DONE", orderRef.id);
    return orderRef.id;
  };

  /* ================= LOAD DATA ================= */
  useEffect(() => {
    return onSnapshot(
      query(collection(db, "products"), where("active", "==", true)),
      (snap) => setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, "customers"), (snap) =>
      setCustomers(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, "installers"), (snap) =>
      setInstallers(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((i) => i.active)
      )
    );
  }, []);

  /* ================= HELD COUNT ================= */
  useEffect(() => {
    return onSnapshot(collection(db, "heldReceipts"), (snap) =>
      setHeldCount(snap.size)
    );
  }, []);

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

  /* ================= CART ================= */
  const addToCart = (product, source = "search") => {
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
      },
    ]);
    if (source === "search") setSearch("");
  };

  const updateQty = (id, delta) => {
    setCart((prev) =>
      prev
        .map((i) =>
          i.cartId === id ? { ...i, qty: Number(i.qty || 0) + delta } : i
        )
        .filter((i) => Number(i.qty) > 0)
    );
  };

  const updateSerial = (id, serial) => {
    setCart((prev) => prev.map((i) => (i.cartId === id ? { ...i, serial } : i)));
  };

  const removeItem = (id) => setCart((prev) => prev.filter((i) => i.cartId !== id));

  /* ================= TOTALS ================= */
  const subtotal = cart.reduce(
    (s, i) => s + Number(i.price || 0) * Number(i.qty || 0),
    0
  );
  const taxRate = selectedCustomer?.type === "Wholesale" ? 0 : 0.095;
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  /* ================= HOLD ================= */
  const holdReceipt = async (print = false) => {
    if (!cart.length) return;

    const payload = {
      cartItems: cart,
      customer: selectedCustomer ?? null,
      vehicle: selectedVehicle ?? null,
      installer: installer ?? null,
      installAt: installAt ?? null,
      subtotal,
      tax,
      total,
      status: "held",
      createdAt: serverTimestamp(),
    };

    const ref = await addDoc(collection(db, "heldReceipts"), payload);

    if (print) {
      localStorage.setItem(
        "currentReceipt",
        JSON.stringify({ ...payload, id: ref.id })
      );
      window.location.href = "/print-receipt";
      return;
    }

    setCart([]);
    setSelectedCustomer(null);
    setSelectedVehicle(null);
    setInstaller(null);
    setInstallAt(null);
  };

  /* ================= UI ================= */
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* LEFT */}
      <VehicleFitment
        products={products}
        selectedVehicle={selectedVehicle}
        onVehicleSelected={setSelectedVehicle}
        onAddProduct={(p) => addToCart(p, "fitment")}
      />

      {/* RIGHT */}
      <div className="bg-white p-4 rounded-xl shadow border flex flex-col">
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

                  {/* ✅ Add Customer restored */}
                  <button
                    type="button"
                    onClick={() => setAddCustomerOpen(true)}
                    className="px-3 h-10 rounded-lg border bg-white hover:bg-slate-50 text-sm font-semibold whitespace-nowrap"
                  >
                    + Add Customer
                  </button>
                </div>

                {customerSearch && (
                  <div className="border rounded-lg mt-1 max-h-40 overflow-y-auto bg-white">
                    {customers
                      .filter((c) =>
                        `${c.firstName || ""} ${c.lastName || ""} ${
                          c.companyName || ""
                        } ${c.phone || ""}`
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
                            {c.companyName ||
                              `${c.firstName || ""} ${c.lastName || ""}`}
                          </strong>
                          {c.phone && (
                            <div className="text-xs text-gray-500">{c.phone}</div>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </>
            ) : (
              <div className="flex justify-between items-center bg-gray-100 px-3 py-2 rounded-lg">
                <span className="font-semibold text-sm">
                  {selectedCustomer.companyName ||
                    `${selectedCustomer.firstName || ""} ${
                      selectedCustomer.lastName || ""
                    }`}
                </span>
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="text-xs text-red-600"
                >
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
            {products
              .filter((p) =>
                `${p.name} ${p.sku || ""}`.toLowerCase().includes(search.toLowerCase())
              )
              .map((p) => (
                <div
                  key={p.id}
                  onMouseDown={() => addToCart(p)}
                  className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                >
                  <strong>{p.name}</strong>
                  <div className="text-xs text-gray-500">
                    ${Number(p.price || 0).toFixed(2)}
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* CART */}
        <div className="flex-1 mt-4 overflow-y-auto">
          {cart.map((i) => (
            <div key={i.cartId} className="border-b py-2 flex justify-between text-sm">
              <div className="flex flex-col">
                <span>{i.name}</span>

                {/* Serial number scan bar */}
                <input
                  value={i.serial || ""}
                  onChange={(e) => updateSerial(i.cartId, e.target.value)}
                  placeholder={
                    i.requiresSerial ? "Scan serial # (required)" : "Scan serial # (optional)"
                  }
                  className="mt-1 h-9 px-2 rounded border text-xs w-64"
                />
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
              className="bg-blue-600 hover:bg-blue-700 text-white py-2 rounded font-semibold"
            >
              Print
            </button>
          </div>

          <button
            disabled={!cart.length}
            onClick={() => setCheckoutOpen(true)}
            className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-semibold"
          >
            Checkout
          </button>
        </div>
      </div>

      {/* ✅ ADD CUSTOMER MODAL (in-app style) */}
      {addCustomerOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="w-[720px] max-w-[94vw] bg-white rounded-xl shadow-xl border p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-bold">Add Customer</div>
                <div className="text-sm text-slate-600">
                  Creates a customer and auto-selects them for this sale.
                </div>
              </div>
              <button
                className="px-3 py-2 rounded-lg border hover:bg-slate-50"
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
                  onChange={(e) =>
                    setNewCust((p) => ({ ...p, firstName: e.target.value }))
                  }
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
                  onChange={(e) =>
                    setNewCust((p) => ({ ...p, companyName: e.target.value }))
                  }
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
                className="px-4 py-2 rounded-lg border hover:bg-slate-50"
                onClick={() => setAddCustomerOpen(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
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
      />
    </div>
  );
}
