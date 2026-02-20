// client/src/pages/ManagerMenu.jsx
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../session/SessionProvider";

export default function ManagerMenu() {
  const navigate = useNavigate();
  const { devMode, posAccount, terminal } = useSession();

  // ✅ OWNER TERMINAL bypass (no PIN required)
  const isOwnerTerminal = useMemo(() => terminal?.mode === "owner", [terminal?.mode]);

  const role = useMemo(() => {
    if (devMode) return "devMode";
    if (isOwnerTerminal) return "owner";
    return String(posAccount?.role || "").toLowerCase();
  }, [devMode, isOwnerTerminal, posAccount?.role]);

  const isManager = useMemo(() => {
    if (devMode) return true;
    if (isOwnerTerminal) return true; // ✅ owner terminal should have full manager access
    return role === "owner" || role === "manager";
  }, [devMode, isOwnerTerminal, role]);

  // Manager PIN page should be reachable even if not manager yet (bootstrap).
  // Everything else is manager-only.
  const canSeeManagerTools = isManager;
  const canSeeEmployees = isManager;

  // ✅ tile sizing so it wraps nicely (no sideways scroll)
  const tileStyle = {
    flex: "1 1 260px",
    minWidth: 260,
    maxWidth: 420,
  };

  return (
    <div className="inventory-container">
      <div className="search-row" style={{ display: "flex", gap: 8 }}>
        <button className="search-box" onClick={() => navigate(-1)} style={{ width: 120 }}>
          ← Back
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Manager</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Manager-only tools</div>
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
            Role: {role || "— (not unlocked)"}
            {isOwnerTerminal ? " (OWNER TERMINAL)" : ""}
          </div>
        </div>
      </div>

      {!isManager && !devMode && !isOwnerTerminal && (
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
          You’re not unlocked as a manager yet. Set your Manager PIN, then unlock with a manager/owner
          POS account to access manager tools.
        </div>
      )}

      {/* ✅ WRAP tiles so there is NEVER a horizontal scroll */}
      <div
        className="inventory-tiles"
        style={{
          marginTop: 10,
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "stretch",
        }}
      >
        {/* Always visible (bootstrap path) */}
        <div className="tile" style={tileStyle} onClick={() => navigate("/manager/security")}>
          <span className="tile-title">🔒 Manager PIN</span>
          <span className="tile-sub">Set / change PIN</span>
        </div>

        {/* EMPLOYEES */}
        {canSeeEmployees ? (
          <div className="tile" style={tileStyle} onClick={() => navigate("/manager/employees")}>
            <span className="tile-title">👥 Employees</span>
            <span className="tile-sub">Create PIN users for this shop</span>
          </div>
        ) : (
          <div
            className="tile"
            style={{ ...tileStyle, opacity: 0.65 }}
            onClick={() =>
              alert("Employees is manager-only. Unlock with a manager/owner POS account first.")
            }
          >
            <span className="tile-title">👥 Employees</span>
            <span className="tile-sub">Locked — requires manager/owner access</span>
          </div>
        )}

        {/* INSTALLERS */}
        <div className="tile" style={tileStyle} onClick={() => navigate("/manager/installers")}>
          <span className="tile-title">🛠 Installers</span>
          <span className="tile-sub">Profiles, certs, pay</span>
        </div>

        {/* BUNDLES */}
        {canSeeManagerTools ? (
          <div className="tile" style={tileStyle} onClick={() => navigate("/manager/bundles")}>
            <span className="tile-title">📦 Bundles</span>
            <span className="tile-sub">Create vehicle bundles + bundle pricing</span>
          </div>
        ) : (
          <div
            className="tile"
            style={{ ...tileStyle, opacity: 0.65 }}
            onClick={() =>
              alert("Bundles is manager-only. Unlock with a manager/owner POS account first.")
            }
          >
            <span className="tile-title">📦 Bundles</span>
            <span className="tile-sub">Locked — requires manager/owner access</span>
          </div>
        )}

        {/* COUPONS */}
        {canSeeManagerTools ? (
          <div className="tile" style={tileStyle} onClick={() => navigate("/manager/coupons")}>
            <span className="tile-title">🏷️ Coupons</span>
            <span className="tile-sub">Auto-generate codes + apply rules</span>
          </div>
        ) : (
          <div
            className="tile"
            style={{ ...tileStyle, opacity: 0.65 }}
            onClick={() =>
              alert("Coupons is manager-only. Unlock with a manager/owner POS account first.")
            }
          >
            <span className="tile-title">🏷️ Coupons</span>
            <span className="tile-sub">Locked — requires manager/owner access</span>
          </div>
        )}

        {/* LABOR */}
        {canSeeManagerTools ? (
          <div className="tile" style={tileStyle} onClick={() => navigate("/manager/labor")}>
            <span className="tile-title">🛠️ Labor</span>
            <span className="tile-sub">Configure labor charging (Option 2)</span>
          </div>
        ) : (
          <div
            className="tile"
            style={{ ...tileStyle, opacity: 0.65 }}
            onClick={() =>
              alert("Labor is manager-only. Unlock with a manager/owner POS account first.")
            }
          >
            <span className="tile-title">🛠️ Labor</span>
            <span className="tile-sub">Locked — requires manager/owner access</span>
          </div>
        )}
      </div>
    </div>
  );
}







