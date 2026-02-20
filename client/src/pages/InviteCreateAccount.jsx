// client/src/pages/InviteCreateAccount.jsx
import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth } from "../firebase";
import { acceptTenantInvite, loadInviteByToken } from "../services/authService";

export default function InviteCreateAccount() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [invite, setInvite] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError("");

        if (!token) throw new Error("Invalid or missing invite token.");

        const inv = await loadInviteByToken(token);
        if (!inv) throw new Error("Invite not found or expired.");

        if (cancelled) return;
        setInvite(inv);
      } catch (e) {
        console.error(e);
        if (!cancelled) setError(e?.message || "Failed to load invite.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="inventory-container">
      <div
        className="table-wrapper"
        style={{ padding: 12, maxWidth: 520, margin: "0 auto" }}
      >
        <div
          style={{
            padding: 12,
            background: "#ff0",
            color: "#000",
            fontWeight: 900,
            marginBottom: 10,
            borderRadius: 8,
          }}
        >
          NEW INVITE PAGE v2
        </div>

        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : error ? (
          <div className="empty-state" style={{ color: "#b91c1c" }}>
            {error}
          </div>
        ) : (
          <InviteCreateForm
            invite={invite}
            token={token}
            onDone={() => navigate("/", { replace: true })}
          />
        )}
      </div>
    </div>
  );
}

function InviteCreateForm({ invite, token, onDone }) {
  const invitedEmail = String(invite?.email || "").trim().toLowerCase();

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setError("");

    if (!invitedEmail) return setError("Invite is missing an email.");
    if (!password) return setError("Password is required.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (password !== confirm) return setError("Passwords do not match.");

    setSaving(true);
    try {
      // 1) Create auth user using the INVITED email only
      const cred = await createUserWithEmailAndPassword(auth, invitedEmail, password);

      // 2) Optional display name
      if (name) {
        await updateProfile(cred.user, { displayName: name.trim() });
      }

      // 3) Accept invite (writes /users/{uid}, marks invite accepted)
      await acceptTenantInvite(token);

      onDone();
    } catch (e) {
      console.error(e);
      setError(e?.message || "Failed to create account.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 6 }}>
        Create your account
      </div>
      <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 12 }}>
        Finish setting up your Sound Depot POS account
      </div>

      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Email</div>
      <input
        className="search-box"
        value={invitedEmail}
        readOnly
        style={{ opacity: 0.85 }}
      />

      <input
        className="search-box"
        placeholder="Full name (optional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="name"
        style={{ marginTop: 8 }}
      />

      <input
        className="search-box"
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        style={{ marginTop: 8 }}
      />

      <input
        className="search-box"
        type="password"
        placeholder="Confirm password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        autoComplete="new-password"
        style={{ marginTop: 8 }}
      />

      {error && (
        <div style={{ color: "#b91c1c", marginTop: 8, fontSize: 13 }}>
          {error}
        </div>
      )}

      <button
        className="search-box"
        type="submit"
        disabled={saving}
        style={{ marginTop: 12, fontWeight: 900 }}
      >
        {saving ? "Creating account…" : "Create account & activate"}
      </button>
    </form>
  );
}







