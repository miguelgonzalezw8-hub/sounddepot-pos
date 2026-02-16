// client/src/utils/accessoryMatcher.js
import accessoryMap from "../data/processed/vehicle_accessories.json";
import scosche from "../data/processed/vehicle_accessories_scosche.json";

console.log("ACCESSORY MAP LOADED, VEHICLES:", Object.keys(accessoryMap).length);
console.log("SCOSCHE MAP LOADED, VEHICLES:", Object.keys(scosche).length);

/* ================= NORMALIZATION ================= */

function titleCase(s) {
  const t = String(s || "").trim().toLowerCase();
  if (!t) return "";
  return t.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

// minimal make aliases (add as you run into them)
function normalizeMake(make) {
  const raw = String(make || "").trim();
  const up = raw.toUpperCase();

  if (up === "CHEVY") return "Chevrolet";
  if (up === "VW") return "Volkswagen";
  if (up === "MERCEDES" || up === "MERCEDES BENZ") return "Mercedes-Benz";
  if (up === "INFINITY") return "Infiniti"; // common typo

  // default: Title Case (matches your Scosche build output)
  return titleCase(raw);
}

function normalizeModel(model) {
  return titleCase(String(model || "").trim());
}

function normalizeTrim(trim) {
  return titleCase(String(trim || "").trim());
}

/* ================= MODEL VARIANTS ================= */

function normalizeModelVariants(model) {
  const raw = (model || "").trim();
  const variants = new Set();
  if (!raw) return [];

  variants.add(raw);
  variants.add(raw.replace("-", ""));
  variants.add(raw.replace(/\s+/g, ""));
  variants.add(raw.replace("F-150", "F150"));
  variants.add(raw.replace("F150", "F-150"));
  variants.add(raw.replace("F-150", "F-150 Pickup"));

  // also title-case each variant
  return Array.from(variants)
    .flatMap((m) => [m, titleCase(m)])
    .filter(Boolean);
}

/* ================= VEHICLE KEY BUILDER ================= */

function getVehicleKeys(vehicle) {
  const year = Number(vehicle?.year);
  const make = normalizeMake(vehicle?.make);
  const model = String(vehicle?.model || "").trim();
  const trim = vehicle?.trim ? normalizeTrim(vehicle.trim) : "";

  const keys = [];
  const modelVariants = normalizeModelVariants(model).map(normalizeModel);

  for (const m of modelVariants) {
    if (trim) keys.push(`${year}|${make}|${m}|${trim}`);
    keys.push(`${year}|${make}|${m}`);
  }

  return Array.from(new Set(keys));
}

/* ================= FIND + MERGE ================= */

function findFitmentInMap(map, vehicle, keys) {
  // 1) exact keys
  for (const k of keys) {
    if (map[k]) return { key: k, fitment: map[k] };
  }

  // 2) any-trim prefix search (try for each model variant key without trim)
  const mapKeys = Object.keys(map);
  for (const k of keys) {
    const prefix = k + "|"; // year|make|model|
    const hitKey = mapKeys.find((x) => x.startsWith(prefix));
    if (hitKey) return { key: hitKey, fitment: map[hitKey] };
  }

  return null;
}

function pushUnique(arr, v) {
  if (!v) return;
  if (!arr.includes(v)) arr.push(v);
}

function mergeFitment(base, extra) {
  if (!extra) return base;
  if (!base) return extra;

  const out = { ...base };

  // Ensure top-level buckets exist
  out.dashKits = out.dashKits || { singleDin: [], doubleDin: [] };
  out.harnesses = out.harnesses || { amplified: {}, nonAmplified: {} };
  out.antennas = out.antennas || {};
  out.maestro = out.maestro || [];

  // ---- 1) Merge top-level dash kits if present ----
  for (const sku of extra.dashKits?.singleDin || []) pushUnique(out.dashKits.singleDin, sku);
  for (const sku of extra.dashKits?.doubleDin || []) pushUnique(out.dashKits.doubleDin, sku);

  // ---- 2) CRITICAL: Merge Scosche vendor dash kits into top-level dashKits ----
  // (Your scosche JSON often stores kits here: extra.scosche.dashKits.*)
  for (const sku of extra.scosche?.dashKits?.singleDin || []) pushUnique(out.dashKits.singleDin, sku);
  for (const sku of extra.scosche?.dashKits?.doubleDin || []) pushUnique(out.dashKits.doubleDin, sku);

  // Preserve vendor block if present
  if (extra.scosche) out.scosche = extra.scosche;

  return out;
}

/* ================= ACCESSORY MATCHER ================= */

export function matchAccessoriesToVehicle(vehicle, products) {
  if (!vehicle) return [];

  const keys = getVehicleKeys(vehicle);

  const baseHit = findFitmentInMap(accessoryMap, vehicle, keys);
  const scHit = findFitmentInMap(scosche, vehicle, keys);

  const fitment = mergeFitment(baseHit?.fitment || null, scHit?.fitment || null);

  // Debug: proves whether scosche is being found + merged
  console.log("ACCESSORY MATCH INPUT:", vehicle);
  console.log("TRYING ACCESSORY KEYS:", keys);
  console.log("BASE HIT:", baseHit?.key || null);
  console.log("SCOSCHE HIT:", scHit?.key || null);
  console.log(
    "MERGED DASHKITS:",
    fitment?.dashKits ? { single: fitment.dashKits.singleDin.length, double: fitment.dashKits.doubleDin.length } : null
  );

  if (!fitment) return [];

  const allowedSKUs = new Set();

  // Dash kits
  Object.values(fitment.dashKits || {}).forEach((arr) =>
    (arr || []).forEach((sku) => allowedSKUs.add(sku))
  );

  // Harnesses
  Object.values(fitment.harnesses || {}).forEach((amp) =>
    Object.values(amp || {}).forEach((arr) =>
      (arr || []).forEach((sku) => allowedSKUs.add(sku))
    )
  );

  // Antennas
  Object.values(fitment.antennas || {}).forEach((arr) =>
    (arr || []).forEach((sku) => allowedSKUs.add(sku))
  );

  // Maestro
  (fitment.maestro || []).forEach((sku) => allowedSKUs.add(sku));

  const norm = (s) => String(s).trim().toUpperCase();

  return (products || []).filter((p) => {
    const sku =
      p.sku ||
      p.partNumber ||
      p.SKU ||
      p.vendorSku ||
      p.mpn ||
      p.name;

    if (!sku) return false;

    const skuNorm = norm(sku);

    for (const a of allowedSKUs) {
      const base = norm(a);
      if (skuNorm === base || skuNorm.startsWith(base)) return true;
    }
    return false;
  });
}

/* ================= RADIO DIN GATING ================= */

export function getAllowedDinSizes(vehicle) {
  if (!vehicle) return { singleDin: false, doubleDin: false };

  const keys = getVehicleKeys(vehicle);

  const baseHit = findFitmentInMap(accessoryMap, vehicle, keys);
  const scHit = findFitmentInMap(scosche, vehicle, keys);

  const f = mergeFitment(baseHit?.fitment || null, scHit?.fitment || null);

  return {
    singleDin: (f?.dashKits?.singleDin || []).length > 0,
    doubleDin: (f?.dashKits?.doubleDin || []).length > 0,
  };
}
