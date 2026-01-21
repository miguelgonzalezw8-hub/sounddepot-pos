// client/src/pages/EmployeesAdmin.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../session/SessionProvider";
import {
  listPosAccountsForShop,
  createPosAccount,
  updatePosAccount,
  setPosAccountActive,
  deletePosAccount,
} from "../services/authService";

export default function EmployeesAdmin() {
  const navigate = useNavigate();
  const { terminal, posAccount, devMode } = useSession();

  const tenantId = terminal?.tenantId || "";
  const shopId = terminal?.shopId || "";

  const isManager = useMemo(() => {
    const r = (posAccount?.role || "").toLowerCase();
    return r === "owner" || r === "manager";
  }, [posAccount?.role]);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // form
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState("sales");
  const [saving, setSaving] = useState(false);

  async function refresh() {
    if (!tenantId || !shopId) return;
    setLoading(true);
    try {
      const list = await listPosAccountsForShop({
        tenantId,
        shopId,
        includeInactive: true,
      });

      list.sort((a, b) => {
        const aa = String(a?.name || "").toLowerCase();
        const bb = String(b?.name || "").toLowerCase();
        return aa.localeCompare(bb);
      });

      setRows(list);
    } catch (e) {
      console.error(e);
      alert(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, shopId]);

  async function onCreate() {
    if (!(devMode || isManager)) return alert("Not authorized.");
    if (!tenantId || !shopId) return alert("Terminal not configured.");
    if (!String(name || "").trim()) return alert("Name is required.");
    if (String(pin || "").trim().length < 3) return alert("PIN must be at least 3 digits.");

    setSaving(true);
    try {
      await createPosAccount({
        tenantId,
        shopId,
        name,
        pin,
        role,
        active: true,
        createdBy: posAccount?.id || null,
      });
      setName("");
      setPin("");
      setRole("sales");
      await refresh();
    } catch (e) {
      console.error(e);
      alert(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function onToggleActive(emp) {
    if (!(devMode || isManager)) return alert("Not authorized.");
    const next = !emp.active;

    if (emp.id === posAccount?.id && next === false) {
      return alert("You can’t disable the currently unlocked manager account.");
    }

    try {
      await setPosAccountActive(emp.id, next);
      await refresh();
    } catch (e) {
      console.error(e);
      alert(e?.message || String(e));
    }
  }

  async function onChangePin(emp) {
    if (!(devMode || isManager)) return alert("Not authorized.");
    const next = prompt(`Set new PIN for ${emp.name || emp.id}:`, "");
    if (next == null) return;

    const trimmed = String(next).trim();
    if (trimmed.length < 3) return alert("PIN must be at least 3 digits.");

    try {
      await updatePosAccount(emp.id, { pin: trimmed });
      await refresh();
    } catch (e) {
      console.error(e);
      alert(e?.message || String(e));
    }
  }

  async function onChangeRole(emp) {
    if (!(devMode || isManager)) return alert("Not authorized.");
    const next = prompt(
      `Set role for ${emp.name || emp.id} (sales / installer / manager / owner):`,
      emp.role || "sales"
    );
    if (next == null) return;

    const r = String(next).trim().toLowerCase();
    if (!["sales", "installer", "manager", "owner"].includes(r)) {
      return alert("Role must be one of: sales, installer, manager, owner");
    }

    if (emp.id === posAccount?.id && (r === "sales" || r === "installer")) {
      return alert("You can’t demote the currently unlocked manager account while using it.");
    }

    try {
      await updatePosAccount(emp.id, { role: r });
      await refresh();
    } catch (e) {
      console.error(e);
      alert(e?.message || String(e));
    }
  }

  async function onDelete(emp) {
    if (!(devMode || isManager)) return alert("Not authorized.");
    if (emp.id === posAccount?.id) return alert("You can’t delete the currently unlocked account.");

    const ok = confirm(`Delete ${emp.name || emp.id}? (Recommended: disable instead)`);
    if (!ok) return;

    try {
      await deletePosAccount(emp.id);
      await refresh();
    } catch (e) {
      console.error(e);
      alert(e?.message || String(e));
    }
  }

  return (
    <div className="inventory-container">
      <div className="search-row" style={{ display: "flex", gap: 8 }}>
        <button className="search-box" onClick={() => navigate(-1)} style={{ width: 120 }}>
          ← Back
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Employees</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Create PINs and manage access for this shop
          </div>
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
            tenantId: {tenantId || "—"} • shopId: {shopId || "—"}
          </div>
        </div>
      </div>

      <div className="table-wrapper" style={{ padding: 12, marginTop: 10 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Add Employee</div>

        {!(devMode || isManager) ? (
          <div style={{ opacity: 0.7 }}>
            Not authorized. (Unlock with a manager PIN to edit employees.)
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr auto", gap: 8 }}>
            <input className="search-box" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="search-box" placeholder="PIN (3-8 digits)" value={pin} onChange={(e) => setPin(e.target.value)} />
            <select className="search-box" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="sales">sales</option>
              <option value="installer">installer</option>
              <option value="manager">manager</option>
              <option value="owner">owner</option>
            </select>
            <button className="search-box" style={{ width: 120 }} disabled={saving} onClick={onCreate}>
              {saving ? "Saving..." : "Add"}
            </button>
          </div>
        )}
      </div>

      <div className="table-wrapper" style={{ marginTop: 10 }}>
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="empty-state">No employees found for this shop.</div>
        ) : (
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Active</th>
                <th style={{ width: 320 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((emp) => (
                <tr key={emp.id}>
                  <td style={{ fontWeight: 700 }}>
                    {emp.name || "(no name)"}{" "}
                    {emp.id === posAccount?.id ? (
                      <span style={{ fontSize: 12, opacity: 0.7 }}>(current)</span>
                    ) : null}
                  </td>
                  <td>{emp.role || "sales"}</td>
                  <td>{emp.active ? "Yes" : "No"}</td>
                  <td>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button className="search-box" style={{ width: 120 }} onClick={() => onChangePin(emp)}>
                        Change PIN
                      </button>
                      <button className="search-box" style={{ width: 120 }} onClick={() => onChangeRole(emp)}>
                        Change Role
                      </button>
                      <button className="search-box" style={{ width: 120 }} onClick={() => onToggleActive(emp)}>
                        {emp.active ? "Disable" : "Enable"}
                      </button>
                      <button className="search-box" style={{ width: 120 }} onClick={() => onDelete(emp)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.6 }}>
        Tip: Prefer “Disable” instead of “Delete” to preserve history.
      </div>
    </div>
  );
}
