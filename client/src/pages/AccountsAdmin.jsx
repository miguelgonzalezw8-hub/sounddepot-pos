// client/src/pages/AccountsAdmin.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../session/SessionProvider";
import {
  createTenantAndInviteOwner,
  listTenants,
  setTenantActive,
  deleteTenant,
  updateTenant,
} from "../services/authService";

export default function AccountsAdmin() {
  const navigate = useNavigate();
  const { devMode } = useSession();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [tenantName, setTenantName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [appUrl, setAppUrl] = useState(() => localStorage.getItem("appUrl") || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!devMode) navigate("/", { replace: true });
  }, [devMode, navigate]);

  const canCreate = useMemo(
    () => !!tenantName.trim() && !!ownerEmail.trim() && !!appUrl.trim(),
    [tenantName, ownerEmail, appUrl]
  );

  async function refresh() {
    setLoading(true);
    try {
      const list = await listTenants({ includeInactive: true });
      list.sort((a, b) => String(a.accountNumber || "").localeCompare(String(b.accountNumber || "")));
      setRows(list);
    } catch (e) {
      console.error(e);
      alert(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (devMode) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devMode]);

  async function onCreate() {
    if (!canCreate) return alert("Enter Account Name, Owner Email, and App URL.");
    setSaving(true);
    try {
      localStorage.setItem("appUrl", appUrl.trim());

      const res = await createTenantAndInviteOwner({
        tenantName: tenantName.trim(),
        ownerEmail: ownerEmail.trim(),
        appUrl: appUrl.trim(),
      });

      alert(
        `Account created.\nAccount Number: ${res.accountNumber}\nInvite: ${res.inviteId}\nEmail queued to: ${ownerEmail.trim()}`
      );

      setTenantName("");
      setOwnerEmail("");
      await refresh();
    } catch (e) {
      console.error(e);
      alert(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function onToggleActive(row) {
    try {
      await setTenantActive(row.id, !row.active);
      await refresh();
    } catch (e) {
      console.error(e);
      alert(e?.message || String(e));
    }
  }

  async function onRename(row) {
    const next = prompt(`Rename account "${row.accountNumber || row.id}"`, row.name || "");
    if (next == null) return;
    const trimmed = String(next).trim();
    if (!trimmed) return alert("Name cannot be empty.");
    try {
      await updateTenant(row.id, { name: trimmed });
      await refresh();
    } catch (e) {
      console.error(e);
      alert(e?.message || String(e));
    }
  }

  async function onDelete(row) {
    const ok = confirm(
      `Delete account ${row.accountNumber || row.id}?\n\nThis will delete the tenant doc only (not shops/orders).`
    );
    if (!ok) return;
    try {
      await deleteTenant(row.id);
      await refresh();
    } catch (e) {
      console.error(e);
      alert(e?.message || String(e));
    }
  }

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
          <div style={{ fontWeight: 900, fontSize: 18 }}>Accounts</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Dev-only: create tenants + auto-email invite</div>
        </div>
      </div>

      <div className="table-wrapper" style={{ padding: 12, marginTop: 10 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Email settings</div>
        <input
          className="search-box"
          placeholder="App URL (https://yourdomain.com)"
          value={appUrl}
          onChange={(e) => setAppUrl(e.target.value)}
        />
        <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>
          This must match where your app is hosted. Invite links will send users here.
        </div>
      </div>

      <div className="table-wrapper" style={{ padding: 12, marginTop: 10 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Create Account</div>

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.2fr auto", gap: 8 }}>
          <input
            className="search-box"
            placeholder="Account name (e.g., Sound Depot)"
            value={tenantName}
            onChange={(e) => setTenantName(e.target.value)}
          />
          <input
            className="search-box"
            placeholder="Owner email (they receive invite)"
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
          />
          <button
            className="search-box"
            style={{ width: 160 }}
            disabled={!canCreate || saving}
            onClick={onCreate}
          >
            {saving ? "Creating..." : "Create + Email Invite"}
          </button>
        </div>
      </div>

      <div className="table-wrapper" style={{ marginTop: 10 }}>
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="empty-state">No accounts found.</div>
        ) : (
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Account #</th>
                <th>Name</th>
                <th>Owner Email</th>
                <th>Active</th>
                <th style={{ width: 320 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 900 }}>{r.accountNumber || "—"}</td>
                  <td>{r.name || "—"}</td>
                  <td style={{ fontSize: 12, opacity: 0.85 }}>{r.ownerEmail || "—"}</td>
                  <td>{r.active ? "Yes" : "No"}</td>
                  <td>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button className="search-box" style={{ width: 120 }} onClick={() => onRename(r)}>
                        Rename
                      </button>
                      <button className="search-box" style={{ width: 120 }} onClick={() => onToggleActive(r)}>
                        {r.active ? "Disable" : "Enable"}
                      </button>
                      <button className="search-box" style={{ width: 120 }} onClick={() => onDelete(r)}>
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
    </div>
  );
}
