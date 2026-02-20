import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp
} from "firebase/firestore";
import { db } from "../firebase";

const unitsRef = collection(db, "productUnits");

export async function getAvailableUnitsFIFO(productId) {
  const q = query(
    unitsRef,
    where("productId", "==", productId),
    where("status", "==", "IN_STOCK"),
    orderBy("receivedAt", "asc")
  );

  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function reserveProductUnit(unitId, orderId) {
  const ref = doc(db, "productUnits", unitId);
  await updateDoc(ref, {
    status: "RESERVED",
    reservedForOrderId: orderId,
    reservedAt: serverTimestamp()
  });
}







