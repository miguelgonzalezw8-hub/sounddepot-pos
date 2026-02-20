import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../../firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import { downloadCSV, endOfDay, money, startOfDay, toISODateInput } from "./_reportUtils";
import { useSession } from "../../session/SessionProvider"; // ✅ add

export default function ReportDailyCloseout() {
  const navigate = useNavigate();

  const { terminal, booting } = useSession(); // ✅ add
  const tenantId = terminal?.tenantId; // ✅ add

  const today = toISODateInput(new Date());
  const [day, setDay] = useState(today);

  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [err, setErr] = useState("");

  const run = async () => {
    // ✅ prevent unscoped reads
    if (booting) return;
    if (!tenantId) {
      setErr("Terminal not set up (missing tenant).");
      return;
    }

    setLoading(true);
    setErr("");
    try {
      const fromDate = startOfDay(day);
      const toDate = endOfDay(day);

      const qy = query(
        collection(db, "orders"),
        where("tenantId", "==", tenantId), // ✅ add tenant scope
        where("createdAt", ">=", fromDate),
        where("createdAt", "<=", toDate)
      );

      const snap = await getDocs(qy);
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
      setErr(
        e?.message?.includes("index")
          ? "This query needs an index. Check the console link and create it."
          : "Failed to load orders."
      );
    } finally {
      setLoading(false);
    }
  };

  // Optional: auto-run once terminal is ready (keeps behavior close to other reports)
  useEffect(() => {
    if (booting) return;
    if (!tenantId) return;
    // don’t auto-run if you prefer manual only; remove these 2 lines if desired
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booting, tenantId]);

  const z = useMemo(() => {
    let gross = 0, tax = 0, subtotal = 0;
    const payments = {};
    for (const o of orders) {
      subtotal += Number(o.subtotal || 0);
      tax += Number(o.tax || 0);
      gross += Number(o.total || 0);
      const method =
        (o.payment && (o.payment.method || o.payment.type)) ||
        o.paymentMethod ||
        "unknown";
      payments[method] = (payments[method] || 0) + Number(o.total || 0);
    }
    return { gross, tax, subtotal, payments };
  }, [orders]);

  const exportCSV = () => {
    const rows = [
      ["Report", "Daily Closeout (Z)"],
      ["Day", day],
      [""],
      ["Orders", String(orders.length)],
      ["Subtotal", String(z.subtotal.toFixed(2))],
      ["Tax", String(z.tax.toFixed(2))],
      ["Total", String(z.gross.toFixed(2))],
      [""],
      ["Payment Method", "Total"],
      ...Object.entries(z.payments).map(([k, v]) => [k, String(Number(v).toFixed(2))]),
      [""],
      ["Order ID", "Total", "PaymentMethod"],
      ...orders.map((o) => [
        o.id,
        Number(o.total || 0).toFixed(2),
        (o.payment && (o.payment.method || o.payment.type)) || o.paymentMethod || "unknown",
      ]),
    ];
    downloadCSV(`daily-closeout_${day}.csv`, rows);
  };

  return (
    <div className="inventory-container">
      <div className="search-row" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="search-box" style={{ width: 120 }} onClick={() => navigate(-1)}>
          ← Back
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Daily Closeout (Z)</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>End-of-day totals + payment breakdown</div>
        </div>
        <button className="search-box" style={{ width: 140 }} onClick={exportCSV} disabled={!orders.length}>
          Export CSV
        </button>
      </div>

      <div className="search-row" style={{ display: "flex", gap: 8 }}>
        <input className="search-box" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
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
          <div><b>Orders</b>: {orders.length}</div>
          <div><b>Subtotal</b>: {money(z.subtotal)}</div>
          <div><b>Tax</b>: {money(z.tax)}</div>
          <div><b>Total</b>: {money(z.gross)}</div>
        </div>

        <div style={{ marginTop: 14, fontWeight: 800 }}>Payments</div>
        <div style={{ marginTop: 6 }}>
          {Object.keys(z.payments).length === 0 ? (
            <div style={{ opacity: 0.7 }}>No payments found.</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {Object.entries(z.payments).map(([k, v]) => (
                <li key={k}>
                  {k}: {money(v)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}







