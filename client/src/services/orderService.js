import {
  collection,
  addDoc,
  serverTimestamp
} from "firebase/firestore";
import { db } from "../firebase";
import { getAvailableUnitsFIFO, reserveProductUnit } from "./inventoryService";

const orderItemsRef = collection(db, "orderItems");

export async function processOrderItem({
  orderId,
  product,
  quantity,
  orderCreatedAt,
  promptBackorder
}) {
  // Skip non-inventory items (labor, fees)
  if (!product.trackInventory) {
    await addDoc(orderItemsRef, {
      orderId,
      productId: product.id,
      quantity,
      fulfilledQty: quantity,
      backorderedQty: 0,
      assignedUnitIds: [],
      orderCreatedAt
    });
    return;
  }

  const availableUnits = await getAvailableUnitsFIFO(product.id);

  const fulfillableQty = Math.min(quantity, availableUnits.length);
  const backorderedQty = quantity - fulfillableQty;

  if (backorderedQty > 0) {
    const ok = await promptBackorder(backorderedQty);
    if (!ok) throw new Error("Backorder declined");
  }

  const assignedUnitIds = [];

  for (let i = 0; i < fulfillableQty; i++) {
    const unit = availableUnits[i];
    await reserveProductUnit(unit.id, orderId);
    assignedUnitIds.push(unit.id);
  }

  await addDoc(orderItemsRef, {
    orderId,
    productId: product.id,
    quantity,
    fulfilledQty: fulfillableQty,
    backorderedQty,
    assignedUnitIds,
    orderCreatedAt,
    createdAt: serverTimestamp()
  });
}
