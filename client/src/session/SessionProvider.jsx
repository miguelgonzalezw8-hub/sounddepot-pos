// client/src/session/SessionProvider.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  watchAuth,
  loadTenant,
  loadShop,
  loadUserProfile,
  unlockWithPin,
  logoutFirebase,
} from "../services/authService";
import { getTerminalConfig, clearTerminalConfig } from "../services/terminalConfig";

const SessionContext = createContext(null);

// ✅ your dev UID (matches rules)
const DEV_UID = "0AjEwNVNFyc2NS0IhWxkfTACI9Y2";

export function SessionProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);

  // terminal config (persisted)
  const [terminal, setTerminal] = useState(() => getTerminalConfig());

  // resolved data for the terminal
  const [tenant, setTenant] = useState(null);
  const [shop, setShop] = useState(null);

  // Shopmonkey-style unlocked account
  const [posAccount, setPosAccount] = useState(null);

  const [booting, setBooting] = useState(true);
  const [unlocking, setUnlocking] = useState(false);

  const devMode = firebaseUser?.uid === DEV_UID;

  // Watch firebase auth state
  useEffect(() => {
    const unsub = watchAuth((u) => {
      setFirebaseUser(u);

      // ✅ If dev logs in, we don't need terminal/pin
      if (u?.uid === DEV_UID) {
        return;
      }

      // ✅ Safety: if we are NOT dev, and auth changes (logout/login), clear any stale pin user
      // (prevents leaking a previous posAccount session into a new auth state)
      if (!u) {
        setPosAccount(null);
      }

      // If terminal is configured but no auth session exists, we can't run
      if (terminal?.tenantId && terminal?.shopId && !u) {
        console.warn(
          "No Firebase auth session. Login is required on this terminal."
        );
      }
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminal?.tenantId, terminal?.shopId]);

  // Load tenant + shop when terminal config exists (dev can still use it, but not required)
  useEffect(() => {
    let cancelled = false;

    async function run() {
      setBooting(true);
      try {
        // ✅ Dev can boot without terminal config
        if (devMode && (!terminal?.tenantId || !terminal?.shopId)) {
          setTenant(null);
          setShop(null);
          return;
        }

        if (!terminal?.tenantId || !terminal?.shopId) {
          setTenant(null);
          setShop(null);
          return;
        }

        const [t, s] = await Promise.all([
          loadTenant(terminal.tenantId),
          loadShop(terminal.shopId),
        ]);
        if (cancelled) return;
        setTenant(t);
        setShop(s);
      } finally {
        if (!cancelled) setBooting(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [terminal?.tenantId, terminal?.shopId, devMode]);

  async function doUnlock(pin) {
    if (!terminal?.tenantId || !terminal?.shopId) return null;

    setUnlocking(true);
    try {
      const acct = await unlockWithPin({
        tenantId: terminal.tenantId,
        shopId: terminal.shopId,
        pin,
      });
      if (acct) setPosAccount(acct);
      return acct;
    } finally {
      setUnlocking(false);
    }
  }

  function lock() {
    // ✅ dev never locks via PIN screen
    if (devMode) return;
    setPosAccount(null);
  }

  async function resetTerminal() {
    clearTerminalConfig();
    setTerminal(null);
    setPosAccount(null);
    setTenant(null);
    setShop(null);

    // ✅ dev can stay signed in; everyone else logs out
    if (!devMode) await logoutFirebase();
  }

  const value = useMemo(
    () => ({
      firebaseUser,
      devMode,
      terminal,
      setTerminal, // used by setup screen after manager login
      tenant,
      shop,
      posAccount,
      // ✅ dev is always unlocked
      isUnlocked: devMode ? true : !!posAccount,
      booting,
      unlocking,
      doUnlock,
      lock,
      resetTerminal,
      loadUserProfile,
    }),
    [firebaseUser, devMode, terminal, tenant, shop, posAccount, booting, unlocking]
  );

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
