import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "../firebase";

export async function createPosAccount({
  tenantId,
  shopId,
  name,
  pin,
  role,
  createdBy,
}) {
  return addDoc(collection(db, "posAccounts"), {
    tenantId,
    shopId,
    name,
    pin,
    role,
    createdBy: createdBy || null,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function listPosAccountsForShop({ tenantId, shopId }) {
  const q = query(
    collection(db, "posAccounts"),
    where("tenantId", "==", tenantId),
    where("shopId", "==", shopId)
  );

  const snap = await getDocs(q);
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}
