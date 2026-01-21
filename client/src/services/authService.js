// client/src/services/authService.js
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
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

/* ================= AUTH ================= */

export function watchAuth(cb) {
  return onAuthStateChanged(auth, cb);
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

/* ================= SESSION DOC ================= */

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

// users/{uid}
export async function loadUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

// tenants/{tenantId}
export async function loadTenant(tenantId) {
  const snap = await getDoc(doc(db, "tenants", tenantId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

// shops/{shopId}
export async function loadShop(shopId) {
  const snap = await getDoc(doc(db, "shops", shopId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/* ================= POS ACCOUNTS (PIN) ================= */

export async function unlockWithPin({ tenantId, shopId, pin }) {
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
    if (String(data.pin) === String(pin)) {
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

export async function createPosAccount({
  tenantId,
  shopId,
  name,
  pin,
  role = "sales",
  active = true,
  createdBy = null,
}) {
  const ref = doc(collection(db, "posAccounts"));
  await setDoc(ref, {
    tenantId,
    shopId,
    name: String(name || "").trim(),
    pin: String(pin || "").trim(),
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

export async function listShopsForTenant({
  tenantId,
  includeInactive = false,
}) {
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

// NOTE: "accountNumber" is the short human identifier you show customers.
// tenantId can remain Firestore doc id (or you can also make it match accountNumber later).

function randomDigits(len = 8) {
  let out = "";
  for (let i = 0; i < len; i++) out += Math.floor(Math.random() * 10);
  return out;
}

// generate an unused accountNumber (8 digits) — dev-only usage
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

  const ref = doc(collection(db, "tenants")); // auto-id
  await setDoc(ref, {
    name: String(name || "").trim(),
    active: !!active,
    ownerEmail: String(ownerEmail || "").trim().toLowerCase(),
    accountNumber, // ✅ your customer-friendly identifier
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

export async function createTenantInvite({
  tenantId,
  email,
  role = "owner",
  shopIds = [],
  active = true,
}) {
  if (!tenantId) throw new Error("tenantId required");
  const to = String(email || "").trim().toLowerCase();
  if (!to) throw new Error("Owner email required");

  const ref = doc(collection(db, "tenantInvites"));
  await setDoc(ref, {
    tenantId,
    email: to,
    role: String(role || "owner").toLowerCase(),
    shopIds: Array.isArray(shopIds) ? shopIds : [],
    active: active !== false,
    status: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return ref.id; // inviteId
}

// Writes to /mail for Firebase Trigger Email extension
export async function sendInviteEmail({
  to,
  inviteId,
  appUrl, // ex: https://pos.yourdomain.com
  tenantName = "",
  accountNumber = "",
}) {
  const email = String(to || "").trim().toLowerCase();
  if (!email) throw new Error("Missing email");
  if (!inviteId) throw new Error("Missing inviteId");
  if (!appUrl) throw new Error("Missing appUrl (your hosted site URL)");

  const link = `${String(appUrl).replace(/\/$/, "")}/accept-invite?token=${encodeURIComponent(inviteId)}`;

  const subject = "Your POS account is ready";
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.4">
      <h2 style="margin:0 0 10px 0">Welcome${tenantName ? `, ${tenantName}` : ""}!</h2>
      <p>Your POS account has been created.</p>
      <p><b>Account Number:</b> ${accountNumber || "—"}</p>
      <p>
        Click below to accept your invite and set your password:
      </p>
      <p>
        <a href="${link}" style="display:inline-block;padding:10px 14px;background:#111827;color:#fff;text-decoration:none;border-radius:8px">
          Accept Invite
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

// convenience: creates tenant -> invite -> email
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

  const inviteId = await createTenantInvite({
    tenantId,
    email: ownerEmail,
    role: "owner",
    shopIds: [],
    active: true,
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

/* ================= INVITE ACCEPT (links CURRENT signed-in user) ================= */

async function _loadInviteById(inviteId) {
  const a = doc(db, "tenantInvites", inviteId);
  const sa = await getDoc(a);
  if (sa.exists()) return { ref: a, data: sa.data(), id: sa.id, collection: "tenantInvites" };

  const b = doc(db, "invites", inviteId);
  const sb = await getDoc(b);
  if (sb.exists()) return { ref: b, data: sb.data(), id: sb.id, collection: "invites" };

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
    throw new Error(`Signed-in email (${userEmail}) does not match invite email (${invitedEmail}).`);
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
