// client/src/pages/OwnerLogin.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { useSession } from "../session/SessionProvider";
import { logoutFirebase } from "../services/authService";

const DEV_UID = "0AjEwNVNFyc2NS0IhWxkfTACI9Y2";

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

export default function OwnerLogin() {
  const nav = useNavigate();
  const { terminal, loadUserProfile } = useSession();

  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function onOwnerSignIn(e) {
    e.preventDefault();
    setErrMsg("");
    setLoading(true);

    try {
      const cred = await signInWithEmailAndPassword(
        auth,
        String(email).trim(),
        password
      );

      const uid = cred?.user?.uid;
      if (!uid) throw new Error("Login failed (missing uid).");

      // ✅ DEV UID → straight into app
      if (uid === DEV_UID) {
        nav("/");
        return;
      }

      // ✅ Confirm role is owner
      const p = await loadUserProfile(uid);

      const role = String(p?.role || "").toLowerCase();
      const isOwner = ["owner", "tenant_owner", "main_owner", "tenant"].includes(role);

      if (!isOwner) {
        await logoutFirebase();
        throw new Error("This screen requires an OWNER login.");
      }

      if (p?.active === false) throw new Error("User is inactive (users/{uid}.active == false).");

      // ✅ Owner accounts are NOT terminals: do NOT set terminal config, do NOT pick shop
      nav("/");
    } catch (err) {
      console.log("[OwnerLogin ERROR]", err, { code: err?.code, message: err?.message });
      setErrMsg(err?.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // If someone navigates here but terminal is already owner-mode, just go in
    // (keeps your old behavior, but doesn't force it)
    if (terminal?.mode === "owner" && terminal?.tenantId && terminal?.shopId) {
      nav("/");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", padding: 18 }}>
        {/* Logo */}
        <div style={{ display: "flex", justifyContent: "center", margin: "16px 0 18px" }}>
          <img
            src="/logo.png"
            alt="Logo"
            style={{ height: 44, objectFit: "contain" }}
            onError={(e) => (e.currentTarget.style.display = "none")}
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

        <Card>
          <div style={{ fontSize: 18, fontWeight: 950, color: "#0f172a", marginBottom: 12 }}>
            Owner Login
          </div>

          <form onSubmit={onOwnerSignIn}>
            <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 6, color: "#0f172a", opacity: 0.8 }}>
              Email
            </div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              autoComplete="email"
            />

            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                fontWeight: 900,
                marginBottom: 6,
                color: "#0f172a",
                opacity: 0.8,
              }}
            >
              Password
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              autoComplete="current-password"
            />

            <div style={{ marginTop: 12 }}>
              <Btn type="submit" disabled={loading}>
                {loading ? "Signing in…" : "Sign In"}
              </Btn>
            </div>

            <div style={{ marginTop: 10 }}>
              <Btn type="button" variant="secondary" disabled={loading} onClick={() => nav("/terminal-setup")}>
                Back
              </Btn>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}