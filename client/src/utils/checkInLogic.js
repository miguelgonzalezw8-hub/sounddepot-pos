// client/src/utils/checkInLogic.js
import {
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

/**
 * Check in inventory for a product.
 * - Applies received qty to oldest open backorders first
 * - Creates "tasks" reminders for dashboard
 * - Adds remaining qty to product stock
 *
 * @param {object} params
 * @param {import("firebase/firestore").Firestore} params.db Firestore instance
 * @param {string} params.productId Product doc id
 * @param {number} params.qtyReceived Quantity received (positive int)
 * @param {string=} params.createdBy Optional uid
 *
 * @returns {Promise<{
 *   productId: string,
 *   qtyReceived: number,
 *   appliedToBackorders: number,
 *   addedToStock: number,
 *   backorderActions: Array<{
 *     backorderId: string,
 *     customerId?: string,
 *     appliedQty: number,
 *     newStatus: "open"|"partial"|"fulfilled"
 *   }>
 * }>}
 */
export async function checkInProduct({ db, productId, qtyReceived, createdBy }) {
  const qty = Number(qtyReceived);

  if (!productId) throw new Error("Missing productId");
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("qtyReceived must be > 0");

  // We fetch candidate backorders OUTSIDE the transaction (Firestore limitation),
  // then re-check and apply inside the transaction safely.
  const backordersRef = collection(db, "backorders");
  const q = query(
    backordersRef,
    where("productId", "==", productId),
    where("status", "in", ["open", "partial"]),
    orderBy("createdAt", "asc"),
    limit(50)
  );

  const snapshot = await getDocs(q);
  const candidateBackorders = snapshot.docs.map((d) => ({
    id: d.id,
    ref: d.ref,
  }));

  const result = await runTransaction(db, async (tx) => {
    const productRef = doc(db, "products", productId);
    const productSnap = await tx.get(productRef);

    if (!productSnap.exists()) {
      throw new Error(`Product not found: ${productId}`);
    }

    const productData = productSnap.data() || {};
    const currentStock = Number(productData.stock || 0);

    let remaining = qty;
    let appliedToBackorders = 0;
    const backorderActions = [];

    // Apply to backorders in order
    for (const bo of candidateBackorders) {
      if (remaining <= 0) break;

      const boSnap = await tx.get(bo.ref);
      if (!boSnap.exists()) continue;

      const boData = boSnap.data() || {};
      const status = boData.status || "open";
      if (status !== "open" && status !== "partial") continue;

      const boQty = Number(boData.qty || 0);
      const fulfilledQty = Number(boData.fulfilledQty || 0);
      const stillNeeded = Math.max(boQty - fulfilledQty, 0);

      if (stillNeeded <= 0) {
        // stale doc; mark fulfilled just in case
        tx.update(bo.ref, {
          status: "fulfilled",
          updatedAt: serverTimestamp(),
        });
        continue;
      }

      const apply = Math.min(remaining, stillNeeded);
      if (apply <= 0) continue;

      const newFulfilled = fulfilledQty + apply;
      const newStatus =
        newFulfilled >= boQty ? "fulfilled" : "partial";

      tx.update(bo.ref, {
        fulfilledQty: newFulfilled,
        status: newStatus,
        lastAppliedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      remaining -= apply;
      appliedToBackorders += apply;

      backorderActions.push({
        backorderId: bo.ref.id,
        customerId: boData.customerId || "",
        appliedQty: apply,
        newStatus,
      });

      // Create a dashboard task/reminder when we apply anything to a backorder
      const tasksRef = collection(db, "tasks");
      const taskRef = doc(tasksRef);

      const customerLabel =
        boData.customerName ||
        boData.customerId ||
        "Customer";

      tx.set(taskRef, {
        type: "CONTACT_CUSTOMER_BACKORDER_ARRIVED",
        status: "open",
        priority: "high",
        productId,
        backorderId: bo.ref.id,
        customerId: boData.customerId || "",
        qtyArrivedApplied: apply,
        message: `${customerLabel}: backordered item arrived (${apply} unit${apply === 1 ? "" : "s"} applied). Contact customer to schedule pickup/install.`,
        createdAt: serverTimestamp(),
        createdBy: createdBy || "",
      });
    }

    // Remaining qty goes to stock
    const addedToStock = remaining > 0 ? remaining : 0;

    if (addedToStock > 0) {
      tx.update(productRef, {
        stock: currentStock + addedToStock,
        updatedAt: serverTimestamp(),
      });
    } else {
      // still touch updatedAt for audit
      tx.update(productRef, {
        updatedAt: serverTimestamp(),
      });
    }

    // Audit trail doc (optional but recommended)
    const checkinsRef = collection(db, "checkins");
    const checkinRef = doc(checkinsRef);

    tx.set(checkinRef, {
      productId,
      qtyReceived: qty,
      appliedToBackorders,
      addedToStock,
      backorderActions,
      createdAt: serverTimestamp(),
      createdBy: createdBy || "",
    });

    return {
      productId,
      qtyReceived: qty,
      appliedToBackorders,
      addedToStock,
      backorderActions,
    };
  });

  return result;
}
