import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../firebase"; // <-- MUST be your initialized firebase app export

const functions = getFunctions(app, "us-central1");

export async function inviteUser({ email, tenantId, role, name }) {
  console.log("[inviteUserClient] calling inviteUser us-central1", { email, tenantId, role, name });

  const fn = httpsCallable(functions, "inviteUser");
  const res = await fn({ email, tenantId, role, name });

  console.log("[inviteUserClient] success", res.data);
  return res.data;
}







