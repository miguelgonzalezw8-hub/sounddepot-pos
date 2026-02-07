// client/src/pages/BackorderCenter.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { db } from "../firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  updateDoc,
  doc,
  getDoc,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { useSession } from "../session/SessionProvider";

const STATUS_ORDER = ["open", "ordered", "received", "notified", "closed"];

function prettyStatus(s) {
  const v = String(s || "open").toLowerCase();
  if (v === "open") return "Open";
  if (v === "ordered") return "Ordered";
  if (v === "received") return "Received";
  if (v === "notified") return "Notified";
  if (v === "closed") return "Closed";
  return v;
}

function statusPillClass(status) {
  const s = String(status || "open").toLowerCase();
  if (s === "open") return "bg-rose-50 text-rose-700 border-rose-200";
  if (s === "ordered") return "bg-amber-50 text-amber-700 border-amber-200";
  if (s === "received") return "bg-blue-50 text-blue-700 border-blue-200";
  if (s === "notified") return "bg-violet-50 text-violet-700 border-violet-200";
  if (s === "closed") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

export default function BackorderCenter() {
  const { terminal, booting, isUnlocked, devMode } = useSession();
  const tenantId = terminal?.tenantId;

  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("open"); // open | ordered | received | notified | closed | all
  const [search, setSearch] = useState("");

  useEffect(() => {
    // ✅ Gate listeners until bootstrap is complete and tenant is known
    if (booting) return;
    if (!devMode && !isUnlocked) return;
    if (!tenantId) return;

    // ✅ MUST scope by tenantId for your rules
    const qy = query(
      collection(db, "backorders"),
      where("tenantId", "==", tenantId),
      orderBy("createdAt", "desc")
    );

    return onSnapshot(
      qy,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => {
        console.error("[SNAPSHOT DENIED] BackorderCenter backorders", err);
      }
    );
  }, [booting, isUnlocked, devMode, tenantId]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();

    return rows
      .filter((r) => {
        if (filter === "all") return true;
        return String(r.status || "open").toLowerCase() === filter;
      })
      .filter((r) => {
        if (!s) return true;
        return `${r.orderNumber || ""} ${r.productName || ""} ${r.sku || ""} ${r.customerName || ""} ${r.customerPhone || ""}`
          .toLowerCase()
          .includes(s);
      });
  }, [rows, filter, search]);

  const setStatus = useCallback(async (row, status) => {
    const next = String(status).toLowerCase();

    // ✅ update the backorder itself (keep tenant fields untouched)
    await updateDoc(doc(db, "backorders", row.id), {
      status: next,
      updatedAt: serverTimestamp(),
    });
  }, []);

  const ensureOrderNumber = useCallback(async (row) => {
    if (row.orderNumber) return row.orderNumber;
    if (!row.orderId) return "";

    try {
      const snap = await getDoc(doc(db, "orders", row.orderId));
      return snap.exists() ? snap.data()?.orderNumber || "" : "";
    } catch (err) {
      console.error("[ensureOrderNumber] failed", err);
      return "";
    }
  }, []);

  return (
    <div className="inventory-container">
      <div className="search-row">
        <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">
          Backorder Center
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border shadow-sm p-4 mb-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="flex gap-2 flex-wrap">
            {["open", "ordered", "received", "notified", "closed", "all"].map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={[
                  "px-3 py-1.5 rounded-lg border text-sm font-semibold",
                  filter === k
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white dark:bg-slate-950 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800",
                ].join(" ")}
              >
                {k === "all" ? "All" : prettyStatus(k)}
              </button>
            ))}
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order #, product, customer…"
            className="h-10 w-full md:w-80 px-3 rounded-lg border bg-white dark:bg-slate-950 dark:text-slate-100"
          />
        </div>
      </div>

      {/* List */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border shadow-sm overflow-hidden">
        <div className="grid grid-cols-12 bg-slate-100 dark:bg-slate-800 text-xs font-bold px-4 py-2">
          <div className="col-span-3">Order</div>
          <div className="col-span-4">Item</div>
          <div className="col-span-2 text-right">Backorder Qty</div>
          <div className="col-span-3">Actions</div>
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-sm text-slate-500">No backorders found.</div>
        ) : (
          filtered.map((r) => (
            <BackorderRow
              key={r.id}
              row={r}
              setStatus={setStatus}
              ensureOrderNumber={ensureOrderNumber}
            />
          ))
        )}
      </div>
    </div>
  );
}

function BackorderRow({ row, setStatus, ensureOrderNumber }) {
  const [orderNum, setOrderNum] = useState(row.orderNumber || "");

  useEffect(() => {
    let alive = true;
    (async () => {
      const n = await ensureOrderNumber(row);
      if (alive) setOrderNum(n || "");
    })();
    return () => {
      alive = false;
    };
  }, [row, ensureOrderNumber]);

  const status = String(row.status || "open").toLowerCase();

  return (
    <div className="grid grid-cols-12 px-4 py-3 border-t text-sm items-center gap-2">
      <div className="col-span-3">
        <div className="font-bold text-slate-900 dark:text-slate-100">
          {orderNum || "—"}
        </div>
        <div className="text-xs text-slate-500">
          {row.customerName || "—"}
          {row.customerPhone ? ` • ${row.customerPhone}` : ""}
        </div>
        <span
          className={[
            "inline-flex mt-2 px-2 py-0.5 rounded-full border text-xs font-bold",
            statusPillClass(status),
          ].join(" ")}
        >
          {prettyStatus(status)}
        </span>
      </div>

      <div className="col-span-4">
        <div className="font-semibold">{row.productName || "—"}</div>
        <div className="text-xs text-slate-500">{row.sku || ""}</div>
      </div>

      <div className="col-span-2 text-right font-bold text-rose-700">
        {Number(row.requestedQty || row.backorderedQty || 0)}
      </div>

      <div className="col-span-3 flex flex-wrap gap-2 justify-end">
        <StatusButton
          label="Ordered"
          active={status === "ordered"}
          onClick={() => setStatus(row, "ordered")}
        />
        <StatusButton
          label="Received"
          active={status === "received"}
          onClick={() => setStatus(row, "received")}
        />
        <StatusButton
          label="Notified"
          active={status === "notified"}
          onClick={() => setStatus(row, "notified")}
        />
        <StatusButton
          label="Closed"
          active={status === "closed"}
          onClick={() => setStatus(row, "closed")}
        />
      </div>
    </div>
  );
}

function StatusButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={[
        "px-3 py-1.5 rounded-lg border text-xs font-bold",
        active
          ? "bg-slate-900 text-white border-slate-900"
          : "bg-white hover:bg-slate-50 border-slate-200",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
