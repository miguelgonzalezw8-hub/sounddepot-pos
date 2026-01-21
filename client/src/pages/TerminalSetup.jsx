// client/src/pages/TerminalSetup.jsx
import { useMemo, useState } from "react";
import { loginManager } from "../services/authService";
import { setTerminalConfig } from "../services/terminalConfig";
import { useSession } from "../session/SessionProvider";

export default function TerminalSetup() {
  const { setTerminal, loadUserProfile } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState(null);
  const [selectedShopId, setSelectedShopId] = useState("");

  const shopIds = useMemo(() => profile?.shopIds || [], [profile]);

  async function onManagerLogin(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await loginManager(email.trim(), password);
      const p = await loadUserProfile(user.uid);

      if (!p?.active) throw new Error("User is inactive (users/{uid}.active != true).");
      if (!p?.tenantId) throw new Error("Missing tenantId on users/{uid}.");

      setProfile(p);
      if (Array.isArray(p.shopIds) && p.shopIds.length === 1) {
        setSelectedShopId(p.shopIds[0]);
      }
    } catch (err) {
      alert(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  async function onRegisterTerminal() {
    if (!profile?.tenantId) return alert("No tenantId loaded.");
    if (!selectedShopId) return alert("Pick a shop.");

    setLoading(true);
    try {
      const config = { tenantId: profile.tenantId, shopId: selectedShopId };
      setTerminalConfig(config);
      setTerminal(config);

      // ✅ Keep this terminal signed in (anonymous auth is disabled).
      // Daily user switching is handled via PIN unlock (posAccounts).
    } catch (err) {
      alert(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 20, maxWidth: 480 }}>
      <h2>Register this terminal</h2>
      <p style={{ opacity: 0.8 }}>
        Manager login (one-time). Then this terminal uses PIN unlock for daily use.
      </p>

      {!profile ? (
        <form onSubmit={onManagerLogin}>
          <label>Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", padding: 10, marginBottom: 10 }}
          />
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", padding: 10, marginBottom: 10 }}
          />
          <button disabled={loading} style={{ padding: 12, width: "100%" }}>
            {loading ? "Loading..." : "Manager Login"}
          </button>
        </form>
      ) : (
        <div>
          <div style={{ marginBottom: 10 }}>
            <div>
              <b>Tenant:</b> {profile.tenantId}
            </div>
            <div>
              <b>User:</b> {profile.displayName} ({profile.role})
            </div>
          </div>

          <label>Shop</label>
          <select
            value={selectedShopId}
            onChange={(e) => setSelectedShopId(e.target.value)}
            style={{ width: "100%", padding: 10, marginBottom: 10 }}
          >
            <option value="">Select a shop…</option>
            {shopIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>

          <button
            disabled={loading}
            onClick={onRegisterTerminal}
            style={{ padding: 12, width: "100%" }}
          >
            {loading ? "Saving..." : "Register Terminal"}
          </button>
        </div>
      )}
    </div>
  );
}
