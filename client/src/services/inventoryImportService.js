// client/src/services/inventoryImportService.js
import { db } from "../firebase";
import {
  collection,
  doc,
  serverTimestamp,
  writeBatch,
  runTransaction,
} from "firebase/firestore";

/* ===============================
   NEAT PRODUCT ID HELPERS
   Format: <BRANDCODE><####>
   BRANDCODE = first + last char of brand (A-Z0-9), uppercase
   Example: "JL Audio" -> "JO0001"
   =============================== */
function makeBrandCode(brand) {
  const cleaned = String(brand || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (cleaned.length >= 2) return cleaned[0] + cleaned[cleaned.length - 1];
  if (cleaned.length === 1) return cleaned[0] + cleaned[0];
  return "XX";
}

async function getNextProductIdForBrand(dbRef, tenantId, brand) {
  const brandCode = makeBrandCode(brand);

  // ✅ Per-tenant counter doc id
  const counterRef = doc(dbRef, "counters", `t_${tenantId}_products_${brandCode}`);

  const nextNum = await runTransaction(dbRef, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? Number(snap.data()?.next || 1) : 1;

    tx.set(
      counterRef,
      { tenantId, brandCode, next: current + 1, updatedAt: serverTimestamp() },
      { merge: true }
    );

    return current;
  });

  const padded = String(nextNum).padStart(4, "0");
  return `${brandCode}${padded}`;
}

// Stable key for grouping rows into one "product"
function makeProductGroupKey(p) {
  const sku = String(p.sku || "").trim().toLowerCase();
  const brand = String(p.subBrand || p.brand || "").trim().toLowerCase();
  const name = String(p.name || "").trim().toLowerCase();

  // Prefer SKU if present (best)
  if (sku) return `sku:${brand}:${sku}`;

  // Fallback: brand + name
  return `name:${brand}:${name}`;
}

function cleanSerial(s) {
  return String(s || "").trim();
}

function unitDocId(tenantId, productId, serial) {
  // deterministic + safe (prevents dupes on re-import)
  const safe = cleanSerial(serial).replace(/[^A-Za-z0-9_-]/g, "");
  return `t_${tenantId}_${productId}_${safe}`;
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Import products + serialized inventory units.
 *
 * Writes:
 * - products/{productId}
 * - inventoryUnits/{t_<tenant>_<productId>_<serial>}
 *
 * Assumes the caller already normalized rows into:
 * {
 *   name, description, sku, barcode, brand/subBrand, category,
 *   price, cost, active, speakerSize/speakerSizes,
 *   serialNumber (optional)
 * }
 */
export async function writeProductsAndUnitsBatch({ tenantId, rows }) {
  if (!tenantId) throw new Error("Missing tenantId");
  if (!Array.isArray(rows) || rows.length === 0) return { productsUpserted: 0, unitsInserted: 0 };

  // 1) Group rows into products
  const groups = new Map(); // key -> { productDraft, serials: [], rows: [] }

  for (const r of rows) {
    if (!r?.name) continue;

    const key = makeProductGroupKey(r);
    const cur = groups.get(key) || { productDraft: null, serials: [], rows: [] };

    // take the first row as the base product draft
    if (!cur.productDraft) cur.productDraft = r;

    // collect serials if present
    const sn = cleanSerial(r.serialNumber);
    if (sn) cur.serials.push(sn);

    cur.rows.push(r);
    groups.set(key, cur);
  }

  const groupList = [...groups.values()];
  if (groupList.length === 0) return { productsUpserted: 0, unitsInserted: 0 };

  // 2) Create productIds for each group (pretty IDs)
  // NOTE: This is per-product transaction because your counter is per brandCode.
  // For typical imports this is fine.
  for (const g of groupList) {
    const brand = g.productDraft?.subBrand || g.productDraft?.brand || "Unknown";
    g.productId = await getNextProductIdForBrand(db, tenantId, brand);
  }

  // 3) Write products + units in batches
  // We'll do ~250 groups per commit to stay far under 500 ops.
  // Each group can create 1 product + N units. If a group has tons of units, it spills into multiple commits automatically.
  let productsUpserted = 0;
  let unitsInserted = 0;

  // Flatten ops so we can chunk safely
  const ops = [];

  for (const g of groupList) {
    const p = g.productDraft || {};
    const productId = g.productId;

    // Product doc
    ops.push({
      type: "product",
      ref: doc(collection(db, "products"), productId),
      data: {
        ...p,
        tenantId,
        productId,
        active: p.active !== false, // default true
        serialized: g.serials.length > 0,
        // Stock should reflect serial count if serialized; otherwise keep stock if provided.
        stock: g.serials.length > 0 ? g.serials.length : Number(p.stock || 0),
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        importMeta: {
          ...(p.importMeta || {}),
          source: "csv",
          mode: "products+units",
        },
      },
    });
    productsUpserted++;

    // Unit docs (one per serial)
    for (const serial of g.serials) {
      const unitId = unitDocId(tenantId, productId, serial);

      ops.push({
        type: "unit",
        ref: doc(collection(db, "inventoryUnits"), unitId),
        data: {
          tenantId,
          productId,
          sku: p.sku || "",
          name: p.name || "",
          brand: p.subBrand || p.brand || "",
          serialNumber: serial,
          barcode: p.barcode || "",
          status: "in_stock",
          receivedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          importMeta: { source: "csv" },
        },
      });
      unitsInserted++;
    }
  }

  // 4) Commit in chunks (<= 450 ops per batch)
  const opGroups = chunkArray(ops, 450);

  for (const og of opGroups) {
    const batch = writeBatch(db);
    for (const op of og) {
      batch.set(op.ref, op.data, { merge: true });
    }
    await batch.commit();
  }

  return { productsUpserted, unitsInserted };
}