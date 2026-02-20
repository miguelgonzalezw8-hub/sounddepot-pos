// client/src/pages/AcceptInvite.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  acceptTenantInvite,
  loadInviteByToken,
  signupWithEmail,
} from "../services/authService";
import { auth } from "../firebase";

export default function AcceptInvite() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") || "";

  const [status, setStatus] = useState("loading"); // loading | needsSignup | working | done | error
  const [msg, setMsg] = useState("");
  const [invite, setInvite] = useState(null);

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);

  const invitedEmail = useMemo(() => {
    const em = invite?.email || invite?.Email || "";
    return String(em || "").trim().toLowerCase();
  }, [invite]);

  const invitedRole = useMemo(() => {
    return String(invite?.role || invite?.Role || "").trim().toLowerCase();
  }, [invite]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!token) throw new Error("Missing invite token.");

        const inv = await loadInviteByToken(token);
        if (!inv) throw new Error("Invite not found or expired.");

        if (cancelled) return;
        setInvite(inv);

        // If already signed in, just accept
        if (auth.currentUser) {
          setStatus("working");
          await acceptTenantInvite(token);
          if (cancelled) return;
          setStatus("done");
          setMsg("Invite accepted. Redirecting...");
          setTimeout(() => navigate("/", { replace: true }), 500);
          return;
        }

        // Not signed in -> show signup form
        setStatus("needsSignup");
      } catch (e) {
        console.error(e);
        if (cancelled) return;
        setStatus("error");
        setMsg(e?.message || String(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, navigate]);

  async function onCreateAccount(e) {
    e.preventDefault();
    if (busy) return;

    try {
      setBusy(true);
      setMsg("");

      if (!invitedEmail) throw new Error("Invite is missing an email.");
      if (!password || password.length < 6) {
        throw new Error("Password must be at least 6 characters.");
      }
      if (password !== password2) throw new Error("Passwords do not match.");

      // 1) Create auth user with the invited email
      await signupWithEmail(invitedEmail, password);

      // 2) Accept invite (writes /users/{uid}, marks invite accepted)
      setStatus("working");
      await acceptTenantInvite(token);

      setStatus("done");
      setMsg("Account created and invite accepted. Redirecting...");
      setTimeout(() => navigate("/", { replace: true }), 500);
    } catch (e2) {
      console.error(e2);
      setStatus("needsSignup");
      setMsg(e2?.message || String(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inventory-container">
      <div className="table-wrapper" style={{ padding: 16, maxWidth: 520 }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Accept Invite</div>

        {status === "loading" ? (
          <div style={{ marginTop: 10, opacity: 0.8 }}>Loading invite...</div>
        ) : null}

        {status === "working" ? (
          <div style={{ marginTop: 10, opacity: 0.8 }}>
            Creating your account & linking invite...
          </div>
        ) : null}

        {status === "done" ? (
          <div style={{ marginTop: 10, opacity: 0.8 }}>{msg}</div>
        ) : null}

        {status === "error" ? (
          <>
            <div style={{ marginTop: 10, opacity: 0.85 }}>{msg}</div>
            <div style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>
              If you already created an account earlier, sign in with that email
              and open the invite link again.
            </div>
          </>
        ) : null}

        {status === "needsSignup" ? (
          <>
            <div style={{ marginTop: 10, opacity: 0.85 }}>
              Create a password to activate this account.
            </div>

            <div style={{ marginTop: 10, fontSize: 13, opacity: 0.8 }}>
              Email: <b>{invitedEmail || "—"}</b>
            </div>

            <div style={{ marginTop: 6, fontSize: 13, opacity: 0.8 }}>
              Role: <b>{invitedRole || "—"}</b>
            </div>

            <form onSubmit={onCreateAccount} style={{ marginTop: 14 }}>
              <label style={{ display: "block", fontSize: 12, opacity: 0.7 }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                style={{
                  width: "100%",
                  padding: 10,
                  marginTop: 6,
                  borderRadius: 8,
                  border: "1px solid #ddd",
                }}
              />

              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  opacity: 0.7,
                  marginTop: 12,
                }}
              >
                Confirm Password
              </label>
              <input
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                placeholder="Re-enter password"
                style={{
                  width: "100%",
                  padding: 10,
                  marginTop: 6,
                  borderRadius: 8,
                  border: "1px solid #ddd",
                }}
              />

              <button
                type="submit"
                disabled={busy}
                style={{
                  marginTop: 14,
                  width: "100%",
                  padding: 10,
                  borderRadius: 10,
                  fontWeight: 800,
                  opacity: busy ? 0.7 : 1,
                }}
              >
                {busy ? "Working..." : "Create Account & Accept Invite"}
              </button>

              {msg ? (
                <div style={{ marginTop: 12, fontSize: 12, opacity: 0.8 }}>
                  {msg}
                </div>
              ) : null}
            </form>
          </>
        ) : null}
      </div>
    </div>
  );
}







