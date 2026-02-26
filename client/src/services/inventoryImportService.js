// client/src/services/inventoryImportService.js
import { db } from "../firebase";
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  serverTimestamp,
  writeBatch,
  increment,
} from "firebase/firestore";

function cleanStr(v) {
  return String(v || "").trim();
}
function normKey(v) {
  return cleanStr(v).toLowerCase();
}
function toInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Strict identity key:
 * Prefer barcode, else sku, else brand+name.
 * This key is ONLY for de-duping inside this import run.
 */
function identityKey(row) {
  const barcode = normKey(row.barcode);
  const sku = normKey(row.sku);
  const brand = normKey(row.subBrand || row.brand);
  const name = normKey(row.name);

  if (barcode) return `barcode:${barcode}`;
  if (sku) return `sku:${sku}`;
  return `bn:${brand}|${name}`;
}

/**
 * Preload existing products so we don't query per row.
 * We only match existing products by barcode or sku.
 */
async function preloadExistingProducts({ tenantId, rows }) {
  const barcodeSet = new Set();
  const skuSet = new Set();

  for (const r of rows) {
    const b = cleanStr(r.barcode);
    const s = cleanStr(r.sku);
    if (b) barcodeSet.add(b);
    if (s) skuSet.add(s);
  }

  const barcodeList = Array.from(barcodeSet);
  const skuList = Array.from(skuSet);

  const byBarcode = new Map(); // barcode -> productId
  const bySku = new Map(); // sku -> productId

  // Firestore "in" supports up to 30 values
  for (const part of chunk(barcodeList, 30)) {
    const q1 = query(
      collection(db, "products"),
      where("tenantId", "==", tenantId),
      where("barcode", "in", part)
    );
    // eslint-disable-next-line no-await-in-loop
    const snap = await getDocs(q1);
    for (const d of snap.docs) {
      const data = d.data();
      const b = cleanStr(data.barcode);
      if (b) byBarcode.set(b, d.id);
    }
  }

  for (const part of chunk(skuList, 30)) {
    const q2 = query(
      collection(db, "products"),
      where("tenantId", "==", tenantId),
      where("sku", "in", part)
    );
    // eslint-disable-next-line no-await-in-loop
    const snap = await getDocs(q2);
    for (const d of snap.docs) {
      const data = d.data();
      const s = cleanStr(data.sku);
      if (s) bySku.set(s, d.id);
    }
  }

  return { byBarcode, bySku };
}

export async function writeProductsAndUnitsBatch({ tenantId, rows }) {
  if (!tenantId) throw new Error("writeProductsAndUnitsBatch: missing tenantId");
  if (!Array.isArray(rows) || rows.length === 0) {
    return { productsUpserted: 0, unitsInserted: 0 };
  }

  // Filter out rows with no name at all (avoid junk)
  const cleaned = rows.filter((r) => cleanStr(r?.name));

  const { byBarcode, bySku } = await preloadExistingProducts({ tenantId, rows: cleaned });

  // Cache of identityKey -> productRef (so we create only one master per item per import)
  const masterRefByKey = new Map();

  // Accumulate non-serialized qty per master productRef.id
  const stockAddsByProductId = new Map();

  let productsUpserted = 0;
  let unitsInserted = 0;

  // We'll batch writes in chunks to stay under limits
  let batch = writeBatch(db);
  let ops = 0;

  const flush = async () => {
    if (ops === 0) return;
    await batch.commit();
    batch = writeBatch(db);
    ops = 0;
  };

  for (const r of cleaned) {
    const barcode = cleanStr(r.barcode);
    const sku = cleanStr(r.sku);
    const serial = cleanStr(r.serialNumber);

    const key = identityKey(r);

    // Resolve or create master product ref
    let productRef = masterRefByKey.get(key);

    if (!productRef) {
      // Try existing first (STRICT: barcode, then sku)
      let existingId = null;
      if (barcode && byBarcode.has(barcode)) existingId = byBarcode.get(barcode);
      else if (sku && bySku.has(sku)) existingId = bySku.get(sku);

      productRef = existingId ? doc(db, "products", existingId) : doc(collection(db, "products"));
      masterRefByKey.set(key, productRef);

      const rawBrand = cleanStr(r.brand);
      const subBrand = cleanStr(r.subBrand || r.brand);

      const master = {
        tenantId,
        active: true,

        name: cleanStr(r.name),
        description: cleanStr(r.description),

        sku,
        barcode,

        brand: rawBrand,
        subBrand: subBrand || rawBrand,

        category: cleanStr(r.category),

        price: Number(r.price) || 0,
        cost: Number(r.cost) || 0,

        speakerSize: r.speakerSize || null,
        speakerSizes: Array.isArray(r.speakerSizes) ? r.speakerSizes : [],

        // This can be toggled later, but helpful:
        trackSerials: !!serial,
        requiresSerial: !!serial,
        serialized: !!serial,

        importMeta: r.importMeta || { source: "csv" },

        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      };

      batch.set(productRef, master, { merge: true });
      productsUpserted += 1;
      ops += 1;
      if (ops > 450) await flush();
    }

    // SERIALIZED ROW -> create ONE unit tied to THIS productRef
    if (serial) {
      const unitRef = doc(collection(db, "productUnits"));

      batch.set(unitRef, {
        tenantId,
        productId: productRef.id,
        productName: cleanStr(r.name) || "",
        sku: sku || "",
        status: "in_stock",
        receivedAt: serverTimestamp(),
        notes: "Imported from CSV",
        cost: Number.isFinite(Number(r.cost)) ? Number(r.cost) : null,
        createdAt: serverTimestamp(),
        serial,
        hasSerial: true,
      });

      unitsInserted += 1;
      ops += 1;

      // Also bump stock by 1 for serialized, so master stock matches count
      stockAddsByProductId.set(productRef.id, (stockAddsByProductId.get(productRef.id) || 0) + 1);

      if (ops > 450) await flush();
      continue;
    }

    // NON-SERIALIZED ROW -> NO units, only stock adjustment using stock field
    const qty = toInt(r.stock);
    if (qty > 0) {
      stockAddsByProductId.set(productRef.id, (stockAddsByProductId.get(productRef.id) || 0) + qty);
    }
  }

  // Apply stock increments (one write per product)
  for (const [productId, add] of stockAddsByProductId.entries()) {
    if (!add) continue;
    batch.set(
      doc(db, "products", productId),
      { stock: increment(add), updatedAt: serverTimestamp() },
      { merge: true }
    );
    ops += 1;
    if (ops > 450) await flush();
  }

  await flush();
  return { productsUpserted, unitsInserted };
}