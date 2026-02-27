// client/src/pages/TerminalSetup.jsx
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listShopsForTenant, resolveTenantIdFromProductKey } from "../services/authService";
import { setTerminalConfig } from "../services/terminalConfig";
import { useSession } from "../session/SessionProvider";

const inputStyle = {
  width: "100%",
  padding: 12,
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  outline: "none",
  background: "white",
  fontSize: 14,
};

function Card({ children }) {
  return (
    <div
      style={{
        background: "white",
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        padding: 18,
        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
      }}
    >
      {children}
    </div>
  );
}

function Btn({ children, onClick, disabled, type = "button", variant = "primary" }) {
  const base = {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 12,
    fontWeight: 900,
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "all 0.15s ease",
    fontSize: 14,
  };

  const styles =
    variant === "primary"
      ? {
          background: disabled ? "hsl(var(--brand-primary) / 0.4)" : "hsl(var(--brand-primary))",
          color: "white",
          border: "1px solid transparent",
        }
      : {
          background: "transparent",
          color: "#0f172a",
          border: "1px solid #e5e7eb",
        };

  return (
    <button type={type} disabled={disabled} onClick={onClick} style={{ ...base, ...styles }}>
      {children}
    </button>
  );
}

export default function TerminalSetup() {
  const nav = useNavigate();
  const { setTerminal } = useSession();

  const [step, setStep] = useState(1); // 1=productKey, 2=shop, 3=pin
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const [productKey, setProductKey] = useState("");
  const [tenantId, setTenantId] = useState("");

  const [shops, setShops] = useState([]);
  const [selectedShopId, setSelectedShopId] = useState("");

  const [pin, setPin] = useState("");

  const hasAnyShops = useMemo(() => (shops?.length || 0) > 0, [shops]);

  async function refreshShops(tid) {
    const rows = await listShopsForTenant({ tenantId: tid, includeInactive: true });
    const list = rows || [];
    setShops(list);

    if (list.length === 1) setSelectedShopId(list[0].id);
    if (list.length > 1 && !list.some((s) => s.id === selectedShopId)) setSelectedShopId("");
  }

  async function onSubmitProductKey(e) {
    e.preventDefault();
    setErrMsg("");
    const key = String(productKey || "").trim();
    if (!key) return setErrMsg("Enter a Product Key.");

    setLoading(true);
    try {
      const res = await resolveTenantIdFromProductKey({ productKey: key });
      const tid = typeof res === "string" ? res : String(res?.tenantId || "").trim();
      if (!tid) throw new Error("Invalid Product Key.");

      setTenantId(tid);
      await refreshShops(tid);
      setStep(2);
    } catch (err) {
      setErrMsg(err?.message || "Invalid Product Key.");
    } finally {
      setLoading(false);
    }
  }

  function onContinueShop() {
    setErrMsg("");
    if (!tenantId) return setErrMsg("Missing tenantId.");
    if (!selectedShopId) return setErrMsg("Pick a shop.");
    setStep(3);
  }

  async function onRegisterAndContinue(e) {
    e.preventDefault();
    setErrMsg("");

    if (!tenantId) return setErrMsg("Missing tenantId.");
    if (!selectedShopId) return setErrMsg("Pick a shop.");
    const p = String(pin || "").trim();
    if (!p) return setErrMsg("Enter your PIN.");

    setLoading(true);
    try {
      const config = { tenantId, shopId: selectedShopId, mode: "shared" };
      setTerminalConfig(config);
      setTerminal(config);

      sessionStorage.setItem("terminal_setup_pin", p);

      // ✅ After terminal setup, go to your PIN/unlock screen OR into the app.
      nav("/pin"); // change to "/" or "/unlock" if that’s your real route
    } catch (err) {
      setErrMsg(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", padding: 18 }}>
        {/* Logo */}
        <div style={{ display: "flex", justifyContent: "center", margin: "16px 0 18px" }}>
          <img
            src="/logo.png"
            alt="Logo"
            style={{ height: 44, objectFit: "contain" }}
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        </div>

        {errMsg ? (
          <div
            style={{
              background: "#fee2e2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              padding: 12,
              borderRadius: 12,
              marginBottom: 12,
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            {errMsg}
          </div>
        ) : null}

        {/* STEP 1 */}
        {step === 1 ? (
          <Card>
            <div style={{ fontSize: 18, fontWeight: 950, color: "#0f172a", marginBottom: 12 }}>
              Terminal Setup
            </div>

            <form onSubmit={onSubmitProductKey}>
              <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 6, color: "#0f172a", opacity: 0.8 }}>
                Product Key
              </div>

              <input
                value={productKey}
                onChange={(e) => setProductKey(e.target.value)}
                style={inputStyle}
                autoComplete="off"
                placeholder="Enter Product Key"
              />

              <div style={{ marginTop: 12 }}>
                <Btn type="submit" disabled={loading} variant="primary">
                  {loading ? "Verifying…" : "Continue"}
                </Btn>
              </div>

              {/* Owner Login option under product key */}
              <div style={{ marginTop: 10 }}>
                <Btn
                  type="button"
                  variant="secondary"
                  disabled={loading}
                  onClick={() => nav("/owner-login")}
                >
                  Owner Login
                </Btn>
              </div>
            </form>
          </Card>
        ) : null}

        {/* STEP 2 */}
        {step === 2 ? (
          <Card>
            <div style={{ fontSize: 18, fontWeight: 950, color: "#0f172a", marginBottom: 12 }}>
              Select Shop
            </div>

            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10, color: "#0f172a" }}>
              Tenant: <b>{tenantId}</b> · Shops: <b>{shops.length}</b> {hasAnyShops ? "" : "(none)"}
            </div>

            <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 6, color: "#0f172a", opacity: 0.8 }}>
              Shop
            </div>

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

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
              <Btn variant="secondary" disabled={loading} onClick={() => setStep(1)}>
                Back
              </Btn>
              <Btn disabled={loading} onClick={onContinueShop}>
                Continue
              </Btn>
            </div>
          </Card>
        ) : null}

        {/* STEP 3 */}
        {step === 3 ? (
          <Card>
            <div style={{ fontSize: 18, fontWeight: 950, color: "#0f172a", marginBottom: 12 }}>
              Enter PIN
            </div>

            <form onSubmit={onRegisterAndContinue}>
              <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 6, color: "#0f172a", opacity: 0.8 }}>
                PIN
              </div>

              <input
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                style={inputStyle}
                inputMode="numeric"
                autoComplete="off"
                placeholder="Enter PIN"
              />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                <Btn type="button" variant="secondary" disabled={loading} onClick={() => setStep(2)}>
                  Back
                </Btn>
                <Btn type="submit" disabled={loading}>
                  {loading ? "Saving…" : "Register"}
                </Btn>
              </div>
            </form>
          </Card>
        ) : null}
      </div>
    </div>
  );
}