import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

export async function writeSession({ tenantId, shopId, posAccountId = null }) {
  const uid = auth.currentUser?.uid;
  if (!uid || !tenantId || !shopId) return;

  await setDoc(
    doc(db, "sessions", uid),
    {
      uid,
      tenantId,
      shopId,
      posAccountId,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}







