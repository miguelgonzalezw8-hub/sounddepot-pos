// client/src/services/orderService.js
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  updateDoc,
  doc,
  serverTimestamp,
  increment,
  arrayUnion,
} from "firebase/firestore";

import { db } from "../firebase";
import { getAvailableUnitsFIFO, reserveProductUnit } from "./inventoryService";

/**
 * Collections
 */
const ordersRef = collection(db, "orders");
const orderItemsRef = collection(db, "orderItems");
const tasksRef = collection(db, "tasks");

/**
 * Dashboard tasks/reminders live in tasks/.
 */
async function createTask({
  type,
  message,
  priority = "high",
  orderId = "",
  orderItemId = "",
  productId = "",
  customerId = "",
  customerName = "",
  createdBy = "",
}) {
  await addDoc(tasksRef, {
    type,
    message,
    priority,
    status: "open",
    orderId,
    orderItemId,
    productId,
    customerId,
    customerName,
    createdAt: serverTimestamp(),
    createdBy,
  });
}

/**
 * Keep compatible with your receivingService.js:
 * It calls updateOrderStatus(backorder.orderId)
 */
export async function updateOrderStatus(orderId) {
  const q = query(orderItemsRef, where("orderId", "==", orderId));
  const snap = await getDocs(q);

  const hasBackorders = snap.docs.some(
    (d) => Number(d.data()?.backorderedQty || 0) > 0
  );

  await updateDoc(doc(db, "orders", orderId), {
    status: hasBackorders ? "PARTIAL" : "FULFILLED",
    updatedAt: serverTimestamp(),
  });

  return { hasBackorders };
}

/**
 * Optional: create an order header
 */
export async function createOrder({
  customerId = "",
  customerName = "",
  customerPhone = "",
  notes = "",
  createdBy = "",
}) {
  const orderRef = await addDoc(ordersRef, {
    customerId,
    customerName,
    customerPhone,
    notes,
    status: "DRAFT",
    createdAt: serverTimestamp(),
    createdBy,
  });

  return { id: orderRef.id };
}

/**
 * Create an order item row.
 * REQUIRED for receivingService logic:
 * - productId
 * - backorderedQty (>0 means backorder exists)
 * - orderCreatedAt (so oldest is picked first)
 * - orderId
 *
 * ✅ NEW (accurate reporting):
 * - unitPrice (sell price used at time of sale)
 * - discountTotal (line discount total)
 * - lineSubtotal / lineTotal (net)
 * - taxable (bool)
 */
export async function createOrderItem({
  orderId,
  product,
  qty,
  createdBy = "",

  // ✅ pricing snapshot fields
  unitPrice = null,       // per unit
  discountTotal = 0,      // total discount for this line
  taxable = true,
}) {
  if (!orderId) throw new Error("createOrderItem: missing orderId");
  if (!product?.id) throw new Error("createOrderItem: missing product.id");

  const qNum = Number(qty);
  if (!Number.isFinite(qNum) || qNum <= 0)
    throw new Error("createOrderItem: qty must be > 0");

  const orderSnap = await getDoc(doc(db, "orders", orderId));
  if (!orderSnap.exists()) throw new Error("Order not found");

  const orderData = orderSnap.data() || {};

  const p = Number(unitPrice ?? product.price ?? 0);
  const d = Number(discountTotal || 0);
  const lineSubtotal = p * qNum;
  const lineTotal = Math.max(lineSubtotal - d, 0);

  const itemRef = await addDoc(orderItemsRef, {
    orderId,
    productId: product.id,
    productName: product.name || "",
    trackSerials: !!product.trackSerials,

    // ✅ pricing snapshot
    unitPrice: Number.isFinite(p) ? p : 0,
    discountTotal: Number.isFinite(d) ? d : 0,
    lineSubtotal: Number.isFinite(lineSubtotal) ? lineSubtotal : 0,
    lineTotal: Number.isFinite(lineTotal) ? lineTotal : 0,
    taxable: !!taxable,

    // quantities
    qtyOrdered: qNum,
    fulfilledQty: 0,
    backorderedQty: qNum,

    // used for FIFO backorder assignment in receivingService
    orderCreatedAt: orderData.createdAt || serverTimestamp(),

    assignedUnitIds: [],

    createdAt: serverTimestamp(),
    createdBy,
  });

  return { id: itemRef.id };
}

/**
 * Allocate IN_STOCK units FIFO for ONE order item.
 * - Reserves existing inventory units (oldest receivedAt first)
 * - Updates fulfilledQty/backorderedQty/assignedUnitIds
 * - Creates a Dashboard reminder if anything is backordered
 */
export async function allocateOrderItemFIFO({
  orderItemId,
  createdBy = "",
  createBackorderReminder = true,
}) {
  const itemRef = doc(db, "orderItems", orderItemId);
  const itemSnap = await getDoc(itemRef);
  if (!itemSnap.exists()) throw new Error("Order item not found");

  const item = itemSnap.data() || {};
  const orderId = item.orderId;
  const productId = item.productId;

  const qtyOrdered = Number(item.qtyOrdered || 0);
  const fulfilledQty = Number(item.fulfilledQty || 0);
  const need = Math.max(qtyOrdered - fulfilledQty, 0);

  if (need <= 0) {
    await updateOrderStatus(orderId);
    return { reserved: 0, backordered: Number(item.backorderedQty || 0) };
  }

  const available = await getAvailableUnitsFIFO(productId);
  const reserveCount = Math.min(need, available.length);

  // Reserve FIFO units
  const reservedIds = [];
  for (let i = 0; i < reserveCount; i++) {
    const unit = available[i];
    await reserveProductUnit(unit.id, orderId);
    reservedIds.push(unit.id);
  }

  const newFulfilled = fulfilledQty + reserveCount;
  const newBackordered = Math.max(qtyOrdered - newFulfilled, 0);

  const patch = {
    fulfilledQty: increment(reserveCount),
    backorderedQty: increment(-reserveCount),
    updatedAt: serverTimestamp(),
  };

  if (reservedIds.length) {
    patch.assignedUnitIds = arrayUnion(...reservedIds);
  }

  await updateDoc(itemRef, patch);

  if (createBackorderReminder && newBackordered > 0) {
    await createTask({
      type: "BACKORDER_CREATED",
      message: `${item.productName || "Item"} is backordered (${newBackordered}). Contact customer and track incoming inventory.`,
      orderId,
      orderItemId,
      productId,
      customerId: item.customerId || "",
      customerName: item.customerName || "",
      createdBy,
    });
  }

  await updateOrderStatus(orderId);

  return {
    reserved: reserveCount,
    backordered: newBackordered,
    reservedUnitIds: reservedIds,
  };
}

/**
 * Allocate FIFO for ALL items on an order.
 */
export async function allocateOrderFIFO({ orderId, createdBy = "" }) {
  const q = query(orderItemsRef, where("orderId", "==", orderId));
  const snap = await getDocs(q);

  for (const d of snap.docs) {
    await allocateOrderItemFIFO({
      orderItemId: d.id,
      createdBy,
      createBackorderReminder: true,
    });
  }

  return updateOrderStatus(orderId);
}

/**
 * Called when receivingService applies a received unit to a backorder.
 */
export async function createBackorderArrivedTask({
  orderId,
  orderItemId = "",
  productId = "",
  productName = "",
  qtyApplied = 1,
  customerId = "",
  customerName = "",
  createdBy = "",
}) {
  await createTask({
    type: "CONTACT_CUSTOMER_BACKORDER_ARRIVED",
    message: `${customerName || "Customer"}: backordered ${
      productName || "item"
    } arrived (${qtyApplied}). Contact customer to schedule pickup/install.`,
    orderId,
    orderItemId,
    productId,
    customerId,
    customerName,
    createdBy,
  });
}

/**
 * COMPAT: Sell.jsx expects processOrderItem()
 * ✅ Now supports accurate pricing snapshot fields.
 *
 * Supports two calling styles:
 *  A) processOrderItem({ orderId, product, qty|quantity, createdBy, unitPrice, discountTotal, taxable })
 *  B) processOrderItem({ orderItemId, createdBy })
 */
export async function processOrderItem(payload) {
  // Style B
  if (payload?.orderItemId) {
    return allocateOrderItemFIFO({
      orderItemId: payload.orderItemId,
      createdBy: payload.createdBy || "",
      createBackorderReminder: true,
    });
  }

  // Style A
  const {
    orderId,
    product,
    createdBy = "",

    // ✅ accept either qty or quantity (Sell.jsx compatibility)
    qty,
    quantity,

    // ✅ pricing snapshot
    unitPrice = null,
    discountTotal = 0,
    taxable = true,
  } = payload || {};

  const qNum = Number(qty ?? quantity);

  if (!orderId) throw new Error("processOrderItem: missing orderId");
  if (!product?.id) throw new Error("processOrderItem: missing product");
  if (!Number.isFinite(qNum) || qNum <= 0)
    throw new Error("processOrderItem: qty must be > 0");

  const { id: orderItemId } = await createOrderItem({
    orderId,
    product,
    qty: qNum,
    createdBy,
    unitPrice,
    discountTotal,
    taxable,
  });

  const alloc = await allocateOrderItemFIFO({
    orderItemId,
    createdBy,
    createBackorderReminder: true,
  });

  return { orderItemId, ...alloc };
}
