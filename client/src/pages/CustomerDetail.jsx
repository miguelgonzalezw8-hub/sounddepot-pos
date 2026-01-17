import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../firebase";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  updateDoc,
  where,
  orderBy,
} from "firebase/firestore";

export default function CustomerDetail() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [customer, setCustomer] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const [orders, setOrders] = useState([]);

  useEffect(() => {
    let unsubOrders = null;

    (async () => {
      const snap = await getDoc(doc(db, "customers", id));
      if (!snap.exists()) {
        setCustomer(null);
        setDraft(null);
        return;
      }

      const data = { id: snap.id, ...snap.data() };
      setCustomer(data);
      setDraft({
        type: data.type || "Retail",
        firstName: data.firstName || "",
        lastName: data.lastName || "",
        companyName: data.companyName || "",
        phone: data.phone || "",
        email: data.email || "",
        notes: data.notes || "",
      });

      // purchase history (orders)
      const qy = query(
        collection(db, "orders"),
        where("customerId", "==", id),
        orderBy("createdAt", "desc")
      );

      unsubOrders = onSnapshot(qy, (s) => {
        setOrders(s.docs.map((d) => ({ id: d.id, ...d.data() })));
      });
    })();

    return () => {
      if (unsubOrders) unsubOrders();
    };
  }, [id]);

  const displayName = useMemo(() => {
    if (!customer) return "";
    return (
      customer.companyName ||
      `${customer.firstName || ""} ${customer.lastName || ""}`.trim() ||
      "Customer"
    );
  }, [customer]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "customers", id), {
        type: draft.type || "Retail",
        firstName: (draft.firstName || "").trim(),
        lastName: (draft.lastName || "").trim(),
        companyName: (draft.companyName || "").trim(),
        phone: (draft.phone || "").trim(),
        email: (draft.email || "").trim(),
        notes: (draft.notes || "").trim(),
        updatedAt: new Date(),
      });
      alert("Customer updated.");
    } catch (e) {
      console.error(e);
      alert("Save failed. See console.");
    } finally {
      setSaving(false);
    }
  };

  if (!draft) {
    return (
      <div className="inventory-container">
        <button
          onClick={() => navigate("/customers")}
          className="px-3 py-2 rounded-lg border bg-white hover:bg-slate-50 text-sm font-semibold"
        >
          ← Back
        </button>
        <div className="mt-4 text-slate-500">Loading customer…</div>
      </div>
    );
  }

  return (
    <div className="inventory-container">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => navigate("/customers")}
          className="px-3 py-2 rounded-lg border bg-white hover:bg-slate-50 text-sm font-semibold"
        >
          ← Back
        </button>

        <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">
          {displayName}
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {/* Edit panel */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border shadow-sm p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-xs font-bold text-slate-600 mb-1">Type</div>
            <select
              value={draft.type}
              onChange={(e) => setDraft((p) => ({ ...p, type: e.target.value }))}
              className="w-full h-11 px-3 rounded-lg border"
            >
              <option value="Retail">Retail</option>
              <option value="Wholesale">Wholesale</option>
            </select>
          </div>

          <div>
            <div className="text-xs font-bold text-slate-600 mb-1">Phone</div>
            <input
              value={draft.phone}
              onChange={(e) => setDraft((p) => ({ ...p, phone: e.target.value }))}
              className="w-full h-11 px-3 rounded-lg border"
            />
          </div>

          <div>
            <div className="text-xs font-bold text-slate-600 mb-1">First Name</div>
            <input
              value={draft.firstName}
              onChange={(e) => setDraft((p) => ({ ...p, firstName: e.target.value }))}
              className="w-full h-11 px-3 rounded-lg border"
            />
          </div>

          <div>
            <div className="text-xs font-bold text-slate-600 mb-1">Last Name</div>
            <input
              value={draft.lastName}
              onChange={(e) => setDraft((p) => ({ ...p, lastName: e.target.value }))}
              className="w-full h-11 px-3 rounded-lg border"
            />
          </div>

          <div className="md:col-span-2">
            <div className="text-xs font-bold text-slate-600 mb-1">Company</div>
            <input
              value={draft.companyName}
              onChange={(e) => setDraft((p) => ({ ...p, companyName: e.target.value }))}
              className="w-full h-11 px-3 rounded-lg border"
            />
          </div>

          <div className="md:col-span-2">
            <div className="text-xs font-bold text-slate-600 mb-1">Email</div>
            <input
              value={draft.email}
              onChange={(e) => setDraft((p) => ({ ...p, email: e.target.value }))}
              className="w-full h-11 px-3 rounded-lg border"
            />
          </div>

          <div className="md:col-span-2">
            <div className="text-xs font-bold text-slate-600 mb-1">Notes</div>
            <input
              value={draft.notes}
              onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))}
              className="w-full h-11 px-3 rounded-lg border"
            />
          </div>
        </div>
      </div>

      {/* Purchase history */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b">
          <div className="text-lg font-bold">Purchase History</div>
          <div className="text-sm text-slate-600">
            Orders linked to this customer.
          </div>
        </div>

        <div className="grid grid-cols-12 bg-slate-100 dark:bg-slate-800 text-xs font-bold px-4 py-2">
          <div className="col-span-3">Order #</div>
          <div className="col-span-3">Date</div>
          <div className="col-span-3">Status</div>
          <div className="col-span-3 text-right">Total</div>
        </div>

        {orders.length === 0 ? (
          <div className="px-4 py-8 text-sm text-slate-500">No orders yet.</div>
        ) : (
          orders.map((o) => {
            const dt =
              o.createdAt?.toDate?.()
                ? o.createdAt.toDate()
                : null;

            return (
              <div
                key={o.id}
                className="grid grid-cols-12 px-4 py-3 border-t text-sm items-center"
              >
                <div className="col-span-3 font-semibold">{o.orderNumber || "—"}</div>
                <div className="col-span-3 text-slate-600">
                  {dt ? dt.toLocaleString() : "—"}
                </div>
                <div className="col-span-3">{o.status || "—"}</div>
                <div className="col-span-3 text-right font-bold">
                  ${Number(o.total || 0).toFixed(2)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
