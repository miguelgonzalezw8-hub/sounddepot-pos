// client/src/pages/TerminalSetup.jsx
import { useMemo, useState } from "react";
import { loginManager, createShop, listShopsForTenant } from "../services/authService";
import { setTerminalConfig } from "../services/terminalConfig";
import { useSession } from "../session/SessionProvider";

function slugifyShopId(name) {
  const base = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const rand = Math.random().toString(36).slice(2, 7);
  return `shop-${base || "main"}-${rand}`;
}

function Field({ label, children, hint }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.4, marginBottom: 6, opacity: 0.8 }}>
        {label}
      </div>
      {children}
      {hint ? (
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.65 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function Card({ title, subtitle, children }) {
  return (
    <div
      style={{
        background: "white",
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        padding: 16,
        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
        marginBottom: 14,
      }}
    >
      {title ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 950, color: "#0f172a" }}>{title}</div>
          {subtitle ? (
            <div style={{ fontSize: 13, opacity: 0.75, color: "#0f172a" }}>{subtitle}</div>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

function Btn({ children, onClick, disabled, variant = "primary", type = "button" }) {
  const styles =
    variant === "primary"
      ? {
          background: disabled ? "#94a3b8" : "#0f172a",
          color: "white",
          border: "1px solid transparent",
        }
      : variant === "ghost"
      ? {
          background: "transparent",
          color: "#0f172a",
          border: "1px solid #e5e7eb",
        }
      : {
          background: disabled ? "#e5e7eb" : "#f1f5f9",
          color: "#0f172a",
          border: "1px solid #e5e7eb",
        };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: "100%",
        padding: "12px 12px",
        borderRadius: 12,
        fontWeight: 900,
        cursor: disabled ? "not-allowed" : "pointer",
        ...styles,
      }}
    >
      {children}
    </button>
  );
}

const inputStyle = {
  width: "100%",
  padding: 12,
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  outline: "none",
  background: "white",
};

export default function TerminalSetup() {
  const { setTerminal, loadUserProfile } = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState(null);

  const [shops, setShops] = useState([]);
  const [selectedShopId, setSelectedShopId] = useState("");

  const [newShopName, setNewShopName] = useState("");
  const [creatingShop, setCreatingShop] = useState(false);

  // ✅ IMPORTANT: this is what enables PIN bypass on owner terminals
  const [terminalMode, setTerminalMode] = useState("owner"); // "owner" | "shared"

  const hasAnyShops = useMemo(() => (shops?.length || 0) > 0, [shops]);

  async function refreshShops(tenantId) {
    const rows = await listShopsForTenant({ tenantId, includeInactive: true });
    const list = rows || [];
    setShops(list);

    // keep selection stable if possible
    if (list.length === 1) setSelectedShopId(list[0].id);
    if (list.length > 1 && !list.some((s) => s.id === selectedShopId)) {
      setSelectedShopId("");
    }
  }

  async function onManagerLogin(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await loginManager(email.trim(), password);
      const p = await loadUserProfile(user.uid);

      if (!p?.active) throw new Error("User is inactive (users/{uid}.active != true).");
      if (!p?.tenantId) throw new Error("Missing tenantId on users/{uid}.");

      setProfile(p);
      await refreshShops(p.tenantId);
    } catch (err) {
      alert(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  async function onCreateShop() {
    if (!profile?.tenantId) return alert("No tenantId loaded.");
    const name = String(newShopName || "").trim();
    if (!name) return alert("Enter a shop name.");

    setCreatingShop(true);
    try {
      const shopId = slugifyShopId(name);

      await createShop({
        shopId,
        tenantId: profile.tenantId,
        name,
        active: true,
      });

      await refreshShops(profile.tenantId);
      setSelectedShopId(shopId);
      setNewShopName("");
    } catch (err) {
      alert(err?.message || String(err));
    } finally {
      setCreatingShop(false);
    }
  }

  async function onRegisterTerminal() {
    if (!profile?.tenantId) return alert("No tenantId loaded.");
    if (!selectedShopId) return alert("Pick a shop.");

    setLoading(true);
    try {
      const config = {
        tenantId: profile.tenantId,
        shopId: selectedShopId,
        mode: terminalMode, // ✅ REQUIRED for owner PIN bypass
      };

      setTerminalConfig(config);
      setTerminal(config);
    } catch (err) {
      alert(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9" }}>
      <div style={{ maxWidth: 620, margin: "0 auto", padding: 18 }}>
        {/* Header */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 22, fontWeight: 950, color: "#0f172a" }}>Register Terminal</div>
          <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75, color: "#0f172a" }}>
            Owner terminals use <b>email + password</b>. Shared terminals use <b>PIN unlock</b> daily.
          </div>
        </div>

        {!profile ? (
          <Card
            title="Manager Login (one-time)"
            subtitle="Sign in with an owner/manager account to register this device."
          >
            <form onSubmit={onManagerLogin}>
              <Field label="Email">
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={inputStyle}
                  autoComplete="email"
                />
              </Field>

              <Field label="Password">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={inputStyle}
                  autoComplete="current-password"
                />
              </Field>

              <Btn type="submit" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </Btn>
            </form>
          </Card>
        ) : (
          <>
            <Card
              title="Account Loaded"
              subtitle="Choose terminal mode, create/select a shop, then register."
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
                <div style={{ fontSize: 13, color: "#0f172a" }}>
                  <div>
                    <span style={{ opacity: 0.7 }}>Tenant:</span>{" "}
                    <span style={{ fontWeight: 900 }}>{profile.tenantId}</span>
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <span style={{ opacity: 0.7 }}>User:</span>{" "}
                    <span style={{ fontWeight: 900 }}>
                      {profile.displayName} ({profile.role})
                    </span>
                  </div>
                </div>

                <Field
                  label="Terminal Mode"
                  hint={
                    terminalMode === "owner"
                      ? "Owner mode: no PIN screen. This device is for the owner/manager login."
                      : "Shared mode: requires PIN unlock (salespeople/techs use pins)."
                  }
                >
                  <select
                    value={terminalMode}
                    onChange={(e) => setTerminalMode(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="owner">Owner Terminal (email/password, no PIN)</option>
                    <option value="shared">Shared Terminal (PIN required)</option>
                  </select>
                </Field>
              </div>
            </Card>

            <Card
              title="Create Shop"
              subtitle="If this tenant has no shops yet, create the first one right here."
            >
              <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 10, color: "#0f172a" }}>
                Shops found: <b>{shops.length}</b> {hasAnyShops ? "(you can select below)" : "(none yet)"}
              </div>

              <Field label="Shop name" hint="Example: Madison, Huntsville, Mobile">
                <input
                  value={newShopName}
                  onChange={(e) => setNewShopName(e.target.value)}
                  placeholder="Madison"
                  style={inputStyle}
                />
              </Field>

              <Btn disabled={creatingShop} onClick={onCreateShop} variant="secondary">
                {creatingShop ? "Creating…" : "Create Shop"}
              </Btn>
            </Card>

            <Card title="Select Shop & Register" subtitle="Pick the shop this device belongs to.">
              <Field label="Shop">
                <select
                  value={selectedShopId}
                  onChange={(e) => setSelectedShopId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">Select a shop…</option>
                  {shops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name ? `${s.name} (${s.id})` : s.id}
                    </option>
                  ))}
                </select>
              </Field>

              <Btn disabled={loading} onClick={onRegisterTerminal}>
                {loading ? "Saving…" : "Register Terminal"}
              </Btn>

              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7, color: "#0f172a" }}>
                Tip: Set the owner’s main computer to <b>Owner Terminal</b>. Set front counter PCs to{" "}
                <b>Shared Terminal</b>.
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
