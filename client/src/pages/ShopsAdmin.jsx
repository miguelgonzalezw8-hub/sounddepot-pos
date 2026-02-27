// client/src/pages/ShopsAdmin.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../session/SessionProvider";
import {
  createShop,
  listShopsForTenant,
  updateShop,
  getTenantByAccountNumber,
} from "../services/authService";

function cleanId(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "");
}

export default function ShopsAdmin() {
  const navigate = useNavigate();
  const { devMode } = useSession();

  const [accountNumber, setAccountNumber] = useState("");
  const [tenant, setTenant] = useState(null); // {id, accountNumber, name...}

  const tenantId = tenant?.id || "";

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // form
  const [shopId, setShopId] = useState("");
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!devMode) navigate("/", { replace: true });
  }, [devMode, navigate]);

  const canLoad = useMemo(() => !!tenantId, [tenantId]);

  async function resolveTenant() {
    const n = String(accountNumber || "").trim();
    if (!n) {
      setTenant(null);
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const t = await getTenantByAccountNumber(n);
      if (!t) {
        setTenant(null);
        setRows([]);
        alert("Account not found for that Account #.");
        return;
      }
      setTenant(t);
    } catch (e) {
      console.error(e);
      alert(e?.message || String(e));
      setTenant(null);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    if (!tenantId) return;
    setLoading(true);
    try {
      const list = await listShopsForTenant({ tenantId, includeInactive: true });
      list.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      setRows(list);
    } catch (e) {
      console.error(e);
      alert(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!devMode) return;
    if (!tenantId) {
      setRows([]);
      return;
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devMode, tenantId]);

  async function onCreate() {
    if (!tenantId) return alert("Select an Account # first.");
    const id = cleanId(shopId);
    if (!id) return alert("Shop ID is required. Example: madison");
    if (!String(name || "").trim()) return alert("Shop name is required.");

    setSaving(true);
    try {
      await createShop({
        shopId: id,
        tenantId,
        name: String(name).trim(),
        active: !!active,
      });
      setShopId("");
      setName("");
      setActive(true);
      await refresh();
    } catch (e) {
      console.error(e);
      alert(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function onToggleActive(row) {
    const next = !row.active;
    try {
      await updateShop(row.id, { active: next });
      await refresh();
    } catch (e) {
      console.error(e);
      alert(e?.message || String(e));
    }
  }

  async function onRename(row) {
    const next = prompt(`Rename shop "${row.id}"`, row.name || "");
    if (next == null) return;
    const trimmed = String(next).trim();
    if (!trimmed) return alert("Name cannot be empty.");
    try {
      await updateShop(row.id, { name: trimmed });
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
          <div style={{ fontWeight: 900, fontSize: 18 }}>Shops</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Dev-only: create/edit shops</div>
        </div>
      </div>

      <div className="table-wrapper" style={{ padding: 12, marginTop: 10 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Account</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
          <input
            className="search-box"
            placeholder="Account # (ex: 100001)"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
          />
          <button className="search-box" style={{ width: 160 }} onClick={resolveTenant} disabled={loading}>
            {loading ? "Loading..." : "Load Account"}
          </button>
        </div>

        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>
          {tenant ? (
            <>
              <b>Account:</b> #{tenant.accountNumber} • {tenant.name || "—"} • {tenant.ownerEmail || "—"}
            </>
          ) : (
            <>Enter an Account # to manage shops for that customer.</>
          )}
        </div>
      </div>

      <div className="table-wrapper" style={{ padding: 12, marginTop: 10 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Add Shop</div>

        {!canLoad ? (
          <div style={{ opacity: 0.75 }}>Load an Account first.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr 0.6fr auto", gap: 8 }}>
            <input
              className="search-box"
              placeholder="shopId (madison)"
              value={shopId}
              onChange={(e) => setShopId(e.target.value)}
            />
            <input
              className="search-box"
              placeholder="name (Madison)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <select
              className="search-box"
              value={active ? "true" : "false"}
              onChange={(e) => setActive(e.target.value === "true")}
            >
              <option value="true">active</option>
              <option value="false">inactive</option>
            </select>

            <button className="search-box" style={{ width: 140 }} disabled={saving} onClick={onCreate}>
              {saving ? "Saving..." : "Create Shop"}
            </button>
          </div>
        )}
      </div>

      <div className="table-wrapper" style={{ marginTop: 10 }}>
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="empty-state">No shops found.</div>
        ) : (
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Shop ID</th>
                <th>Name</th>
                <th>Active</th>
                <th style={{ width: 260 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 800 }}>{r.id}</td>
                  <td>{r.name || "—"}</td>
                  <td>{r.active ? "Yes" : "No"}</td>
                  <td>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button className="search-box" style={{ width: 120 }} onClick={() => onRename(r)}>
                        Rename
                      </button>
                      <button className="search-box" style={{ width: 120 }} onClick={() => onToggleActive(r)}>
                        {r.active ? "Disable" : "Enable"}
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