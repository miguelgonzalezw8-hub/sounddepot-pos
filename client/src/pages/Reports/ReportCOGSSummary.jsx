import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../../firebase";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { downloadCSV, endOfDay, money, startOfDay, toISODateInput } from "./_reportUtils";
import { useSession } from "../../session/SessionProvider"; // ✅ add

export default function ReportCOGSSummary() {
  const navigate = useNavigate();

  const { terminal, booting } = useSession(); // ✅ add
  const tenantId = terminal?.tenantId; // ✅ add

  const today = toISODateInput(new Date());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]); // orderItems in range
  const [unitsById, setUnitsById] = useState({}); // unitId -> {cost,...}
  const [err, setErr] = useState("");

  const run = async () => {
    // ✅ prevent unscoped reads (permission-denied)
    if (booting) return;
    if (!tenantId) {
      setErr("Terminal not set up (missing tenant).");
      return;
    }

    setLoading(true);
    setErr("");
    setItems([]);
    setUnitsById({});

    try {
      const fromDate = startOfDay(from);
      const toDate = endOfDay(to);

      // ✅ Tenant-scoped orderItems query
      const qy = query(
        collection(db, "orderItems"),
        where("tenantId", "==", tenantId), // ✅ add
        where("orderCreatedAt", ">=", fromDate),
        where("orderCreatedAt", "<=", toDate)
      );

      const snap = await getDocs(qy);
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setItems(rows);

      // Gather all assigned unit ids (fulfilled units)
      const unitIds = new Set();
      for (const r of rows) {
        const arr = Array.isArray(r.assignedUnitIds) ? r.assignedUnitIds : [];
        for (const id of arr) unitIds.add(id);
      }

      // Fetch units (dedup)
      const ids = Array.from(unitIds);
      const out = {};

      const chunkSize = 50;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);

        // NOTE: These are doc reads; they will pass only if each productUnits doc
        // has tenantId that matches rules (resource.data.tenantId == myTenantId/sessionTenantId).
        const snaps = await Promise.all(chunk.map((id) => getDoc(doc(db, "productUnits", id))));

        snaps.forEach((s, idx) => {
          if (s.exists()) out[chunk[idx]] = { id: s.id, ...s.data() };
        });
      }

      setUnitsById(out);
    } catch (e) {
      console.error(e);
      setErr(
        e?.message?.includes("index")
          ? "This query needs an index. Create it from the console link."
          : e?.message?.includes("permission")
          ? "Permission denied."
          : "Failed to load COGS data."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (booting) return;
    if (!tenantId) return;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booting, tenantId]);

  const summary = useMemo(() => {
    let fulfilledUnits = 0;
    let cogs = 0;
    let backorderedUnits = 0;

    for (const r of items) {
      const assigned = Array.isArray(r.assignedUnitIds) ? r.assignedUnitIds : [];
      fulfilledUnits += assigned.length;

      for (const uid of assigned) {
        const u = unitsById[uid];
        cogs += Number(u?.cost || 0);
      }

      backorderedUnits += Number(r.backorderedQty || 0);
    }

    return { fulfilledUnits, cogs, backorderedUnits };
  }, [items, unitsById]);

  const exportCSV = () => {
    const rows = [
      ["Report", "COGS Summary (Unit-Based)"],
      ["From", from],
      ["To", to],
      [""],
      ["OrderItems", String(items.length)],
      ["Fulfilled Units", String(summary.fulfilledUnits)],
      ["Backordered Units", String(summary.backorderedUnits)],
      ["Total COGS", String(summary.cogs.toFixed(2))],
      [""],
      ["OrderItemId", "OrderId", "ProductId", "ProductName", "QtyOrdered", "FulfilledUnits", "BackorderedQty", "AssignedUnitIds"],
      ...items.map((r) => [
        r.id,
        r.orderId || "",
        r.productId || "",
        r.productName || "",
        String(Number(r.qtyOrdered || 0)),
        String(Array.isArray(r.assignedUnitIds) ? r.assignedUnitIds.length : 0),
        String(Number(r.backorderedQty || 0)),
        (Array.isArray(r.assignedUnitIds) ? r.assignedUnitIds.join(" ") : ""),
      ]),
      [""],
      ["UnitId", "ProductId", "Status", "Cost", "ReceivedAt", "OrderId"],
      ...Object.values(unitsById).map((u) => [
        u.unitId || u.id,
        u.productId || "",
        u.status || "",
        Number(u.cost || 0).toFixed(2),
        u.receivedAt?.toDate ? u.receivedAt.toDate().toISOString() : "",
        u.orderId || "",
      ]),
    ];

    downloadCSV(`cogs_${from}_to_${to}.csv`, rows);
  };

  return (
    <div className="inventory-container">
      <div className="search-row" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="search-box" style={{ width: 120 }} onClick={() => navigate(-1)}>
          ← Back
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>COGS Summary</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Accurate unit-based COGS from assignedUnitIds
          </div>
        </div>
        <button className="search-box" style={{ width: 140 }} onClick={exportCSV} disabled={!items.length}>
          Export CSV
        </button>
      </div>

      <div className="search-row" style={{ display: "flex", gap: 8 }}>
        <input className="search-box" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input className="search-box" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <button className="save-btn" onClick={run} disabled={loading}>
          {loading ? "Loading..." : "Run"}
        </button>
      </div>

      {err && (
        <div style={{ marginTop: 8, padding: 10, borderRadius: 12, border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.08)", color: "#991b1b", fontSize: 13 }}>
          {err}
        </div>
      )}

      <div className="table-wrapper" style={{ padding: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          <div><b>Order Items</b>: {items.length}</div>
          <div><b>Fulfilled Units</b>: {summary.fulfilledUnits}</div>
          <div><b>Backordered Units</b>: {summary.backorderedUnits}</div>
          <div><b>Total COGS</b>: {money(summary.cogs)}</div>
        </div>

        <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12 }}>
          Notes: This is **COGS for fulfilled units only** (assignedUnitIds). Backordered units are excluded until fulfilled.
        </div>
      </div>
    </div>
  );
}







