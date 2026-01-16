import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAuth } from "firebase/auth";

export default function ManagerMenu() {
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const auth = getAuth();
    (async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          setAllowed(false);
          setChecked(true);
          return;
        }
        const tok = await user.getIdTokenResult();
        const role = tok?.claims?.role || "";
        setAllowed(role === "owner" || role === "manager");
      } catch (e) {
        console.error(e);
        setAllowed(false);
      } finally {
        setChecked(true);
      }
    })();
  }, []);

  if (!checked) {
    return (
      <div className="inventory-container">
        <div className="empty-state">Loading…</div>
      </div>
    );
  }

  // Non-managers see a friendly block (rules are still the real security)
  if (!allowed) {
    return (
      <div className="inventory-container">
        <div className="table-wrapper" style={{ padding: 16 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Manager</div>
          <div style={{ marginTop: 8, opacity: 0.8 }}>
            You don’t have manager access.
          </div>
          <button
            className="search-box"
            style={{ marginTop: 12, width: 160 }}
            onClick={() => navigate(-1)}
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="inventory-container">
      <div className="search-row" style={{ display: "flex", gap: 8 }}>
        <button
          className="search-box"
          onClick={() => navigate(-1)}
          style={{ width: 120 }}
        >
          ← Back
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Manager</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Manager-only tools
          </div>
        </div>
      </div>

      {/* Tiles (reuse Inventory tile styling) */}
      <div className="inventory-tiles">
        <div className="tile" onClick={() => navigate("/manager/security")}>
          <span className="tile-title">🔒 Manager PIN</span>
          <span className="tile-sub">Set / change PIN</span>
        </div>

        {/* Future manager tools go here */}
        <div
          className="tile"
          onClick={() => alert("Coming next: discounts, reports, user admin, etc.")}
        >
          <span className="tile-title">📊 Reports</span>
          <span className="tile-sub">Coming soon</span>
        </div>
      </div>
    </div>
  );
}
