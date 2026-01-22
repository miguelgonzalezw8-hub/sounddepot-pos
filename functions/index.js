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
