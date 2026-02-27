// client/src/pages/InviteCreateAccount.jsx
import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { loadInviteByToken, sha256Hex } from "../services/authService";

export default function InviteCreateAccount() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const token = useMemo(() => String(params.get("token") || "").trim(), [params]);

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState("");

  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError("");
      setInvite(null);

      try {
        if (!token) throw new Error("Missing invite token.");

        const inv = await loadInviteByToken(token);
        if (!inv) throw new Error("Invite not found or expired.");

        if (inv.active === false) throw new Error("Invite is inactive.");
        if (String(inv.status || "") !== "pending") {
          // already accepted — still allow setting pin if missing
        }

        if (!cancelled) setInvite(inv);
      } catch (e) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit() {
    if (!token) return;
    if (!invite) return;

    const p = String(pin || "").trim();
    const c = String(confirm || "").trim();
    if (p.length < 3) return alert("PIN must be at least 3 digits/characters.");
    if (p !== c) return alert("PIN confirmation does not match.");

    setSaving(true);
    try {
      const hash = await sha256Hex(p);

      // 1) Update POS employee record (public rules allow pinHash write)
      const posRef = doc(db, "posAccounts", token);

      // sanity check so errors are clearer
      const posSnap = await getDoc(posRef);
      if (!posSnap.exists()) throw new Error("Employee record not found for this invite.");

      await updateDoc(posRef, {
        pinHash: hash,
        pinSetAt: Date.now(),
        updatedAt: serverTimestamp(),
        active: true,
      });

      // 2) Mark invite accepted (public rules allow: status, acceptedAt, updatedAt)
      const inviteRef = doc(db, "tenantInvites", token);
      const invSnap = await getDoc(inviteRef);
      if (invSnap.exists()) {
        await updateDoc(inviteRef, {
          status: "accepted",
          acceptedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      setDone(true);
    } catch (e) {
      console.error(e);
      alert(e?.message?.includes("permission") ? "Permission denied (rules)." : (e?.message || String(e)));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="inventory-container">
        <div className="empty-state">Loading invite…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="inventory-container">
        <div className="table-wrapper" style={{ padding: 16 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Invite Error</div>
          <div style={{ marginTop: 8, opacity: 0.85 }}>{error}</div>
          <div style={{ marginTop: 12 }}>
            <button className="search-box" onClick={() => navigate("/")}>Go Home</button>
          </div>
        </div>
      </div>
    );
  }

  const status = String(invite?.status || "pending");

  return (
    <div className="inventory-container">
      <div className="table-wrapper" style={{ padding: 16, marginTop: 10 }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>
          {done ? "PIN set ✅" : "Set your POS PIN"}
        </div>

        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
          Invite: {invite?.email || "—"} • Role: {invite?.role || "sales"} • Status: {status}
        </div>

        {done ? (
          <>
            <div style={{ marginTop: 12, opacity: 0.85 }}>
              You can now go to the terminal and unlock using your PIN.
            </div>
            <div style={{ marginTop: 12 }}>
              <button className="search-box" onClick={() => navigate("/")}>
                Go to Login
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ marginTop: 14 }}>
              <input
                className="search-box search-box-wide"
                placeholder="Enter PIN (min 3)"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                disabled={saving}
              />
            </div>

            <div style={{ marginTop: 10 }}>
              <input
                className="search-box search-box-wide"
                placeholder="Confirm PIN"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={saving}
              />
            </div>

            <div style={{ marginTop: 12 }}>
              <button className="save-btn" onClick={onSubmit} disabled={saving} style={{ width: "100%" }}>
                {saving ? "Saving..." : "Submit"}
              </button>
            </div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.65 }}>
              This PIN is hashed and stored securely (no raw PIN stored).
            </div>
          </>
        )}
      </div>
    </div>
  );
}