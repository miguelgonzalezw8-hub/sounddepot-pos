// client/src/pages/ManagerMenu.jsx
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../session/SessionProvider";

export default function ManagerMenu() {
  const navigate = useNavigate();
  const { devMode, posAccount } = useSession();

  const role = useMemo(
    () => String(posAccount?.role || "").toLowerCase(),
    [posAccount?.role]
  );

  const isManager = useMemo(() => {
    if (devMode) return true;
    return role === "owner" || role === "manager";
  }, [devMode, role]);

  // Manager PIN page should be reachable even if not manager yet (bootstrap).
  // Employees remains manager-only.
  const canSeeEmployees = isManager;

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
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
            Role: {devMode ? "devMode" : role || "— (not unlocked)"}
          </div>
        </div>
      </div>

      {!isManager && !devMode && (
        <div
          style={{
            marginTop: 10,
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(234,179,8,0.35)",
            background: "rgba(234,179,8,0.10)",
            color: "#92400e",
            fontSize: 13,
          }}
        >
          You’re not unlocked as a manager yet. Set your Manager PIN, then unlock
          with a manager/owner POS account to access Employees.
        </div>
      )}

      <div className="inventory-tiles" style={{ marginTop: 10 }}>
        {/* Always visible (bootstrap path) */}
        <div className="tile" onClick={() => navigate("/manager/security")}>
          <span className="tile-title">🔒 Manager PIN</span>
          <span className="tile-sub">Set / change PIN</span>
        </div>

        {/* Manager-only */}
        {canSeeEmployees ? (
          <div className="tile" onClick={() => navigate("/manager/employees")}>
            <span className="tile-title">👥 Employees</span>
            <span className="tile-sub">Create PIN users for this shop</span>
          </div>
        ) : (
          <div
            className="tile"
            onClick={() =>
              alert(
                "Employees is manager-only. Unlock with a manager/owner POS account first."
              )
            }
            style={{ opacity: 0.65 }}
          >
            <span className="tile-title">👥 Employees</span>
            <span className="tile-sub">
              Locked — requires manager/owner access
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
