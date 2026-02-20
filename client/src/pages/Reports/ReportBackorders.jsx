import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../../firebase";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { downloadCSV, endOfDay, startOfDay, toISODateInput } from "./_reportUtils";
import { useSession } from "../../session/SessionProvider"; // ✅ add

export default function ReportBackorders() {
  const navigate = useNavigate();

  const { terminal, booting } = useSession(); // ✅ add
  const tenantId = terminal?.tenantId; // ✅ add

  const today = toISODateInput(new Date());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");

  const run = async () => {
    // ✅ prevent unscoped reads (would permission-deny)
    if (booting) return;
    if (!tenantId) {
      setErr("Terminal not set up (missing tenant).");
      return;
    }

    setLoading(true);
    setErr("");
    try {
      const fromDate = startOfDay(from);
      const toDate = endOfDay(to);

      const qy = query(
        collection(db, "orderItems"),
        where("tenantId", "==", tenantId), // ✅ add tenant scope
        where("orderCreatedAt", ">=", fromDate),
        where("orderCreatedAt", "<=", toDate),
        where("backorderedQty", ">", 0),
        orderBy("backorderedQty"),
        orderBy("orderCreatedAt", "asc")
      );

      const snap = await getDocs(qy);
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
      setErr(
        e?.message?.includes("index")
          ? "This query needs an index. Create it from the console link."
          : "Failed to load backorders."
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

  const totals = useMemo(() => {
    let qty = 0;
    for (const r of items) qty += Number(r.backorderedQty || 0);
    return { qty };
  }, [items]);

  const exportCSV = () => {
    const rows = [
      ["Report", "Backorders"],
      ["From", from],
      ["To", to],
      [""],
      ["Backorder Lines", String(items.length)],
      ["Backordered Units", String(totals.qty)],
      [""],
      ["OrderItemId", "OrderId", "ProductId", "ProductName", "BackorderedQty", "OrderCreatedAt"],
      ...items.map((r) => [
        r.id,
        r.orderId || "",
        r.productId || "",
        r.productName || "",
        String(Number(r.backorderedQty || 0)),
        r.orderCreatedAt?.toDate ? r.orderCreatedAt.toDate().toISOString() : "",
      ]),
    ];
    downloadCSV(`backorders_${from}_to_${to}.csv`, rows);
  };

  return (
    <div className="inventory-container">
      <div className="search-row" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="search-box" style={{ width: 120 }} onClick={() => navigate(-1)}>
          ← Back
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Backorders</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Open backorders (orderItems where backorderedQty &gt; 0)
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
        <div
          style={{
            marginTop: 8,
            padding: 10,
            borderRadius: 12,
            border: "1px solid rgba(239,68,68,0.35)",
            background: "rgba(239,68,68,0.08)",
            color: "#991b1b",
            fontSize: 13,
          }}
        >
          {err}
        </div>
      )}

      <div className="table-wrapper">
        <table className="inventory-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Backordered</th>
              <th>Order</th>
              <th>Order Date</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty-state">
                  No backorders found.
                </td>
              </tr>
            ) : (
              items.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{r.productName || "—"}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{r.productId}</div>
                  </td>
                  <td style={{ fontWeight: 800 }}>{Number(r.backorderedQty || 0)}</td>
                  <td>{r.orderId || "—"}</td>
                  <td>{r.orderCreatedAt?.toDate ? r.orderCreatedAt.toDate().toLocaleString() : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="table-wrapper" style={{ padding: 12 }}>
        <b>Total backordered units:</b> {totals.qty}
      </div>
    </div>
  );
}







