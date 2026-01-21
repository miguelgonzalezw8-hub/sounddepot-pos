// client/src/pages/DevMenu.jsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../session/SessionProvider";

export default function DevMenu() {
  const navigate = useNavigate();
  const { devMode } = useSession();

  useEffect(() => {
    if (!devMode) navigate("/", { replace: true });
  }, [devMode, navigate]);

  if (!devMode) {
    return (
      <div className="inventory-container">
        <div className="empty-state">Not authorized.</div>
      </div>
    );
  }

  return (
    <div className="inventory-container">
      <div className="search-row" style={{ display: "flex", gap: 8 }}>
        <button className="search-box" onClick={() => navigate(-1)} style={{ width: 120 }}>
          ← Back
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Dev</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Dev-only tools</div>
        </div>
      </div>

      <div className="inventory-tiles" style={{ marginTop: 14 }}>
        <div className="tile" onClick={() => navigate("/dev/accounts")}>
          <span className="tile-title">🏷️ Accounts</span>
          <span className="tile-sub">Create / edit customer accounts</span>
        </div>

        <div className="tile" onClick={() => navigate("/dev/shops")}>
          <span className="tile-title">🏪 Shops</span>
          <span className="tile-sub">Create / edit shops</span>
        </div>

        <div className="tile" onClick={() => alert("Coming soon: subscriptions, discounts, admin tools, etc.")}>
          <span className="tile-title">🧰 More tools</span>
          <span className="tile-sub">Coming soon</span>
        </div>
      </div>
    </div>
  );
}
