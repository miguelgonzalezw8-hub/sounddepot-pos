// client/src/services/authService.js
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
} from "firebase/auth";

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  addDoc,
  query,
  where,
  serverTimestamp,
  limit,
} from "firebase/firestore";

import { auth, db } from "../firebase";
import { getFunctions, httpsCallable } from "firebase/functions";

export async function resolveTenantIdFromProductKey({ productKey }) {
  const fn = httpsCallable(getFunctions(), "resolveTenantFromProductKey");
  const res = await fn({ productKey });
  return res.data; // expect { tenantId: "..." }
}
/* ================= AUTH ================= */

export function watchAuth(cb) {
  return onAuthStateChanged(auth, cb);
}

export async function signupWithEmail(email, password) {
  const cred = await createUserWithEmailAndPassword(
    auth,
    String(email || "").trim().toLowerCase(),
    String(password || "")
  );
  return cred.user;
}

export async function loginManager(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function ensureAuthenticated() {
  if (!auth.currentUser) {
    throw new Error("Not signed in. Please sign in to register this terminal.");
  }
  return auth.currentUser;
}

export async function logoutFirebase() {
  await signOut(auth);
}

/* ================= HELPERS ================= */

// Browser SHA-256
export async function sha256Hex(input) {
  const enc = new TextEncoder();
  const data = enc.encode(String(input ?? ""));
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ================= SESSION DOC (optional) ================= */

export async function writeSession({ tenantId, shopId, posAccountId }) {
  if (!auth.currentUser) throw new Error("No auth user.");
  await setDoc(
    doc(db, "sessions", auth.currentUser.uid),
    {
      tenantId,
      shopId,
      posAccountId,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/* ================= CORE LOADERS ================= */

export async function loadUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function loadTenant(tenantId) {
  const snap = await getDoc(doc(db, "tenants", tenantId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function loadShop(shopId) {
  const snap = await getDoc(doc(db, "shops", shopId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/* ================= POS ACCOUNTS (PIN via pinHash) ================= */

/**
 * Unlocks by comparing sha256(pin) to doc.pinHash.
 */
export async function unlockWithPin({ tenantId, shopId, pin }) {
  const pinHash = await sha256Hex(String(pin || "").trim());

  const q = query(
    collection(db, "posAccounts"),
    where("tenantId", "==", tenantId),
    where("shopId", "==", shopId),
    where("active", "==", true)
  );

  const snap = await getDocs(q);

  let match = null;
  snap.forEach((d) => {
    const data = d.data();
    if (String(data.pinHash || "") === String(pinHash)) {
      match = { id: d.id, ...data };
    }
  });

  return match;
}

export async function listPosAccountsForShop({
  tenantId,
  shopId,
  includeInactive = false,
}) {
  const q = query(
    collection(db, "posAccounts"),
    where("tenantId", "==", tenantId),
    where("shopId", "==", shopId)
  );
  const snap = await getDocs(q);

  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return includeInactive ? rows : rows.filter((r) => r.active);
}

// ================= INVITE LOOKUP (public) =================
export async function loadInviteByToken(inviteId) {
  const token = String(inviteId || "").trim();
  if (!token) throw new Error("Missing invite token.");

  const aRef = doc(db, "tenantInvites", token);
  const aSnap = await getDoc(aRef);
  if (aSnap.exists()) {
    return { id: aSnap.id, collection: "tenantInvites", ...aSnap.data() };
  }

  const bRef = doc(db, "invites", token);
  const bSnap = await getDoc(bRef);
  if (bSnap.exists()) {
    return { id: bSnap.id, collection: "invites", ...bSnap.data() };
  }

  return null;
}

/**
 * Creates a POS account doc for an employee.
 * ✅ Supports either:
 *  - pin (raw) -> hashes and stores pinHash
 *  - pinHash (precomputed) -> stores as-is
 *  - neither -> leaves pinHash empty for invite flow
 */
export async function createPosAccount({
  tenantId,
  shopId,
  name,
  role = "sales",
  active = true,
  createdBy = null,
  pin = "",
  pinHash = "",
}) {
  if (!tenantId) throw new Error("tenantId required");
  if (!shopId) throw new Error("shopId required");

  const nm = String(name || "").trim();
  if (!nm) throw new Error("name required");

  let finalHash = String(pinHash || "").trim();
  const rawPin = String(pin || "").trim();

  if (!finalHash && rawPin) {
    finalHash = await sha256Hex(rawPin);
  }

  const ref = doc(collection(db, "posAccounts"));
  await setDoc(ref, {
    tenantId,
    shopId,
    name: nm,
    pinHash: finalHash || "",
    pinSetAt: finalHash ? Date.now() : null,
    role: String(role || "sales").toLowerCase(),
    active: !!active,
    createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return ref.id;
}

export async function updatePosAccount(posAccountId, patch) {
  if (!posAccountId) throw new Error("posAccountId required");
  await updateDoc(doc(db, "posAccounts", posAccountId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function setPosAccountActive(posAccountId, active) {
  return updatePosAccount(posAccountId, { active: !!active });
}

export async function deletePosAccount(posAccountId) {
  if (!posAccountId) throw new Error("posAccountId required");
  await deleteDoc(doc(db, "posAccounts", posAccountId));
}

/* ================= SHOPS ================= */

export async function createShop({ shopId, tenantId, name, active = true }) {
  if (!shopId) throw new Error("shopId required");
  if (!tenantId) throw new Error("tenantId required");

  await setDoc(
    doc(db, "shops", shopId),
    {
      tenantId,
      name: String(name || "").trim(),
      active: !!active,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  return shopId;
}

export async function listShopsForTenant({ tenantId, includeInactive = false }) {
  const q = query(collection(db, "shops"), where("tenantId", "==", tenantId));
  const snap = await getDocs(q);
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return includeInactive ? rows : rows.filter((r) => r.active);
}

export async function updateShop(shopId, patch) {
  if (!shopId) throw new Error("shopId required");
  await updateDoc(doc(db, "shops", shopId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

/* ================= TENANTS (DEV) ================= */

function randomDigits(len = 8) {
  let out = "";
  for (let i = 0; i < len; i++) out += Math.floor(Math.random() * 10);
  return out;
}

async function _generateUniqueAccountNumber() {
  for (let attempts = 0; attempts < 20; attempts++) {
    const candidate = randomDigits(8);
    const q = query(
      collection(db, "tenants"),
      where("accountNumber", "==", candidate),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return candidate;
  }
  throw new Error("Failed to generate a unique account number. Try again.");
}

export async function createTenant({ name, active = true, ownerEmail = "" }) {
  const accountNumber = await _generateUniqueAccountNumber();

  const ref = doc(collection(db, "tenants"));
  await setDoc(ref, {
    name: String(name || "").trim(),
    active: !!active,
    ownerEmail: String(ownerEmail || "").trim().toLowerCase(),
    accountNumber,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { tenantId: ref.id, accountNumber };
}

export async function listTenants({ includeInactive = true } = {}) {
  const snap = await getDocs(collection(db, "tenants"));
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return includeInactive ? rows : rows.filter((r) => r.active);
}

export async function updateTenant(tenantId, patch) {
  if (!tenantId) throw new Error("tenantId required");
  await updateDoc(doc(db, "tenants", tenantId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function setTenantActive(tenantId, active) {
  return updateTenant(tenantId, { active: !!active });
}

export async function deleteTenant(tenantId) {
  if (!tenantId) throw new Error("tenantId required");
  await deleteDoc(doc(db, "tenants", tenantId));
}

/* ================= INVITES + EMAIL (Trigger Email extension) ================= */

/**
 * ✅ Invite doc id == posAccountId
 */
export async function createTenantInvite({
  inviteId,
  tenantId,
  email,
  role = "sales",
  shopIds = [],
  shopId = "",
  name = "",
  active = true,
}) {
  if (!tenantId) throw new Error("tenantId required");

  const to = String(email || "").trim().toLowerCase();
  if (!to) throw new Error("Employee email required");

  if (!inviteId) throw new Error("inviteId required (use posAccountId)");

  await setDoc(
    doc(db, "tenantInvites", inviteId),
    {
      tenantId,
      email: to,
      name: String(name || "").trim(),
      role: String(role || "sales").toLowerCase(),
      shopId: String(shopId || "").trim(),
      shopIds: Array.isArray(shopIds) ? shopIds : [],
      active: active !== false,
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return inviteId;
}

export async function sendInviteEmail({
  to,
  inviteId,
  appUrl,
  tenantName = "",
  accountNumber = "",
}) {
  const email = String(to || "").trim().toLowerCase();
  if (!email) throw new Error("Missing email");
  if (!inviteId) throw new Error("Missing inviteId");
  if (!appUrl) throw new Error("Missing appUrl (your hosted site URL)");

  const link = `${String(appUrl).replace(/\/$/, "")}/invite?token=${encodeURIComponent(inviteId)}`;

  const subject = "Set your POS PIN";
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.4">
      <h2 style="margin:0 0 10px 0">You're invited${tenantName ? ` to ${tenantName}` : ""}</h2>
      <p>Account Number: <b>${accountNumber || "—"}</b></p>
      <p>Click below to set your PIN for terminal use:</p>
      <p>
        <a href="${link}" style="display:inline-block;padding:10px 14px;background:#111827;color:#fff;text-decoration:none;border-radius:8px">
          Set PIN
        </a>
      </p>
      <p style="font-size:12px;color:#6b7280">
        If the button doesn't work, copy/paste this link:<br/>
        ${link}
      </p>
    </div>
  `;

  await addDoc(collection(db, "mail"), {
    to: email,
    message: { subject, html },
    createdAt: serverTimestamp(),
  });

  return true;
}

// convenience: tenant -> invite -> email (DEV tool)
export async function createTenantAndInviteOwner({
  tenantName,
  ownerEmail,
  appUrl,
}) {
  if (!String(tenantName || "").trim()) throw new Error("Account name required");
  if (!String(ownerEmail || "").trim()) throw new Error("Owner email required");
  if (!String(appUrl || "").trim()) throw new Error("appUrl required");

  const { tenantId, accountNumber } = await createTenant({
    name: tenantName,
    ownerEmail,
    active: true,
  });

  // NOTE: You can wire “owner terminal” creation later when shops exist.
  // For now just create an invite doc (token-only PIN set flow).
  const placeholderOwnerPosId = `owner_${tenantId}`;

  await setDoc(
    doc(db, "posAccounts", placeholderOwnerPosId),
    {
      tenantId,
      shopId: "OWNER",
      name: "Owner",
      role: "owner",
      active: true,
      pinHash: "",
      pinSetAt: null,
      createdBy: auth.currentUser?.uid || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  const inviteId = await createTenantInvite({
    inviteId: placeholderOwnerPosId,
    tenantId,
    email: ownerEmail,
    role: "owner",
    shopIds: [],
    active: true,
    name: "Owner",
  });

  await sendInviteEmail({
    to: ownerEmail,
    inviteId,
    appUrl,
    tenantName,
    accountNumber,
  });

  return { tenantId, accountNumber, inviteId };
}

// ================= TENANT LOOKUP (by accountNumber) =================
export async function getTenantByAccountNumber(accountNumber) {
  const acct = String(accountNumber || "").trim();
  if (!acct) throw new Error("Account number is required.");

  const q = query(
    collection(db, "tenants"),
    where("accountNumber", "==", acct),
    limit(1)
  );

  const snap = await getDocs(q);
  if (snap.empty) return null;

  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

/* ================= INVITE ACCEPT (legacy) ================= */

async function _loadInviteById(inviteId) {
  const a = doc(db, "tenantInvites", inviteId);
  const sa = await getDoc(a);
  if (sa.exists())
    return { ref: a, data: sa.data(), id: sa.id, collection: "tenantInvites" };

  const b = doc(db, "invites", inviteId);
  const sb = await getDoc(b);
  if (sb.exists())
    return { ref: b, data: sb.data(), id: sb.id, collection: "invites" };

  return null;
}

export async function acceptTenantInvite(inviteId) {
  if (!inviteId) throw new Error("Missing invite token.");

  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in to accept an invite.");

  const invite = await _loadInviteById(inviteId);
  if (!invite) throw new Error("Invite not found or expired.");

  const inv = invite.data || {};
  const invitedEmail = String(inv.email || "").trim().toLowerCase();
  const userEmail = String(user.email || "").trim().toLowerCase();

  if (!invitedEmail) throw new Error("Invite is missing email.");
  if (!userEmail) throw new Error("Your signed-in account has no email.");
  if (invitedEmail !== userEmail) {
    throw new Error(
      `Signed-in email (${userEmail}) does not match invite email (${invitedEmail}).`
    );
  }

  const tenantId = String(inv.tenantId || "").trim();
  if (!tenantId) throw new Error("Invite is missing tenantId.");

  const role = String(inv.role || "owner").toLowerCase();
  const shopIds = Array.isArray(inv.shopIds) ? inv.shopIds : [];
  const active = inv.active !== false;
  if (!active) throw new Error("Invite is inactive.");

  await setDoc(
    doc(db, "users", user.uid),
    {
      email: userEmail,
      displayName: user.displayName || userEmail,
      role,
      tenantId,
      shopIds,
      active: true,
      inviteId,
      invitedFrom: invite.collection,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );

  try {
    await updateDoc(invite.ref, {
      status: "accepted",
      acceptedAt: serverTimestamp(),
      acceptedUid: user.uid,
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn("Invite accepted, but failed to update invite doc:", e);
  }

  return { uid: user.uid, tenantId, email: userEmail };
}