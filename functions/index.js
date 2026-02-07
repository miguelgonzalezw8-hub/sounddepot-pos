/* functions/index.js */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

admin.initializeApp();
setGlobalOptions({ region: "us-central1" });

// ---------- helpers ----------
function randomDigits(len = 8) {
  let out = "";
  for (let i = 0; i < len; i++) out += Math.floor(Math.random() * 10);
  return out;
}

async function generateUniqueAccountNumber() {
  for (let attempts = 0; attempts < 25; attempts++) {
    const candidate = randomDigits(8);
    const snap = await admin
      .firestore()
      .collection("tenants")
      .where("accountNumber", "==", candidate)
      .limit(1)
      .get();
    if (snap.empty) return candidate;
  }
  throw new Error("Failed to generate a unique account number. Try again.");
}

function cleanUrl(u) {
  const s = String(u || "").trim().replace(/\/$/, "");
  if (!s) throw new Error("Missing appUrl");
  if (!/^https:\/\/.+/i.test(s)) throw new Error("appUrl must start with https://");
  return s;
}

/**
 * Callable: createTenantAndInviteOwner
 * data: { tenantName, ownerEmail, appUrl }
 * returns: { tenantId, accountNumber, inviteId, email }
 */
exports.createTenantAndInviteOwner = onCall(
  { region: "us-central1", cors: true },
  async (request) => {
    console.log("[createTenantAndInviteOwner] CALLED", {
      authUid: request.auth?.uid || null,
      dataKeys: Object.keys(request.data || {}),
    });

    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");

    // IMPORTANT:
    // If you're using devMode without real custom claims yet, you can temporarily allow your UID:
    const DEV_UID = process.env.DEV_UID || ""; // optional
    const callerRole = request.auth.token?.role;
    const isDev = DEV_UID && request.auth.uid === DEV_UID;

    if (!isDev && callerRole !== "owner" && callerRole !== "manager") {
      throw new HttpsError("permission-denied", "Not allowed.");
    }

    const { tenantName, ownerEmail, appUrl } = request.data || {};
    const name = String(tenantName || "").trim();
    const email = String(ownerEmail || "").trim().toLowerCase();
    const baseUrl = cleanUrl(appUrl);

    if (!name) throw new HttpsError("invalid-argument", "tenantName required");
    if (!email) throw new HttpsError("invalid-argument", "ownerEmail required");

    // 1) Create tenant
    const accountNumber = await generateUniqueAccountNumber();
    const tenantRef = admin.firestore().collection("tenants").doc();
    await tenantRef.set({
      name,
      ownerEmail: email,
      accountNumber,
      active: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: request.auth.uid,
    });

    const tenantId = tenantRef.id;

    // 2) Create invite doc
    const inviteRef = admin.firestore().collection("tenantInvites").doc();
    await inviteRef.set({
      tenantId,
      email,
      role: "owner",
      shopIds: [],
      active: true,
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: request.auth.uid,
    });
    const inviteId = inviteRef.id;

    // 3) Generate “create password” link that lands on your app
    // This will append oobCode/mode/etc and send them to /create-account?inviteId=...
    const actionCodeSettings = {
      url: `${baseUrl}/create-account?inviteId=${encodeURIComponent(inviteId)}`,
      handleCodeInApp: true,
    };

    const resetLink = await admin.auth().generatePasswordResetLink(email, actionCodeSettings);

    // 4) Write email doc for the extension to send
    const subject = "Your Sound Depot POS account is ready";
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.4">
        <h2 style="margin:0 0 10px 0">Welcome!</h2>
        <p>Your POS account has been created.</p>
        <p><b>Account Number:</b> ${accountNumber}</p>
        <p style="margin:18px 0">
          <a href="${resetLink}" style="display:inline-block;padding:12px 16px;background:#111;color:#fff;text-decoration:none;border-radius:8px">
            Create Account
          </a>
        </p>
        <p style="font-size:12px;color:#666">
          If the button doesn't work, copy/paste this link:<br/>
          ${resetLink}
        </p>
      </div>
    `;

    await admin.firestore().collection("mail").add({
      to: email,
      message: { subject, html },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log("[createTenantAndInviteOwner] DONE", { tenantId, accountNumber, inviteId, email });

    return { tenantId, accountNumber, inviteId, email };
  }
);
/**
 * Callable: createEmployeeLogin
 * data: { tenantId, email, name, role, shopIds?, resetPassword? }
 * returns: { ok, uid, email, tempPassword? }
 */
exports.createEmployeeLogin = onCall(
  { region: "us-central1", cors: true },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");

    const DEV_UID = process.env.DEV_UID || "";
    const callerUid = request.auth.uid;
    const callerRole = request.auth.token?.role || "";
    const isDev = DEV_UID && callerUid === DEV_UID;

    if (!isDev && callerRole !== "owner" && callerRole !== "manager") {
      throw new HttpsError("permission-denied", "Not allowed.");
    }

    const email = String(request.data?.email || "").trim().toLowerCase();
    const name = String(request.data?.name || "").trim();
    const role = String(request.data?.role || "").trim();
    const tenantId = String(request.data?.tenantId || "").trim();

    const shopIds = Array.isArray(request.data?.shopIds)
      ? request.data.shopIds.map((s) => String(s || "").trim()).filter(Boolean)
      : [];

    const resetPassword = !!request.data?.resetPassword;

    if (!tenantId) throw new HttpsError("invalid-argument", "tenantId required");
    if (!email) throw new HttpsError("invalid-argument", "email required");
    if (!role) throw new HttpsError("invalid-argument", "role required");

    // ✅ Verify caller belongs to this tenant (session first, fallback to users profile)
    const sessionSnap = await admin.firestore().collection("sessions").doc(callerUid).get();
    const sessionTenantId = sessionSnap.exists ? String(sessionSnap.data()?.tenantId || "") : "";

    let callerTenantId = sessionTenantId;
    if (!callerTenantId) {
      const userSnap = await admin.firestore().collection("users").doc(callerUid).get();
      callerTenantId = userSnap.exists ? String(userSnap.data()?.tenantId || "") : "";
    }

    // If dev, allow; otherwise enforce tenant match
    if (!isDev && (!callerTenantId || callerTenantId !== tenantId)) {
      throw new HttpsError("permission-denied", "Tenant mismatch.");
    }

    // temp password generator (only used on create OR reset)
    const makeTempPassword = () =>
      `SD${Math.random().toString(36).slice(2, 8)}!${Math.floor(Math.random() * 90 + 10)}`;

    let userRecord;

    // ✅ Create or fetch Auth user
    try {
      userRecord = await admin.auth().getUserByEmail(email);
    } catch (e) {
      if (e?.code === "auth/user-not-found") {
        const tempPassword = makeTempPassword();
        userRecord = await admin.auth().createUser({
          email,
          password: tempPassword,
          displayName: name || email,
        });

        // set claims
        await admin.auth().setCustomUserClaims(userRecord.uid, { role, tenantId, shopIds });

        // upsert firestore profile
        await admin.firestore().collection("users").doc(userRecord.uid).set(
          {
            tenantId,
            role,
            shopIds: shopIds.length ? shopIds : null,
            email,
            name: name || null,
            active: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        return { ok: true, uid: userRecord.uid, email, tempPassword };
      }

      throw new HttpsError("internal", e?.message || "getUserByEmail failed");
    }

    // ✅ Existing user: optionally reset password
    let tempPassword = null;
    if (resetPassword) {
      tempPassword = makeTempPassword();
      await admin.auth().updateUser(userRecord.uid, { password: tempPassword });
    }

    // ✅ Update claims + profile
    await admin.auth().setCustomUserClaims(userRecord.uid, { role, tenantId, shopIds });

    await admin.firestore().collection("users").doc(userRecord.uid).set(
      {
        tenantId,
        role,
        shopIds: shopIds.length ? shopIds : null,
        email,
        name: name || null,
        active: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { ok: true, uid: userRecord.uid, email, tempPassword };
  }
);
exports.inviteEmployeeLogin = onCall(
  { region: "us-central1", cors: true },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");

    const DEV_UID = process.env.DEV_UID || "";
    const callerRole = request.auth.token?.role;
    const isDev = DEV_UID && request.auth.uid === DEV_UID;

    if (!isDev && callerRole !== "owner" && callerRole !== "manager") {
      throw new HttpsError("permission-denied", "Not allowed.");
    }

    const { tenantId, email, role = "sales", shopIds = [], appUrl } = request.data || {};
    const tId = String(tenantId || "").trim();
    const em = String(email || "").trim().toLowerCase();
    const baseUrl = cleanUrl(appUrl);

    if (!tId) throw new HttpsError("invalid-argument", "tenantId required");
    if (!em) throw new HttpsError("invalid-argument", "email required");

    const safeRole = String(role || "").trim().toLowerCase();
    if (!["sales", "installer", "manager", "owner"].includes(safeRole)) {
      throw new HttpsError("invalid-argument", "role must be sales/installer/manager/owner");
    }

    // 1) Create invite doc
    const inviteRef = admin.firestore().collection("tenantInvites").doc();
    await inviteRef.set({
      tenantId: tId,
      email: em,
      role: safeRole,
      shopIds: Array.isArray(shopIds) ? shopIds : [],
      active: true,
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: request.auth.uid,
    });
    const inviteId = inviteRef.id;

    // 2) Generate create-password link to your app route
    const actionCodeSettings = {
      url: `${baseUrl}/create-account?inviteId=${encodeURIComponent(inviteId)}`,
      handleCodeInApp: true,
    };

    const resetLink = await admin.auth().generatePasswordResetLink(em, actionCodeSettings);

    // 3) Email via Firestore "mail" outbox
    const subject = "Your Sound Depot POS login is ready";
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.4">
        <h2 style="margin:0 0 10px 0">You’ve been invited</h2>
        <p>Create your login to access the POS.</p>
        <p><b>Role:</b> ${safeRole}</p>
        <p style="margin:18px 0">
          <a href="${resetLink}" style="display:inline-block;padding:12px 16px;background:#111;color:#fff;text-decoration:none;border-radius:8px">
            Create Account
          </a>
        </p>
        <p style="font-size:12px;color:#666">
          If the button doesn't work, copy/paste:<br/>
          ${resetLink}
        </p>
      </div>
    `;

    await admin.firestore().collection("mail").add({
      to: em,
      message: { subject, html },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { inviteId, email: em };
  }
);
