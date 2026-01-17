// client/src/pages/MasterSearch.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { collection, onSnapshot, orderBy, limit, query } from "firebase/firestore";

function norm(s) {
  return String(s || "").toLowerCase().trim();
}

function includesAny(hay, q) {
  if (!q) return false;
  return norm(hay).includes(q);
}

export default function MasterSearch() {
  const navigate = useNavigate();

  const [term, setTerm] = useState("");

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [backorders, setBackorders] = useState([]);

  useEffect(() => {
    const unsub1 = onSnapshot(
      query(collection(db, "customers"), orderBy("createdAt", "desc"), limit(400)),
      (snap) => setCustomers(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );

    const unsub2 = onSnapshot(
      query(collection(db, "products"), orderBy("createdAt", "desc"), limit(400)),
      (snap) => setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );

    const unsub3 = onSnapshot(
      query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(600)),
      (snap) => setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );

    const unsub4 = onSnapshot(
      query(collection(db, "backorders"), orderBy("createdAt", "desc"), limit(600)),
      (snap) => setBackorders(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, []);

  const q = useMemo(() => norm(term), [term]);

  const results = useMemo(() => {
    if (!q) {
      return { customers: [], products: [], orders: [], backorders: [] };
    }

    const cust = customers
      .filter((c) => {
        const blob = `${c.companyName || ""} ${c.firstName || ""} ${c.lastName || ""} ${c.phone || ""} ${c.email || ""}`;
        return includesAny(blob, q);
      })
      .slice(0, 25);

    const prod = products
      .filter((p) => {
        const blob = `${p.name || ""} ${p.sku || ""}`;
        return includesAny(blob, q);
      })
      .slice(0, 25);

    const ord = orders
      .filter((o) => {
        const blob = `${o.orderNumber || ""} ${o.customerName || ""} ${o.customerPhone || ""} ${o.status || ""} ${o.total || ""}`;
        return includesAny(blob, q);
      })
      .slice(0, 25);

    const bo = backorders
      .filter((b) => {
        const blob = `${b.orderNumber || ""} ${b.orderId || ""} ${b.customerName || ""} ${b.customerPhone || ""} ${b.productName || ""} ${b.sku || ""} ${b.status || ""}`;
        return includesAny(blob, q);
      })
      .slice(0, 25);

    return { customers: cust, products: prod, orders: ord, backorders: bo };
  }, [q, customers, products, orders, backorders]);

  return (
    <div className="inventory-container">
      <div className="flex items-center justify-between mb-3">
        <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">
          Master Search
        </div>

        <button
          onClick={() => navigate("/")}
          className="px-3 py-2 rounded-lg border bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-sm font-semibold"
        >
          ← Dashboard
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 border rounded-xl shadow-sm p-4">
        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
          Search orders, customers, products, backorders
        </div>
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder='Try: "SD-000123", "C1-650", "256", "John", "Backorder"…'
          className="w-full h-11 px-3 rounded-lg border bg-white dark:bg-slate-950 dark:text-slate-100"
        />

        {!q && (
          <div className="mt-3 text-sm text-slate-500">
            Start typing to see results grouped by type.
          </div>
        )}
      </div>

      {q && (
        <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Orders */}
          <div className="bg-white dark:bg-slate-900 border rounded-xl shadow-sm p-4">
            <div className="text-sm font-bold mb-3 text-slate-700 dark:text-slate-200">
              Orders ({results.orders.length})
            </div>

            {results.orders.length === 0 ? (
              <div className="text-sm text-slate-500">No matches.</div>
            ) : (
              <div className="space-y-2">
                {results.orders.map((o) => (
                  <button
                    key={o.id}
                    className="w-full text-left px-3 py-2 rounded-lg border hover:bg-slate-50 dark:hover:bg-slate-800"
                    onClick={() => {
                      // If you later add OrderDetail, route it here.
                      // For now, just jump to Reports Backorders/Sales Summary, or keep it as a “read” future feature.
                      navigate("/reports/sales-summary");
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">
                        {o.orderNumber || o.id}
                      </div>
                      <div className="text-xs text-slate-500">
                        {o.status || ""}
                      </div>
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-300">
                      {o.customerName || "No customer"} • ${(Number(o.total || 0)).toFixed(2)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Customers */}
          <div className="bg-white dark:bg-slate-900 border rounded-xl shadow-sm p-4">
            <div className="text-sm font-bold mb-3 text-slate-700 dark:text-slate-200">
              Customers ({results.customers.length})
            </div>

            {results.customers.length === 0 ? (
              <div className="text-sm text-slate-500">No matches.</div>
            ) : (
              <div className="space-y-2">
                {results.customers.map((c) => (
                  <button
                    key={c.id}
                    className="w-full text-left px-3 py-2 rounded-lg border hover:bg-slate-50 dark:hover:bg-slate-800"
                    onClick={() => navigate(`/customers/${c.id}`)}
                  >
                    <div className="font-semibold">
                      {c.companyName ||
                        `${c.firstName || ""} ${c.lastName || ""}`.trim() ||
                        "Unnamed Customer"}
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-300">
                      {c.phone || ""} {c.email ? `• ${c.email}` : ""}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Products */}
          <div className="bg-white dark:bg-slate-900 border rounded-xl shadow-sm p-4">
            <div className="text-sm font-bold mb-3 text-slate-700 dark:text-slate-200">
              Products ({results.products.length})
            </div>

            {results.products.length === 0 ? (
              <div className="text-sm text-slate-500">No matches.</div>
            ) : (
              <div className="space-y-2">
                {results.products.map((p) => (
                  <button
                    key={p.id}
                    className="w-full text-left px-3 py-2 rounded-lg border hover:bg-slate-50 dark:hover:bg-slate-800"
                    onClick={() => navigate(`/inventory/product/${p.id}`)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">{p.name || "Unnamed Product"}</div>
                      <div className="text-xs text-slate-500">{p.sku || ""}</div>
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-300">
                      ${(Number(p.price || 0)).toFixed(2)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Backorders */}
          <div className="bg-white dark:bg-slate-900 border rounded-xl shadow-sm p-4">
            <div className="text-sm font-bold mb-3 text-slate-700 dark:text-slate-200">
              Backorders ({results.backorders.length})
            </div>

            {results.backorders.length === 0 ? (
              <div className="text-sm text-slate-500">No matches.</div>
            ) : (
              <div className="space-y-2">
                {results.backorders.map((b) => (
                  <button
                    key={b.id}
                    className="w-full text-left px-3 py-2 rounded-lg border hover:bg-slate-50 dark:hover:bg-slate-800"
                    onClick={() => navigate("/backorders")}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">
                        {b.orderNumber || b.orderId || "Backorder"}
                      </div>
                      <div className="text-xs text-slate-500">{b.status || ""}</div>
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-300">
                      {b.productName || b.sku || "Item"} • {b.customerName || "No customer"}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
