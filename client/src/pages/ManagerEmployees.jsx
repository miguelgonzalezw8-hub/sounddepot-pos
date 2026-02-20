import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useSession } from "../session/SessionProvider";

export default function ManagerEmployees() {
  const navigate = useNavigate();
  const { devMode, posAccount, terminal, booting, isUnlocked } = useSession();

  const tenantId = terminal?.tenantId || "";
  const shopId = terminal?.shopId || "";

  const allowed = useMemo(() => {
    if (devMode) return true;
    const role = String(posAccount?.role || "").toLowerCase();
    return role === "owner" || role === "manager";
  }, [devMode, posAccount?.role]);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");

  const [form, setForm] = useState({
    email: "",
    name: "",
    role: "installer", // default
    assignThisShop: true,
    resetPassword: false,
  });

  const [createdTemp, setCreatedTemp] = useState(null); // { email, tempPassword, uid }

  const loadEmployees = async () => {
    if (!tenantId) return;

    setLoading(true);
    setErr("");
    try {
      // List all user profiles in this tenant
      const qy = query(
        collection(db, "users"),
        where("tenantId", "==", tenantId),
        orderBy("email", "asc")
      );

      const snap = await getDocs(qy);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setRows(list);
    } catch (e) {
      console.error(e);
      setErr(e?.message?.includes("permission") ? "Permission denied." : "Failed to load employees.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (booting) return;
    if (!devMode && !isUnlocked) return;
    if (!allowed) return;
    if (!tenantId) return;
    loadEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booting, devMode, isUnlocked, allowed, tenantId]);

  const createLogin = async () => {
    setErr("");
    setCreatedTemp(null);

    if (!tenantId) {
      setErr("No tenant selected. Terminal must have a tenantId.");
      return;
    }

    const email = String(form.email || "").trim().toLowerCase();
    const name = String(form.name || "").trim();
    const role = String(form.role || "").trim();

    if (!email) {
      setErr("Email is required.");
      return;
    }
    if (!role) {
      setErr("Role is required.");
      return;
    }

    setLoading(true);
    try {
      const functions = getFunctions(undefined, "us-central1");
      const fn = httpsCallable(functions, "createEmployeeLogin");

      const payload = {
        tenantId,
        email,
        name,
        role,
        shopIds: form.assignThisShop && shopId ? [shopId] : [],
        resetPassword: !!form.resetPassword,
      };

      const res = await fn(payload);
      const data = res?.data || {};

      // Show temp password only if it was generated
      if (data?.tempPassword) {
        setCreatedTemp({
          email: data.email,
          uid: data.uid,
          tempPassword: data.tempPassword,
        });
      }

      // reset form bits (keep role)
      setForm((p) => ({
        ...p,
        email: "",
        name: "",
        resetPassword: false,
      }));

      await loadEmployees();
    } catch (e) {
      console.error(e);
      const msg =
        e?.message?.includes("permission") ? "Permission denied." :
        e?.message?.includes("Tenant mismatch") ? "Tenant mismatch." :
        e?.message || "Failed to create login.";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    // Keep simple for now: show all. You can add search later.
    return rows;
  }, [rows]);

  if (!allowed) {
    return (
      <div className="inventory-container">
        <div className="table-wrapper" style={{ padding: 16 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Employees</div>
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
      <div className="search-row" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="search-box" onClick={() => navigate(-1)} style={{ width: 120 }}>
          ← Back
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Employees</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Create logins (email/password) + assign tenant role
          </div>
        </div>

        <button className="search-box" style={{ width: 140 }} onClick={loadEmployees} disabled={loading || !tenantId}>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {/* CREATE LOGIN */}
      <div className="table-wrapper" style={{ padding: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Create / Update Login</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
          <input
            className="search-box"
            placeholder="Employee email"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            disabled={loading}
          />
          <input
            className="search-box"
            placeholder="Name (optional)"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            disabled={loading}
          />

          <select
            className="search-box"
            value={form.role}
            onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
            disabled={loading}
          >
            <option value="installer">installer</option>
            <option value="manager">manager</option>
            <option value="owner">owner</option>
          </select>

          <div style={{ display: "flex", gap: 10, alignItems: "center", paddingLeft: 6 }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
              <input
                type="checkbox"
                checked={!!form.assignThisShop}
                onChange={() => setForm((p) => ({ ...p, assignThisShop: !p.assignThisShop }))}
                disabled={loading}
              />
              Assign this shop
              <span style={{ opacity: 0.6 }}>{shopId ? `(shopId: ${shopId})` : "(no shopId)"}</span>
            </label>
          </div>

          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, alignItems: "center" }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
              <input
                type="checkbox"
                checked={!!form.resetPassword}
                onChange={() => setForm((p) => ({ ...p, resetPassword: !p.resetPassword }))}
                disabled={loading}
              />
              Reset password (generate temp password)
            </label>

            <button className="save-btn" onClick={createLogin} disabled={loading}>
              {loading ? "Working..." : "Create Login"}
            </button>
          </div>
        </div>

        {createdTemp && (
          <div style={{ marginTop: 10, padding: 10, borderRadius: 12, border: "1px solid rgba(16,185,129,0.35)", background: "rgba(16,185,129,0.08)" }}>
            <div style={{ fontWeight: 900 }}>Temp password generated</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>
              <b>Email:</b> {createdTemp.email}
            </div>
            <div style={{ fontSize: 13, marginTop: 4 }}>
              <b>Temp Password:</b> <span style={{ fontFamily: "monospace" }}>{createdTemp.tempPassword}</span>
            </div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
              Copy this now — you won’t be able to retrieve it later.
            </div>
          </div>
        )}

        {err && (
          <div style={{ marginTop: 10, padding: 10, borderRadius: 12, border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.08)", color: "#991b1b", fontSize: 13 }}>
            {err}
          </div>
        )}
      </div>

      {/* LIST */}
      <div className="table-wrapper" style={{ marginTop: 10 }}>
        <table className="inventory-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Role</th>
              <th>ShopIds</th>
              <th>Active</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty-state">No employees found.</td>
              </tr>
            ) : (
              filtered.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 800 }}>{u.email || "—"}</td>
                  <td>{u.name || "—"}</td>
                  <td>{u.role || "—"}</td>
                  <td style={{ fontSize: 12, opacity: 0.85 }}>
                    {Array.isArray(u.shopIds) ? u.shopIds.join(", ") : (u.shopIds ? String(u.shopIds) : "—")}
                  </td>
                  <td>{u.active === false ? "No" : "Yes"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div style={{ padding: 12, fontSize: 12, opacity: 0.7 }}>
          Tenant: <b>{tenantId || "—"}</b>
        </div>
      </div>
    </div>
  );
}







