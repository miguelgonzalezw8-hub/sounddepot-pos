// client/src/session/SessionProvider.jsx
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  watchAuth,
  loadTenant,
  loadShop,
  loadUserProfile as loadUserProfileFromService,
  unlockWithPin,
  logoutFirebase,
} from "../services/authService";
import { getTerminalConfig, clearTerminalConfig } from "../services/terminalConfig";

import { db } from "../firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

const SessionContext = createContext(null);

// ✅ your dev UID (matches rules)
const DEV_UID = "0AjEwNVNFyc2NS0IhWxkfTACI9Y2";

// shared terminals only; inactivity forces PIN again
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

function normalizeRole(r) {
  return String(r || "").trim().toLowerCase();
}

function isOwnerRole(role) {
  const r = normalizeRole(role);
  return r === "owner" || r === "tenant_owner" || r === "main_owner" || r === "tenant";
}

function isManagerRole(role) {
  return normalizeRole(role) === "manager";
}

/**
 * Best-effort session doc write (logging / troubleshooting only).
 * This should NEVER block boot.
 */
async function tryWriteSessionDoc({ user, terminalConfig }) {
  try {
    if (!user?.uid) return;
    if (user.uid === DEV_UID) return;
    if (!terminalConfig?.tenantId || !terminalConfig?.shopId) return;

    const ref = doc(db, "sessions", user.uid);
    await setDoc(
      ref,
      {
        uid: user.uid,
        tenantId: terminalConfig.tenantId,
        shopId: terminalConfig.shopId,
        mode: terminalConfig.mode || "shared",
        posAccountId: null,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (e) {
    // do not block boot
    console.warn("[SESSION WRITE skipped/failed]", e);
  }
}

export function SessionProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);

  // terminal config (persisted)
  const [terminal, setTerminal] = useState(() => getTerminalConfig());

  // resolved data for the terminal
  const [tenant, setTenant] = useState(null);
  const [shop, setShop] = useState(null);

  // user profile doc (users/{uid}) so role is available
  const [userProfile, setUserProfile] = useState(null);

  // PIN-unlocked account (posAccounts)
  const [posAccount, setPosAccount] = useState(null);

  const [booting, setBooting] = useState(true);
  const [unlocking, setUnlocking] = useState(false);

  const devMode = firebaseUser?.uid === DEV_UID;
  const isOwnerTerminal = terminal?.mode === "owner";

  const lastBootKeyRef = useRef("");
  const idleTimerRef = useRef(null);

  function clearResolved() {
    setTenant(null);
    setShop(null);
  }

  // ---------------------------
  // Watch Firebase auth state
  // ---------------------------
  useEffect(() => {
    const unsub = watchAuth(async (u) => {
      setFirebaseUser(u);

      // ✅ dev shortcut
      if (u?.uid === DEV_UID) {
        setUserProfile({ uid: u.uid, role: "dev", tenantId: "" });
        return;
      }

      if (!u) {
        setPosAccount(null);
        setUserProfile(null);
        return;
      }

      // ✅ Load user profile (role, tenantId, etc.)
      try {
        const profile = await loadUserProfileFromService(u.uid);
        setUserProfile(profile || null);
      } catch (e) {
        console.warn("[loadUserProfile] failed:", e);
        setUserProfile(null);
      }
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------
  // Boot: load tenant/shop (NO hard dependency on sessions/{uid})
  // ---------------------------
  useEffect(() => {
    let cancelled = false;

    async function run() {
      setBooting(true);

      const claimRole = normalizeRole(firebaseUser?.claims?.role || firebaseUser?.role || "");
      const profileRole = normalizeRole(userProfile?.role || "");
      const effectiveRole = claimRole || profileRole;

      console.log("[BOOT CHECK]", {
        uid: firebaseUser?.uid,
        devMode,
        terminal,
        hasTenantShop: !!terminal?.tenantId && !!terminal?.shopId,
        claimRole,
        profileRole,
        effectiveRole,
        profileTenantId: userProfile?.tenantId || "",
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

        // Non-dev must be signed in before bootstrap loads
        if (!devMode && !firebaseUser) {
          clearResolved();
          return;
        }

        // OPTIONAL but recommended: if userProfile exists, enforce tenant match.
        // This prevents cross-tenant access when a terminal is configured to a different tenant.
        if (!devMode && userProfile?.tenantId && terminal?.tenantId && userProfile.tenantId !== terminal.tenantId) {
          console.warn("[BOOT BLOCKED] userProfile.tenantId does not match terminal.tenantId", {
            userTenantId: userProfile.tenantId,
            terminalTenantId: terminal.tenantId,
          });
          clearResolved();
          // keep terminal config but force lock
          setPosAccount(null);
          return;
        }

        const bootKey = [
          devMode ? "dev" : "nodev",
          firebaseUser?.uid || "nouser",
          terminal.tenantId,
          terminal.shopId,
          terminal.mode || "shared",
          userProfile?.tenantId || "noprofiletenant",
          userProfile?.role || "noprofilero",
        ].join("|");

        if (lastBootKeyRef.current === bootKey) return;
        lastBootKeyRef.current = bootKey;

        // ✅ best-effort session write (do not gate boot)
        if (!devMode && firebaseUser) {
          tryWriteSessionDoc({ user: firebaseUser, terminalConfig: terminal });
        }

        const [t, s] = await Promise.all([loadTenant(terminal.tenantId), loadShop(terminal.shopId)]);

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
  }, [devMode, firebaseUser, terminal?.tenantId, terminal?.shopId, terminal?.mode, userProfile]);

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
    // dev never locks via PIN screen
    if (devMode) return;

    // owner-mode terminals do not lock via PIN
    if (isOwnerTerminal) return;

    setPosAccount(null);
  }

  // ---------------------------
  // AUTO-LOCK ON INACTIVITY (shared terminals only)
  // ---------------------------
  useEffect(() => {
    const isSharedTerminal = !devMode && !isOwnerTerminal;
    const isUnlockedShared = isSharedTerminal && !!posAccount;

    if (!isUnlockedShared) {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
      return;
    }

    const reset = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => setPosAccount(null), IDLE_TIMEOUT_MS);
    };

    reset();

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));

    const onVisibility = () => {
      if (document.visibilityState !== "visible") setPosAccount(null);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
      events.forEach((e) => window.removeEventListener(e, reset));
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [devMode, isOwnerTerminal, posAccount]);

  async function resetTerminal() {
    clearTerminalConfig();
    setTerminal(null);
    setPosAccount(null);
    setUserProfile(null);
    clearResolved();
    lastBootKeyRef.current = "";

    if (!devMode) await logoutFirebase();
  }

  const claimRole = useMemo(
    () => normalizeRole(firebaseUser?.claims?.role || firebaseUser?.role || ""),
    [firebaseUser]
  );
  const profileRole = useMemo(() => normalizeRole(userProfile?.role || ""), [userProfile]);
  const effectiveRole = useMemo(() => claimRole || profileRole, [claimRole, profileRole]);

  const isOwnerOrManagerRole = useMemo(() => {
    return isOwnerRole(effectiveRole) || isManagerRole(effectiveRole);
  }, [effectiveRole]);

  // ✅ This is what pages should use to gate manager-only actions
  const canManagerOverride = useMemo(() => {
    if (devMode) return true;

    // Owner terminal bypass (no PIN needed)
    if (isOwnerTerminal && !!firebaseUser) return true;

    // Owner/manager signed-in account bypass (no PIN needed)
    if (!!firebaseUser && isOwnerOrManagerRole) return true;

    // Otherwise, require unlocked PIN account with manager/owner role
    const r = normalizeRole(posAccount?.role || "");
    return r === "owner" || r === "manager";
  }, [devMode, isOwnerTerminal, firebaseUser, isOwnerOrManagerRole, posAccount?.role]);

  // ✅ Keep "isUnlocked" meaning: can use the app pages (not “manager override”)
  const isUnlocked = useMemo(() => {
    if (devMode) return true;

    // owner terminal: Firebase login is enough
    if (isOwnerTerminal) return !!firebaseUser;

    // shared terminal requires PIN
    return !!posAccount;
  }, [devMode, isOwnerTerminal, firebaseUser, posAccount]);

  // Helpful debug
  useEffect(() => {
    window.__SESSION_DEBUG__ = {
      firebaseUid: firebaseUser?.uid || null,
      terminal,
      claimRole,
      profileRole,
      effectiveRole,
      profileTenantId: userProfile?.tenantId || null,
      isOwnerOrManagerRole,
      isOwnerTerminal,
      isUnlocked,
      canManagerOverride,
      posAccount: posAccount ? { id: posAccount.id, role: posAccount.role } : null,
    };
  }, [
    firebaseUser,
    terminal,
    claimRole,
    profileRole,
    effectiveRole,
    userProfile?.tenantId,
    isOwnerOrManagerRole,
    isOwnerTerminal,
    isUnlocked,
    canManagerOverride,
    posAccount,
  ]);

  const value = useMemo(
    () => ({
      firebaseUser,
      devMode,
      terminal,
      setTerminal,
      tenant,
      shop,
      userProfile,
      posAccount,

      // manager-only bypass signal for delete/edit actions
      canManagerOverride,

      // page-level unlock
      isUnlocked,

      booting,
      unlocking,
      doUnlock,
      lock,
      resetTerminal,

      // keep export available to pages that want to refresh profile
      loadUserProfile: loadUserProfileFromService,
    }),
    [
      firebaseUser,
      devMode,
      terminal,
      tenant,
      shop,
      userProfile,
      posAccount,
      canManagerOverride,
      isUnlocked,
      booting,
      unlocking,
    ]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}