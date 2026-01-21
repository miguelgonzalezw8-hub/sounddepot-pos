// client/src/pages/ManagerMenu.jsx
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../session/SessionProvider";

export default function ManagerMenu() {
  const navigate = useNavigate();
  const { devMode, posAccount } = useSession();

  const allowed = useMemo(() => {
    if (devMode) return true;
    const role = String(posAccount?.role || "").toLowerCase();
    return role === "owner" || role === "manager";
  }, [devMode, posAccount?.role]);

  if (!allowed) {
    return (
      <div className="inventory-container">
        <div className="table-wrapper" style={{ padding: 16 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Manager</div>
          <div style={{ marginTop: 8, opacity: 0.8 }}>You don’t have manager access.</div>
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
        <button className="search-box" onClick={() => navigate(-1)} style={{ width: 120 }}>
          ← Back
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Manager</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Manager-only tools</div>
        </div>
      </div>

      <div className="inventory-tiles">
        <div className="tile" onClick={() => navigate("/manager/security")}>
          <span className="tile-title">🔒 Manager PIN</span>
          <span className="tile-sub">Set / change PIN</span>
        </div>

        <div className="tile" onClick={() => navigate("/manager/employees")}>
          <span className="tile-title">👥 Employees</span>
          <span className="tile-sub">Create PIN users for this shop</span>
        </div>
      </div>
    </div>
  );
}
