// client/src/pages/ManagerSecurity.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAuth } from "firebase/auth";
import { db } from "../firebase";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useSession } from "../session/SessionProvider";

async function sha256Hex(input) {
  const enc = new TextEncoder();
  const data = enc.encode(String(input));
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function ManagerSecurity() {
  const navigate = useNavigate();
  const auth = getAuth();

  const { terminal } = useSession();
  const tenantId = terminal?.tenantId || "";

  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [hasPin, setHasPin] = useState(false);
  const [loading, setLoading] = useState(false);

  const uid = auth.currentUser?.uid || null;

  // ✅ tenant-scoped security doc (matches your multi-tenant approach)
  const securityDocId = tenantId ? `security_${tenantId}` : "";
  const securityRef = securityDocId ? doc(db, "settings", securityDocId) : null;

  useEffect(() => {
    (async () => {
      try {
        if (!uid) return;
        if (!tenantId) return; // terminal not configured yet
        if (!securityRef) return;

        const snap = await getDoc(securityRef);
        const pins = snap.exists() ? snap.data()?.managerPins || {} : {};
        setHasPin(!!pins[uid]);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [uid, tenantId, securityDocId]); // keep deps simple

  const savePin = async () => {
    if (!uid) return alert("Not signed in.");
    if (!tenantId) return alert("Terminal not configured (missing tenant).");
    if (!securityRef) return alert("Security doc not ready.");

    if (!pin || pin.length < 4) return alert("PIN must be at least 4 digits/characters.");
    if (pin !== confirm) return alert("PIN confirmation does not match.");

    setLoading(true);
    try {
      const hash = await sha256Hex(pin);

      const snap = await getDoc(securityRef);

      if (!snap.exists()) {
        await setDoc(securityRef, {
          tenantId, // ✅ store tenantId on doc for rules / auditing
          managerPins: { [uid]: hash },
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        });
      } else {
        await updateDoc(securityRef, {
          tenantId, // keep it consistent
          [`managerPins.${uid}`]: hash,
          updatedAt: serverTimestamp(),
        });
      }

      setPin("");
      setConfirm("");
      setHasPin(true);
      alert("Manager PIN saved ✅");
    } catch (err) {
      console.error(err);
      alert(
        err?.message?.includes("permission")
          ? "Permission denied (rules)."
          : "Failed to save PIN."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inventory-container">
      <div className="search-row" style={{ display: "flex", gap: 8 }}>
        <button className="search-box" onClick={() => navigate(-1)} style={{ width: 120 }}>
          ← Back
        </button>

        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Manager PIN</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Status: {hasPin ? "Set" : "Not set"} • Tenant: {tenantId || "—"}
          </div>
        </div>
      </div>

      <div className="table-wrapper" style={{ padding: 16 }}>
        <input
          className="search-box search-box-wide"
          placeholder="Enter new PIN (min 4)"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          disabled={loading}
          type="password"
        />

        <div style={{ height: 10 }} />

        <input
          className="search-box search-box-wide"
          placeholder="Confirm new PIN"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={loading}
          type="password"
        />

        <div style={{ height: 12 }} />

        <button className="save-btn" onClick={savePin} disabled={loading} style={{ width: "100%" }}>
          {loading ? "Saving..." : "Save PIN"}
        </button>

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
          PIN hashes are stored in <code>settings/{securityDocId || "security_<tenantId>"}</code>.
        </div>
      </div>
    </div>
  );
}







