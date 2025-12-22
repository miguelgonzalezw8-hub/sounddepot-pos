import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import VehicleFitment from "../components/VehicleFitment";
import CheckoutModal from "../components/CheckoutModal";
import { db } from "../firebase";

import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

export default function Sell() {
  const navigate = useNavigate();

  /* ================= STATE ================= */
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [installer, setInstaller] = useState(null);

  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [installers, setInstallers] = useState([]);

  const [search, setSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");

  const [cart, setCart] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const [heldCount, setHeldCount] = useState(0);

  /* ================= LOAD DATA ================= */
  useEffect(() => {
    return onSnapshot(
      query(collection(db, "products"), where("active", "==", true)),
      (snap) => setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, "customers"), snap =>
      setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, "installers"), snap =>
      setInstallers(
        snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(i => i.active)
      )
    );
  }, []);
useEffect(() => {
  window.__ALL_PRODUCTS__ = products;
}, [products]);

  /* ================= HELD RECEIPTS COUNT ================= */
  useEffect(() => {
    return onSnapshot(collection(db, "heldReceipts"), snap =>
      setHeldCount(snap.size)
    );
  }, []);

  /* ================= RESUME HELD RECEIPT ================= */
  useEffect(() => {
    const resume = sessionStorage.getItem("resumeReceipt");
    if (!resume) return;

    const data = JSON.parse(resume);
    setCart(data.cartItems || []);
    setSelectedCustomer(data.customer || null);
    setSelectedVehicle(data.vehicle || null);
    setInstaller(data.installer || null);

    sessionStorage.removeItem("resumeReceipt");
  }, []);

  /* ================= HELPERS ================= */
  const heldBadgeColor =
    heldCount >= 4
      ? "bg-red-600"
      : heldCount > 0
      ? "bg-amber-500"
      : "bg-gray-400";

  /* ================= FILTERS ================= */
  const filteredProducts =
    search.trim() === ""
      ? []
      : products.filter(p =>
          `${p.name} ${p.sku || ""} ${p.barcode || ""}`
            .toLowerCase()
            .includes(search.toLowerCase())
        );

  const filteredCustomers =
    customerSearch.trim() === ""
      ? []
      : customers.filter(c =>
          `${c.firstName || ""} ${c.lastName || ""} ${c.phone || ""} ${c.email || ""}`
            .toLowerCase()
            .includes(customerSearch.toLowerCase())
        );

  /* ================= CART ================= */
  const addToCart = (product, source = "search") => {
    setCart(prev => [
      ...prev,
      {
        cartId: crypto.randomUUID(),
        productId: product.id,
        name: product.name,
        price: Number(product.price || 0),
        qty: 1,
        source,
      },
    ]);
    if (source === "search") setSearch("");
  };

  const updateQty = (id, delta) => {
    setCart(prev =>
      prev
        .map(i => (i.cartId === id ? { ...i, qty: i.qty + delta } : i))
        .filter(i => i.qty > 0)
    );
  };

  const removeItem = (id) =>
    setCart(prev => prev.filter(i => i.cartId !== id));

  /* ================= TOTALS ================= */
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
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
  };

  /* ================= CHECKOUT ================= */
  const completeSale = async (checkoutData) => {
    const payload = {
      status: "completed",
      createdAt: serverTimestamp(),
      customer: selectedCustomer,
      vehicle: selectedVehicle,
      installer,
      items: cart,
      totals: checkoutData.totals,
      payment: checkoutData.payment,
    };

    const ref = await addDoc(collection(db, "sales"), payload);

    localStorage.setItem(
      "currentReceipt",
      JSON.stringify({ ...payload, id: ref.id })
    );

    setCart([]);
    setInstaller(null);
    setCheckoutOpen(false);
    window.location.href = "/print-receipt";
  };

  /* ================= UI ================= */
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <VehicleFitment
  products={products}
  onVehicleSelected={setSelectedVehicle}
  onAddProduct={(p) => addToCart(p, "fitment")}
/>


      <div className="bg-white p-4 rounded-xl shadow border flex flex-col">

        {/* HELD RECEIPTS BUTTON */}
        <div className="flex justify-end mb-2">
          <button
            onClick={() => navigate("/held-receipts")}
            className="relative px-4 py-1.5 rounded-md border bg-gray-50 hover:bg-gray-100 text-sm font-semibold"
          >
            Held Receipts
            {heldCount > 0 && (
              <span
                className={`absolute -top-2 -right-2 ${heldBadgeColor} text-white text-xs w-5 h-5 flex items-center justify-center rounded-full`}
              >
                {heldCount}
              </span>
            )}
          </button>
        </div>

        {/* SEARCH */}
        <input
          placeholder="Search or scan product…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-11 px-3 rounded-lg border"
        />

        {search && (
          <div className="border rounded-lg mt-1 max-h-40 overflow-y-auto">
            {filteredProducts.map(p => (
              <div
                key={p.id}
                onMouseDown={() => addToCart(p)}
                className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
              >
                <strong>{p.name}</strong>
                <div className="text-xs text-gray-500">
                  ${Number(p.price).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CUSTOMER */}
        <div className="mt-4 border rounded-lg p-3 bg-gray-50">
          {!selectedCustomer ? (
            <>
              <input
                placeholder="Search customer…"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="w-full h-10 px-3 rounded border"
              />
              {filteredCustomers.length > 0 && (
                <div className="border rounded mt-1 max-h-32 overflow-y-auto">
                  {filteredCustomers.map(c => (
                    <div
                      key={c.id}
                      onMouseDown={() => {
                        setSelectedCustomer(c);
                        setCustomerSearch("");
                      }}
                      className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                    >
                      {c.firstName} {c.lastName}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex justify-between text-sm">
              <strong>{selectedCustomer.firstName} {selectedCustomer.lastName}</strong>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="text-red-600 text-xs"
              >
                Remove
              </button>
            </div>
          )}
        </div>

        {/* INSTALLER */}
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="font-semibold">Installer</span>
          <select
            value={installer?.id || ""}
            onChange={(e) =>
              setInstaller(installers.find(i => i.id === e.target.value) || null)
            }
            className="flex-1 border px-2 py-1 rounded"
          >
            <option value="">Unassigned</option>
            {installers.map(i => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
        </div>

        {/* CART */}
        <div className="flex-1 mt-4 overflow-y-auto">
          {cart.map(i => (
            <div key={i.cartId} className="border-b py-2 flex justify-between text-sm">
              <span>{i.name}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => updateQty(i.cartId, -1)}>-</button>
                <span>{i.qty}</span>
                <button onClick={() => updateQty(i.cartId, 1)}>+</button>
                <span>${(i.price * i.qty).toFixed(2)}</span>
                <button onClick={() => removeItem(i.cartId)} className="text-red-600">✕</button>
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

      <CheckoutModal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        subtotal={subtotal}
        taxRate={taxRate}
        onCompletePayment={completeSale}
      />
    </div>
  );
}
