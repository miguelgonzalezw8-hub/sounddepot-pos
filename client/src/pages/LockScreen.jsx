// client/src/pages/LockScreen.jsx
import { useMemo, useState } from "react";
import { useSession } from "../session/SessionProvider";

export default function LockScreen() {
  const { tenant, shop, doUnlock, unlocking, resetTerminal } = useSession();

  const [pin, setPin] = useState("");
  const masked = useMemo(() => "•".repeat(pin.length), [pin]);

  async function submit() {
    if (pin.length < 3) return;
    const acct = await doUnlock(pin);
    if (!acct) {
      setPin("");
      alert("Invalid PIN.");
    } else {
      setPin("");
    }
  }

  function press(n) {
    if (pin.length >= 8) return;
    setPin((p) => p + String(n));
  }

  function back() {
    setPin((p) => p.slice(0, -1));
  }

  return (
    <div style={{ padding: 20, maxWidth: 420 }}>
      <h2>{shop?.name || shop?.id || "Shop"}</h2>
      <div style={{ opacity: 0.8, marginBottom: 14 }}>
        {tenant?.name || "Tenant"} • Enter PIN to unlock
      </div>

      <div
        style={{
          padding: 14,
          border: "1px solid #ddd",
          borderRadius: 10,
          fontSize: 24,
          letterSpacing: 6,
          marginBottom: 12,
          minHeight: 54,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {masked}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button key={n} onClick={() => press(n)} style={{ padding: 16, fontSize: 18 }}>
            {n}
          </button>
        ))}
        <button onClick={back} style={{ padding: 16, fontSize: 18 }}>
          ⌫
        </button>
        <button onClick={() => press(0)} style={{ padding: 16, fontSize: 18 }}>
          0
        </button>
        <button disabled={unlocking} onClick={submit} style={{ padding: 16, fontSize: 18 }}>
          {unlocking ? "..." : "OK"}
        </button>
      </div>

      <div style={{ marginTop: 14 }}>
        <button onClick={resetTerminal} style={{ padding: 10, width: "100%" }}>
          Reset terminal (manager setup)
        </button>
      </div>
    </div>
  );
}