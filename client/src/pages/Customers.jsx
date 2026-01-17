import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { collection, onSnapshot } from "firebase/firestore";

export default function Customers() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    return onSnapshot(collection(db, "customers"), (snap) => {
      setCustomers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return customers;

    return customers.filter((c) =>
      `${c.companyName || ""} ${c.firstName || ""} ${c.lastName || ""} ${c.phone || ""} ${c.email || ""}`
        .toLowerCase()
        .includes(s)
    );
  }, [customers, search]);

  return (
    <div className="inventory-container">
      <div className="search-row">
        <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">
          Customers
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border shadow-sm p-4 mb-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, company, phone, email…"
            className="h-11 w-full md:w-[420px] px-3 rounded-lg border bg-white dark:bg-slate-950 dark:text-slate-100"
          />

          <button
            onClick={() => navigate("/customers/new")}
            className="h-11 px-4 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800"
          >
            + Add Customer
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border shadow-sm overflow-hidden">
        <div className="grid grid-cols-12 bg-slate-100 dark:bg-slate-800 text-xs font-bold px-4 py-2">
          <div className="col-span-5">Customer</div>
          <div className="col-span-3">Phone</div>
          <div className="col-span-2">Type</div>
          <div className="col-span-2 text-right">Open</div>
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-sm text-slate-500">No customers found.</div>
        ) : (
          filtered.map((c) => (
            <div
              key={c.id}
              className="grid grid-cols-12 px-4 py-3 border-t text-sm items-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
              onClick={() => navigate(`/customers/${c.id}`)}
            >
              <div className="col-span-5">
                <div className="font-semibold">
                  {c.companyName || `${c.firstName || ""} ${c.lastName || ""}`.trim() || "—"}
                </div>
                <div className="text-xs text-slate-500">{c.email || ""}</div>
              </div>
              <div className="col-span-3">{c.phone || "—"}</div>
              <div className="col-span-2">{c.type || "Retail"}</div>
              <div className="col-span-2 text-right text-slate-500">
                View →
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
