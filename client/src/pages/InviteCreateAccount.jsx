<div style={{ padding: 12, background: "#ff0", color: "#000", fontWeight: 900 }}>
  NEW INVITE PAGE v1
</div>

import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth } from "../firebase";
import { acceptTenantInvite } from "../services/authService";

export default function InviteCreateAccount() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [invite, setInvite] = useState(null);

  useEffect(() => {
    if (!token) {
      setError("Invalid or missing invite token.");
      setLoading(false);
      return;
    }

    // Minimal validation — actual checks happen on accept
    setInvite({ token });
    setLoading(false);
  }, [token]);

  return (
    <div className="inventory-container">
      <div className="table-wrapper" style={{ padding: 12, maxWidth: 520, margin: "0 auto" }}>
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : error ? (
          <div className="empty-state" style={{ color: "#b91c1c" }}>
            {error}
          </div>
        ) : (
          <InviteCreateForm invite={invite} token={token} onDone={() => navigate("/")} />
        )}
      </div>
    </div>
  );
}

function InviteCreateForm({ token, onDone }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setError("");

    if (!email || !password) return setError("Email and password are required.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (password !== confirm) return setError("Passwords do not match.");

    setSaving(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      if (name) {
        await updateProfile(cred.user, { displayName: name.trim() });
      }

      await acceptTenantInvite(token);

      onDone();
    } catch (e) {
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

      <input
        className="search-box"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
      />

      <input
        className="search-box"
        placeholder="Full name"
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
        {saving ? "Creating account…" : "Create account & sign in"}
      </button>
    </form>
  );
}
