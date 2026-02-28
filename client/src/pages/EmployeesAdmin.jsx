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
  createTenantInvite,
  sendInviteEmail,
  sha256Hex,
} from "../services/authService";
import { writeSession } from "../services/sessionService";

export default function EmployeesAdmin() {
  const navigate = useNavigate();

  // include firebaseUser so owner-terminal bypass matches rules (signedIn required)
  const { terminal, posAccount, devMode, firebaseUser, userProfile } = useSession();
  const tenantId = terminal?.tenantId || "";
  const shopId = terminal?.shopId || "";

  // terminal mode
  const isOwnerTerminal = terminal?.mode === "owner";

  // unlocked PIN role (posAccounts)
  const isManager = useMemo(() => {
    const r = (posAccount?.role || "").toLowerCase();
    return r === "owner" || r === "manager";
  }, [posAccount?.role]);

  const isOwner = useMemo(() => {
    const r = (posAccount?.role || "").toLowerCase();
    return r === "owner";
  }, [posAccount?.role]);

  /**
   * Align UI with rules:
   * - Writes require signedIn() OR dev
   * - Owner terminal requires firebaseUser signed in
   */
  const canEdit = devMode || (isOwnerTerminal && !!firebaseUser) || isManager;

  /**
   * Delete: dev OR owner (posAccount owner) OR firebase owner
   */
  const profileRole = String(userProfile?.role || "").toLowerCase();
  const firebaseIsOwner = ["owner", "tenant_owner", "main_owner", "tenant"].includes(profileRole);
  const canDelete = devMode || isOwner || (firebaseIsOwner && !!firebaseUser);

  // ✅ allow PIN link invites for anyone who can edit (now that rules allow /mail create)
  const canSendPinLinkInvite = canEdit;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // =========================
  // DIRECT PIN FORM
  // =========================
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState("sales");
  const [saving, setSaving] = useState(false);

  // =========================
  // PIN LINK INVITE FORM
  // =========================
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("sales");
  const [invitingPin, setInvitingPin] = useState(false);

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

  // =========================
  // DIRECT PIN CREATE
  // =========================
  async function onCreate() {
    if (!canEdit) return alert("Not authorized.");
    if (!tenantId || !shopId) return alert("Terminal not configured.");
    if (!String(name || "").trim()) return alert("Name is required.");
    if (String(pin || "").trim().length < 3) return alert("PIN must be at least 3 digits.");

    setSaving(true);
    try {
      await writeSession({ tenantId, shopId, posAccountId: posAccount?.id || null });

      const r = String(role || "sales").toLowerCase();
      if (!["sales", "manager", "owner"].includes(r)) {
        return alert("POS employee role must be: sales, manager, owner");
      }

      await createPosAccount({
        tenantId,
        shopId,
        name: String(name || "").trim(),
        role: r,
        active: true,
        createdBy: posAccount?.id || null,
        pin: String(pin || "").trim(), // hashes in authService
      });

      setName("");
      setPin("");
      setRole("sales");
      await refresh();
    } catch (e) {
      console.error("[EmployeesAdmin onCreate]", e);
      alert(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  // =========================
  // PIN LINK INVITE
  // =========================
  async function onInvitePinSetup() {
    if (!canEdit) return alert("Not authorized.");
    if (!canSendPinLinkInvite) return alert("Not authorized.");
    if (!tenantId || !shopId) return alert("Terminal not configured.");

    const nm = String(inviteName || "").trim();
    if (!nm) return alert("Employee name is required.");

    const em = String(inviteEmail || "").trim().toLowerCase();
    if (!em || !em.includes("@")) return alert("Enter a valid email.");

    const r = String(inviteRole || "").trim().toLowerCase();
    if (!["sales", "manager", "owner"].includes(r)) {
      return alert("Role must be one of: sales, manager, owner");
    }

    setInvitingPin(true);
    try {
      const posId = await createPosAccount({
        tenantId,
        shopId,
        name: nm,
        role: r,
        active: true,
        createdBy: posAccount?.id || null,
        // no pin yet -> invite page sets pinHash
      });

      await createTenantInvite({
        inviteId: posId,
        tenantId,
        email: em,
        role: r,
        shopIds: shopId ? [shopId] : [],
        shopId,
        name: nm,
        active: true,
      });

      await sendInviteEmail({
        to: em,
        inviteId: posId,
        appUrl: "https://volterahq.com",
        tenantName: "",
        accountNumber: "",
      });

      alert("PIN setup invite sent.");
      setInviteName("");
      setInviteEmail("");
      setInviteRole("sales");
      await refresh();
    } catch (e) {
      console.error("[EmployeesAdmin onInvitePinSetup]", e);
      alert(e?.message || String(e));
    } finally {
      setInvitingPin(false);
    }
  }

  // =========================
  // TOGGLE ACTIVE
  // =========================
  async function onToggleActive(emp) {
    if (!canEdit) return alert("Not authorized.");
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

  // =========================
  // CHANGE PIN
  // =========================
  async function onChangePin(emp) {
    if (!canEdit) return alert("Not authorized.");
    const next = prompt(`Set new PIN for ${emp.name || emp.id}:`, "");
    if (next == null) return;

    const trimmed = String(next).trim();
    if (trimmed.length < 3) return alert("PIN must be at least 3 digits.");

    try {
      const hash = await sha256Hex(trimmed);
      await updatePosAccount(emp.id, { pinHash: hash, pinSetAt: Date.now() });
      await refresh();
    } catch (e) {
      console.error(e);
      alert(e?.message || String(e));
    }
  }

  // =========================
  // CHANGE ROLE
  // =========================
  async function onChangeRole(emp) {
    if (!canEdit) return alert("Not authorized.");
    const next = prompt(
      `Set POS role for ${emp.name || emp.id} (sales / manager / owner):`,
      emp.role || "sales"
    );
    if (next == null) return;

    const r = String(next).trim().toLowerCase();
    if (!["sales", "manager", "owner"].includes(r)) {
      return alert("Role must be one of: sales, manager, owner");
    }

    if (emp.id === posAccount?.id && r === "sales") {
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

  // =========================
  // DELETE (OWNER/DEV ONLY)
  // =========================
  async function onDelete(emp) {
    if (!canDelete) return alert("Only the owner can delete. Use Disable instead.");
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
            Create PINs and manage POS access for this shop
          </div>

          <div style={{ fontSize: 13, marginTop: 6, fontWeight: 700, opacity: 0.85 }}>
            Shop —{" "}
            <span style={{ fontFamily: "monospace", fontWeight: 800 }}>
              {shopId ? shopId.slice(-6) : "—"}
            </span>
          </div>
        </div>
      </div>

      <div className="table-wrapper" style={{ padding: 12, marginTop: 10 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Add Employee</div>

        {!canEdit ? (
          <div style={{ opacity: 0.7 }}>
            Not authorized. (You must be signed in on owner terminals, or unlock with a manager PIN.)
          </div>
        ) : (
          <>
            {/* Direct PIN */}
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Direct PIN</div>
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr auto", gap: 8 }}>
              <input
                className="search-box"
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                className="search-box"
                placeholder="PIN (3-8 digits)"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
              />
              <select className="search-box" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="sales">sales</option>
                <option value="manager">manager</option>
                <option value="owner">owner</option>
              </select>
              <button className="search-box" style={{ width: 120 }} disabled={saving} onClick={onCreate}>
                {saving ? "Saving..." : "Add"}
              </button>
            </div>

            {/* PIN link invite */}
            <div style={{ marginTop: 14, fontWeight: 800 }}>Invite PIN Setup Link</div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
              Sends a setup link so the employee can set their PIN. If email fails, you can still use Direct PIN.
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 1.6fr 1fr auto",
                gap: 8,
                marginTop: 8,
              }}
            >
              <input
                className="search-box"
                placeholder="Employee name"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                disabled={invitingPin}
              />
              <input
                className="search-box"
                placeholder="Employee email (name@domain.com)"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={invitingPin}
              />
              <select
                className="search-box"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                disabled={invitingPin}
              >
                <option value="sales">sales</option>
                <option value="manager">manager</option>
                <option value="owner">owner</option>
              </select>
              <button
                className="search-box"
                style={{ width: 160 }}
                disabled={invitingPin}
                onClick={onInvitePinSetup}
              >
                {invitingPin ? "Sending..." : "Send PIN Link"}
              </button>
            </div>
          </>
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
                <th>PIN</th>
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
                  <td style={{ fontSize: 12, opacity: 0.75 }}>{emp.pinHash ? "✅ set" : "—"}</td>
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

                      {canDelete ? (
                        <button className="search-box" style={{ width: 120 }} onClick={() => onDelete(emp)}>
                          Delete
                        </button>
                      ) : null}
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