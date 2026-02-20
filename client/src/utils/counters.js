// client/src/utils/counters.js
import { db } from "../firebase";
import { doc, runTransaction, serverTimestamp } from "firebase/firestore";

/**
 * Atomic counter in Firestore: /counters/{name}
 * returns next integer
 */
export async function getNextCounter(name) {
  const ref = doc(db, "counters", name);

  const next = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists() ? Number(snap.data()?.value || 0) : 0;
    const n = current + 1;

    if (!snap.exists()) {
      tx.set(ref, { value: n, updatedAt: serverTimestamp() });
    } else {
      tx.update(ref, { value: n, updatedAt: serverTimestamp() });
    }

    return n;
  });

  return next;
}

/**
 * e.g. SD-000123
 */
export function formatOrderNumber(n) {
  const num = Number(n || 0);
  const padded = String(num).padStart(6, "0");
  return `SD-${padded}`;
}







