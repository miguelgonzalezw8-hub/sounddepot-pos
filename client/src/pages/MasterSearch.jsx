// client/src/pages/MasterSearch.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { collection, onSnapshot, orderBy, limit, query, where } from "firebase/firestore";
import { useSession } from "../session/SessionProvider";

function norm(s) {
  return String(s || "").toLowerCase().trim();
}

function includesAny(hay, q) {
  if (!q) return false;
  return norm(hay).includes(q);
}

export default function MasterSearch() {
  const navigate = useNavigate();

  const { terminal, booting } = useSession();
  const tenantId = terminal?.tenantId;

  const [term, setTerm] = useState("");

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [backorders, setBackorders] = useState([]);

  useEffect(() => {
    if (booting) return;
    if (!tenantId) return;

    const unsub1 = onSnapshot(
      query(
        collection(db, "customers"),
        where("tenantId", "==", tenantId),
        orderBy("createdAt", "desc"),
        limit(400)
      ),
      (snap) => setCustomers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("[MasterSearch customers] permission/index error:", err)
    );

    const unsub2 = onSnapshot(
      query(
        collection(db, "products"),
        where("tenantId", "==", tenantId),
        orderBy("createdAt", "desc"),
        limit(400)
      ),
      (snap) => setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("[MasterSearch products] permission/index error:", err)
    );

    const unsub3 = onSnapshot(
      query(
        collection(db, "orders"),
        where("tenantId", "==", tenantId),
        orderBy("createdAt", "desc"),
        limit(600)
      ),
      (snap) => setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("[MasterSearch orders] permission/index error:", err)
    );

    const unsub4 = onSnapshot(
      query(
        collection(db, "backorders"),
        where("tenantId", "==", tenantId),
        orderBy("createdAt", "desc"),
        limit(600)
      ),
      (snap) => setBackorders(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("[MasterSearch backorders] permission/index error:", err)
    );

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, [booting, tenantId]);

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
        <div className="text-2xl font-bold text-app-text dark:text-app-text">
          Master Search
        </div>

        <button
          onClick={() => navigate("/")}
          className="px-3 py-2 rounded-lg border border-app-border bg-app-panel dark:bg-app-panel text-app-text hover:bg-slate-50 dark:bg-brand-primary dark:hover:bg-brand-primary/90 text-sm font-semibold"
        >
          ← Dashboard
        </button>
      </div>

      <div className="bg-app-panel dark:bg-app-panel dark:bg-brand-primary border rounded-xl shadow-sm p-4">
        <div className="text-sm font-semibold text-slate-700 dark:text-app-text mb-2">
          Search orders, customers, products, backorders
        </div>
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder='Try: "SD-000123", "C1-650", "256", "John", "Backorder"…'
          className="w-full h-11 px-3 rounded-lg border border-app-border bg-app-panel dark:bg-app-panel text-app-text dark:bg-app-bg dark:text-app-text"
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
          <div className="bg-app-panel dark:bg-app-panel dark:bg-brand-primary border rounded-xl shadow-sm p-4">
            <div className="text-sm font-bold mb-3 text-slate-700 dark:text-app-text">
              Orders ({results.orders.length})
            </div>

            {results.orders.length === 0 ? (
              <div className="text-sm text-slate-500">No matches.</div>
            ) : (
              <div className="space-y-2">
                {results.orders.map((o) => (
                  <button
                    key={o.id}
                    className="w-full text-left px-3 py-2 rounded-lg border hover:bg-slate-50 dark:hover:bg-brand-primary/90"
                    onClick={() => navigate("/reports/sales-summary")}
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
          <div className="bg-app-panel dark:bg-app-panel dark:bg-brand-primary border rounded-xl shadow-sm p-4">
            <div className="text-sm font-bold mb-3 text-slate-700 dark:text-app-text">
              Customers ({results.customers.length})
            </div>

            {results.customers.length === 0 ? (
              <div className="text-sm text-slate-500">No matches.</div>
            ) : (
              <div className="space-y-2">
                {results.customers.map((c) => (
                  <button
                    key={c.id}
                    className="w-full text-left px-3 py-2 rounded-lg border hover:bg-slate-50 dark:hover:bg-brand-primary/90"
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
          <div className="bg-app-panel dark:bg-app-panel dark:bg-brand-primary border rounded-xl shadow-sm p-4">
            <div className="text-sm font-bold mb-3 text-slate-700 dark:text-app-text">
              Products ({results.products.length})
            </div>

            {results.products.length === 0 ? (
              <div className="text-sm text-slate-500">No matches.</div>
            ) : (
              <div className="space-y-2">
                {results.products.map((p) => (
                  <button
                    key={p.id}
                    className="w-full text-left px-3 py-2 rounded-lg border hover:bg-slate-50 dark:hover:bg-brand-primary/90"
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
          <div className="bg-app-panel dark:bg-app-panel dark:bg-brand-primary border rounded-xl shadow-sm p-4">
            <div className="text-sm font-bold mb-3 text-slate-700 dark:text-app-text">
              Backorders ({results.backorders.length})
            </div>

            {results.backorders.length === 0 ? (
              <div className="text-sm text-slate-500">No matches.</div>
            ) : (
              <div className="space-y-2">
                {results.backorders.map((b) => (
                  <button
                    key={b.id}
                    className="w-full text-left px-3 py-2 rounded-lg border hover:bg-slate-50 dark:hover:bg-brand-primary/90"
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







