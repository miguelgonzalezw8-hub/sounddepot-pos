// client/src/session/SessionProvider.jsx
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  watchAuth,
  loadTenant,
  loadShop,
  loadUserProfile,
  unlockWithPin,
  logoutFirebase,
} from "../services/authService";
import { getTerminalConfig, clearTerminalConfig } from "../services/terminalConfig";

// ✅ Firestore session upsert lives here (so you don't depend on authService exports)
import { db } from "../firebase";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";

const SessionContext = createContext(null);
// ✅ your dev UID (matches rules)
const DEV_UID = "0AjEwNVNFyc2NS0IhWxkfTACI9Y2";

// ✅ AUTO-LOCK SETTINGS (ADDED)
// shared terminals only; inactivity forces PIN again
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes (change if you want)

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

  // Track last boot key to avoid redundant work
  const lastBootKeyRef = useRef("");

  // ✅ idle timer refs (ADDED)
  const idleTimerRef = useRef(null);

  // ---------------------------
  // Helpers
  // ---------------------------

  async function ensureSessionDoc({ user, terminalConfig }) {
    if (!user?.uid) return { ok: false, reason: "no-user" };
    if (user.uid === DEV_UID) return { ok: true, reason: "dev" };
    if (!terminalConfig?.tenantId || !terminalConfig?.shopId)
      return { ok: false, reason: "no-terminal" };

    const ref = doc(db, "sessions", user.uid);

    // 1) write
    await setDoc(
      ref,
      {
        tenantId: terminalConfig.tenantId,
        shopId: terminalConfig.shopId,
        mode: terminalConfig.mode || "shared",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    // 2) read back (proves rules allow it + data present)
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ok: false, reason: "session-missing-after-write" };

    const data = snap.data() || {};
    const ok = !!data.tenantId;
    return { ok, reason: ok ? "session-ok" : "session-tenantid-missing", data };
  }

  function clearResolved() {
    setTenant(null);
    setShop(null);
  }

  // ---------------------------
  // Watch firebase auth state
  // ---------------------------
  useEffect(() => {
    const unsub = watchAuth((u) => {
      setFirebaseUser(u);

      // ✅ If dev logs in, we don't need terminal/pin
      if (u?.uid === DEV_UID) return;

      // ✅ if auth goes away, clear any stale pin user
      if (!u) setPosAccount(null);

      // If terminal is configured but no auth session exists, we can't run
      if (terminal?.tenantId && terminal?.shopId && !u) {
        console.warn("No Firebase auth session. Login is required on this terminal.");
      }
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminal?.tenantId, terminal?.shopId]);

  // ---------------------------
  // Boot: ensure session -> load tenant/shop
  // ---------------------------
  useEffect(() => {
    let cancelled = false;

    async function run() {
      setBooting(true);
      console.log("[BOOT CHECK]", {
        uid: firebaseUser?.uid,
        devMode,
        terminal,
        hasTenantShop: !!terminal?.tenantId && !!terminal?.shopId,
      });

      try {
        // ✅ DEV can boot without terminal config
        if (devMode && (!terminal?.tenantId || !terminal?.shopId)) {
          clearResolved();
          return;
        }

        // If terminal not configured, nothing to load
        if (!terminal?.tenantId || !terminal?.shopId) {
          clearResolved();
          return;
        }

        // ✅ Non-dev must be signed in before we attempt any bootstrap loads
        // (prevents permission loops)
        if (!devMode && !firebaseUser) {
          clearResolved();
          return;
        }

        // Avoid repeating the same boot work
        const bootKey = [
          devMode ? "dev" : "nodev",
          firebaseUser?.uid || "nouser",
          terminal.tenantId,
          terminal.shopId,
          terminal.mode || "shared",
        ].join("|");

        if (lastBootKeyRef.current === bootKey) return;
        lastBootKeyRef.current = bootKey;

        // ✅ MOST IMPORTANT: make sure sessions/{uid} exists before tenant-scoped reads
        if (!devMode) {
          const res = await ensureSessionDoc({ user: firebaseUser, terminalConfig: terminal });
          console.log("[SESSION ENSURE]", res);

          if (!res.ok) {
            // stop here so we don't spam permission-denied
            clearResolved();
            return;
          }
          if (cancelled) return;
        }

        const [t, s] = await Promise.all([
          loadTenant(terminal.tenantId),
          loadShop(terminal.shopId),
        ]);

        if (cancelled) return;
        setTenant(t);
        setShop(s);
      } catch (err) {
        console.error("Session boot failed:", err);
        if (!cancelled) clearResolved();
      } finally {
        if (!cancelled) setBooting(false);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [devMode, firebaseUser, terminal?.tenantId, terminal?.shopId, terminal?.mode]);

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

    // ✅ owner-mode terminals do not lock via PIN
    if (terminal?.mode === "owner") return;

    setPosAccount(null);
  }

  // ---------------------------
  // ✅ AUTO-LOCK ON INACTIVITY (ADDED)
  // Shared terminals only: if posAccount is set and idle too long -> lock()
  // ---------------------------
  useEffect(() => {
    // only apply to SHARED terminals (PIN flow)
    const isSharedTerminal = !devMode && terminal?.mode !== "owner";
    const isUnlockedShared = isSharedTerminal && !!posAccount;

    // clear any running timer if not active
    if (!isUnlockedShared) {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
      return;
    }

    const reset = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        // lock after inactivity
        setPosAccount(null);
      }, IDLE_TIMEOUT_MS);
    };

    // start timer now
    reset();

    // activity events
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));

    // optional: lock immediately when the tab/app loses focus
    const onVisibility = () => {
      if (document.visibilityState !== "visible") {
        setPosAccount(null);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
      events.forEach((e) => window.removeEventListener(e, reset));
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [devMode, terminal?.mode, posAccount]);

  async function resetTerminal() {
    clearTerminalConfig();
    setTerminal(null);
    setPosAccount(null);
    clearResolved();

    // Reset boot key so next setup boots fresh
    lastBootKeyRef.current = "";

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

      // ✅ DEV always unlocked
      // ✅ OWNER terminal unlocked if signed-in user exists (no PIN)
      // ✅ SHARED terminal unlocked only if posAccount is set (PIN)
      isUnlocked: devMode
        ? true
        : terminal?.mode === "owner"
        ? !!firebaseUser
        : !!posAccount,

      booting,
      unlocking,
      doUnlock,
      lock,
      resetTerminal,
      loadUserProfile,
    }),
    [firebaseUser, devMode, terminal, tenant, shop, posAccount, booting, unlocking]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}







