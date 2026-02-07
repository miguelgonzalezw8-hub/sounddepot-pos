import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getFunctions, httpsCallable } from "firebase/functions";
import { collection, onSnapshot, query, where, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import { useSession } from "../session/SessionProvider";

export default function EmployeesAdmin() {
  const navigate = useNavigate();
  const { terminal, booting, isUnlocked, devMode } = useSession();
  const tenantId = terminal?.tenantId;

  const [rows, setRows] = useState([]);
  const [loadingList, setLoadingList] = useState(true);

  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("installer");
  const [shopIdsText, setShopIdsText] = useState(""); // comma-separated
  const [resetPassword, setResetPassword] = useState(true);

  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");

  // List employees in this tenant
  useEffect(() => {
    if (booting) return;
    if (!devMode && !isUnlocked) return;

    if (!tenantId) {
      setRows([]);
      setLoadingList(false);
      return;
    }

    setLoadingList(true);
    const qy = query(
      collection(db, "users"),
      where("tenantId", "==", tenantId),
      orderBy("updatedAt", "desc")
    );

    const unsub = onSnapshot(
      qy,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoadingList(false);
      },
      (e) => {
        console.error(e);
        setLoadingList(false);
      }
    );

    return () => unsub();
  }, [booting, isUnlocked, devMode, tenantId]);

  const parsedShopIds = useMemo(() => {
    return shopIdsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }, [shopIdsText]);

  const createLogin = async () => {
    setErr("");
    setResult(null);

    if (!tenantId) {
      setErr("No tenant selected. Please set up the terminal.");
      return;
    }
    if (!email.trim()) {
      setErr("Email is required.");
      return;
    }

    setSaving(true);
    try {
      const fn = httpsCallable(getFunctions(), "createEmployeeLogin");
      const res = await fn({
        tenantId, // keep tenant-scoped to your terminal
        email: email.trim(),
        name: name.trim(),
        role,
        shopIds: parsedShopIds,
        resetPassword,
        hidePassword: false, // show once
      });

      setResult(res.data || null);

      // clear form
      setEmail("");
      setName("");
      setShopIdsText("");
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Failed to create login.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="inventory-container">
      <div className="search-row" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="search-box" style={{ width: 120 }} onClick={() => navigate(-1)}>
          ← Back
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Employee Logins</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Create or reset employee login + set role/claims
          </div>
        </div>
      </div>

      <div className="table-wrapper" style={{ padding: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Create / Reset Login</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.7, marginBottom: 4 }}>Email</div>
            <input className="search-box" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.7, marginBottom: 4 }}>Name</div>
            <input className="search-box" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.7, marginBottom: 4 }}>Role</div>
            <select className="search-box" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="installer">installer</option>
              <option value="manager">manager</option>
              <option value="owner">owner</option>
            </select>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.7, marginBottom: 4 }}>
              Shop IDs (optional, comma separated)
            </div>
            <input
              className="search-box"
              value={shopIdsText}
              onChange={(e) => setShopIdsText(e.target.value)}
              placeholder="shop_1, shop_2"
            />
          </div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          <input type="checkbox" checked={resetPassword} onChange={() => setResetPassword((v) => !v)} />
          <span style={{ fontSize: 13 }}>Reset password / set temp password (recommended)</span>
        </label>

        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button className="save-btn" onClick={createLogin} disabled={saving}>
            {saving ? "Saving..." : "Create Login"}
          </button>
        </div>

        {err && (
          <div style={{ marginTop: 10, padding: 10, borderRadius: 12, border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.08)", color: "#991b1b", fontSize: 13 }}>
            {err}
          </div>
        )}

        {result?.ok && (
          <div style={{ marginTop: 10, padding: 10, borderRadius: 12, border: "1px solid rgba(16,185,129,0.35)", background: "rgba(16,185,129,0.08)", color: "#065f46", fontSize: 13 }}>
            <div style={{ fontWeight: 900 }}>Login created/updated</div>
            <div>Email: {result.email}</div>
            {result.tempPassword && (
              <div style={{ marginTop: 6 }}>
                Temp Password (show once): <b>{result.tempPassword}</b>
              </div>
            )}
            <div style={{ marginTop: 6, opacity: 0.8 }}>They must sign out/in to refresh claims.</div>
          </div>
        )}
      </div>

      <div className="table-wrapper" style={{ marginTop: 10 }}>
        <div style={{ padding: 12, fontWeight: 900 }}>Employees in this tenant</div>

        {loadingList ? (
          <div className="empty-state">Loading…</div>
        ) : !tenantId ? (
          <div className="empty-state">No tenant selected.</div>
        ) : rows.length === 0 ? (
          <div className="empty-state">No employees found.</div>
        ) : (
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>ShopIds</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 800 }}>{u.name || "—"}</td>
                  <td>{u.email || "—"}</td>
                  <td>{u.role || "—"}</td>
                  <td style={{ fontSize: 12, opacity: 0.8 }}>
                    {Array.isArray(u.shopIds) ? u.shopIds.join(", ") : "—"}
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
