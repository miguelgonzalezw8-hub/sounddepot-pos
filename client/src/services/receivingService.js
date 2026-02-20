import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  updateDoc,
  doc,
  increment,
  arrayUnion,
  serverTimestamp
} from "firebase/firestore";
import { db } from "../firebase";
import { updateOrderStatus } from "./orderService";

const unitsRef = collection(db, "productUnits");
const orderItemsRef = collection(db, "orderItems");
const ordersRef = collection(db, "orders");

export async function receiveProductUnit({
  product,
  serialNumber,
  receivedBy
}) {
  // 1️⃣ Create the physical unit
  const unitRef = await addDoc(unitsRef, {
    productId: product.id,
    serialNumber: product.trackSerials ? serialNumber : null,
    status: "IN_STOCK",
    receivedAt: serverTimestamp(),
    receivedBy
  });

  // 2️⃣ Find oldest backorder
  const q = query(
    orderItemsRef,
    where("productId", "==", product.id),
    where("backorderedQty", ">", 0),
    orderBy("orderCreatedAt", "asc"),
    limit(1)
  );

  const snap = await getDocs(q);
  if (snap.empty) return;

  const backorderDoc = snap.docs[0];
  const backorder = backorderDoc.data();

  // 3️⃣ Assign unit to order
  await updateDoc(doc(db, "productUnits", unitRef.id), {
    status: "RESERVED",
    reservedForOrderId: backorder.orderId,
    reservedAt: serverTimestamp()
  });

  await updateDoc(backorderDoc.ref, {
    fulfilledQty: increment(1),
    backorderedQty: increment(-1),
    assignedUnitIds: arrayUnion(unitRef.id)
  });

  // 4️⃣ Update order status if needed
  await updateOrderStatus(backorder.orderId);
}

async function updateOrderStatus(orderId) {
  const q = query(orderItemsRef, where("orderId", "==", orderId));
  const snap = await getDocs(q);

  const hasBackorders = snap.docs.some(
    d => d.data().backorderedQty > 0
  );

  await updateDoc(doc(db, "orders", orderId), {
    status: hasBackorders ? "PARTIAL" : "FULFILLED"
  });
}







