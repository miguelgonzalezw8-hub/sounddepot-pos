import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../../firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import { downloadCSV, money } from "./_reportUtils";

function daysBetween(a, b) {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export default function ReportInventoryAging() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [units, setUnits] = useState([]);
  const [err, setErr] = useState("");

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
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
      setErr(e?.message?.includes("permission") ? "Permission denied." : "Failed to load units.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const buckets = useMemo(() => {
    const now = new Date();
    const b = {
      "0-30": { count: 0, value: 0 },
      "31-60": { count: 0, value: 0 },
      "61-90": { count: 0, value: 0 },
      "90+": { count: 0, value: 0 },
    };

    for (const u of units) {
      const recv = u.receivedAt?.toDate ? u.receivedAt.toDate() : null;
      const age = recv ? daysBetween(recv, now) : null;
      const cost = Number(u.cost || 0);

      let key = "90+";
      if (age === null) key = "90+";
      else if (age <= 30) key = "0-30";
      else if (age <= 60) key = "31-60";
      else if (age <= 90) key = "61-90";

      b[key].count += 1;
      b[key].value += cost;
    }

    const total = units.reduce((a, u) => a + Number(u.cost || 0), 0);
    return { ...b, totalCount: units.length, totalValue: total };
  }, [units]);

  const exportCSV = () => {
    const rows = [
      ["Report", "Inventory Aging (On-Hand + Reserved)"],
      ["Total Units", String(buckets.totalCount)],
      ["Total Cost Value", String(buckets.totalValue.toFixed(2))],
      [""],
      ["Bucket", "Count", "CostValue"],
      ["0-30", String(buckets["0-30"].count), String(buckets["0-30"].value.toFixed(2))],
      ["31-60", String(buckets["31-60"].count), String(buckets["31-60"].value.toFixed(2))],
      ["61-90", String(buckets["61-90"].count), String(buckets["61-90"].value.toFixed(2))],
      ["90+", String(buckets["90+"].count), String(buckets["90+"].value.toFixed(2))],
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
    downloadCSV(`inventory-aging.csv`, rows);
  };

  return (
    <div className="inventory-container">
      <div className="search-row" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="search-box" style={{ width: 120 }} onClick={() => navigate(-1)}>
          ← Back
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Inventory Aging</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>On-hand + reserved units grouped by age</div>
        </div>
        <button className="search-box" style={{ width: 140 }} onClick={exportCSV} disabled={!units.length}>
          Export CSV
        </button>
      </div>

      <div className="search-row">
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
          <div><b>Total Units</b>: {buckets.totalCount}</div>
          <div><b>Total Value</b>: {money(buckets.totalValue)}</div>
        </div>

        <div style={{ marginTop: 14, fontWeight: 900 }}>Buckets</div>
        <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          <div><b>0–30:</b> {buckets["0-30"].count} ({money(buckets["0-30"].value)})</div>
          <div><b>31–60:</b> {buckets["31-60"].count} ({money(buckets["31-60"].value)})</div>
          <div><b>61–90:</b> {buckets["61-90"].count} ({money(buckets["61-90"].value)})</div>
          <div><b>90+:</b> {buckets["90+"].count} ({money(buckets["90+"].value)})</div>
        </div>
      </div>
    </div>
  );
}
