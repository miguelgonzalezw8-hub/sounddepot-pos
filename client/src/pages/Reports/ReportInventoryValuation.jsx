import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../../firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import { downloadCSV, money } from "./_reportUtils";

export default function ReportInventoryValuation() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [units, setUnits] = useState([]);
  const [err, setErr] = useState("");

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      // inventory “on hand” includes in_stock + reserved (still yours)
      const q1 = query(collection(db, "productUnits"), where("status", "==", "in_stock"));
      const q2 = query(collection(db, "productUnits"), where("status", "==", "reserved"));

      const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);
      const all = [
        ...s1.docs.map((d) => ({ id: d.id, ...d.data() })),
        ...s2.docs.map((d) => ({ id: d.id, ...d.data() })),
      ];
      setUnits(all);
    } catch (e) {
      console.error(e);
      setErr(
        e?.message?.includes("permission")
          ? "Permission denied."
          : "Failed to load inventory units."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const totals = useMemo(() => {
    let count = 0;
    let value = 0;
    for (const u of units) {
      count += 1;
      value += Number(u.cost || 0);
    }
    return { count, value };
  }, [units]);

  const exportCSV = () => {
    const rows = [
      ["Report", "Inventory Valuation (Unit-Based)"],
      ["Units Count", String(totals.count)],
      ["Total Cost Value", String(totals.value.toFixed(2))],
      [""],
      ["UnitId", "ProductId", "Status", "Cost", "ReceivedAt"],
      ...units.map((u) => [
        u.unitId || u.id,
        u.productId || "",
        u.status || "",
        Number(u.cost || 0).toFixed(2),
        u.receivedAt?.toDate ? u.receivedAt.toDate().toISOString() : "",
      ]),
    ];
    downloadCSV(`inventory-valuation_units.csv`, rows);
  };

  return (
    <div className="inventory-container">
      <div className="search-row" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="search-box" style={{ width: 120 }} onClick={() => navigate(-1)}>
          ← Back
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Inventory Valuation</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Unit-based valuation using cost</div>
        </div>
        <button className="search-box" style={{ width: 140 }} onClick={exportCSV} disabled={!units.length}>
          Export CSV
        </button>
      </div>

      <div className="search-row" style={{ display: "flex", gap: 8 }}>
        <button className="save-btn" onClick={load} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {err && (
        <div style={{ marginTop: 8, padding: 10, borderRadius: 12, border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.08)", color: "#991b1b", fontSize: 13 }}>
          {err}
        </div>
      )}

      <div className="table-wrapper" style={{ padding: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          <div><b>Units on Hand</b>: {totals.count}</div>
          <div><b>Total Cost Value</b>: {money(totals.value)}</div>
        </div>

        <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12 }}>
          Note: This is cost valuation of in_stock + reserved units. Sold units are excluded.
        </div>
      </div>
    </div>
  );
}
