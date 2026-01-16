import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAuth } from "firebase/auth";

export default function ReportsMenu() {
  const navigate = useNavigate();
  const [role, setRole] = useState("");

  useEffect(() => {
    const auth = getAuth();
    (async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;
        const tok = await user.getIdTokenResult();
        setRole(tok?.claims?.role || "");
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const isManager = role === "owner" || role === "manager";

  // ✅ Reports-only grid (no dependency on any CSS file)
  const tilesGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 20,
    alignItems: "stretch",
    marginTop: 18,
  };

  return (
    <div className="inventory-container">
      <div className="search-row" style={{ display: "flex", gap: 8 }}>
        <button
          className="search-box"
          style={{ width: 120 }}
          onClick={() => navigate(-1)}
        >
          ← Back
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Reports</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Sales • Inventory • Accounting (exports)
          </div>
        </div>
      </div>

      {/* ✅ Neat, responsive report tiles grid */}
      <div style={tilesGridStyle}>
        <div className="tile" onClick={() => navigate("/reports/sales-summary")}>
          <span className="tile-title">💵 Sales Summary</span>
          <span className="tile-sub">Revenue, tax, payments, CSV export</span>
        </div>

        <div className="tile" onClick={() => navigate("/reports/daily-closeout")}>
          <span className="tile-title">🧾 Daily Closeout (Z)</span>
          <span className="tile-sub">End-of-day totals + payments</span>
        </div>

        <div className="tile" onClick={() => navigate("/reports/cogs")}>
          <span className="tile-title">📉 COGS Summary</span>
          <span className="tile-sub">Unit-based COGS (QB-ready)</span>
        </div>

        <div
          className="tile"
          onClick={() => navigate("/reports/inventory-valuation")}
        >
          <span className="tile-title">📦 Inventory Valuation</span>
          <span className="tile-sub">Cost value of on-hand units</span>
        </div>

        <div className="tile" onClick={() => navigate("/reports/inventory-aging")}>
          <span className="tile-title">⏳ Inventory Aging</span>
          <span className="tile-sub">0–30 / 31–60 / 61–90 / 90+ days</span>
        </div>

        <div className="tile" onClick={() => navigate("/reports/backorders")}>
          <span className="tile-title">📦 Backorders</span>
          <span className="tile-sub">Open backorders by FIFO</span>
        </div>

        {!isManager && (
          <div
            className="tile"
            onClick={() =>
              alert("Some accounting/admin reports will be manager-only later.")
            }
          >
            <span className="tile-title">🔒 Manager Reports</span>
            <span className="tile-sub">More reports unlock with manager access</span>
          </div>
        )}
      </div>
    </div>
  );
}
