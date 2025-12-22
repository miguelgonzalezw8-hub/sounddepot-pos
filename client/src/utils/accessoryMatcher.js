import accessoryMap from "../data/processed/vehicle_accessories.json";

console.log(
  "ACCESSORY MAP LOADED, VEHICLES:",
  Object.keys(accessoryMap).length
);

/* ================= MODEL NORMALIZATION ================= */

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

  return Array.from(variants);
}

/* ================= VEHICLE KEY BUILDER ================= */

function getVehicleKeys(vehicle) {
  const { year, make, model, trim } = vehicle;
  const keys = [];

  const modelVariants = normalizeModelVariants(model);

  modelVariants.forEach((m) => {
    if (trim) keys.push(`${year}|${make}|${m}|${trim}`);
    keys.push(`${year}|${make}|${m}`);
  });

  return keys;
}

/* ================= ACCESSORY MATCHER ================= */

export function matchAccessoriesToVehicle(vehicle, products) {
  if (!vehicle) return [];

  console.log("ACCESSORY MATCH INPUT:", vehicle);

  const keys = getVehicleKeys(vehicle);
  console.log("TRYING ACCESSORY KEYS:", keys);

  let fitment = null;

// 1) Try exact key candidates first
for (const k of keys) {
  if (accessoryMap[k]) {
    fitment = accessoryMap[k];
    break;
  }
}

// 2) If not found, try any-trim match (year|make|model|*)
if (!fitment) {
  const prefix = `${vehicle.year}|${vehicle.make}|${vehicle.model}|`;
  const hitKey = Object.keys(accessoryMap).find((k) => k.startsWith(prefix));
  if (hitKey) fitment = accessoryMap[hitKey];
}

// Still nothing
if (!fitment) return [];


  const allowedSKUs = new Set();

  // Dash kits
  Object.values(fitment.dashKits || {}).forEach((arr) =>
    arr.forEach((sku) => allowedSKUs.add(sku))
  );

  // Harnesses
  Object.values(fitment.harnesses || {}).forEach((amp) =>
    Object.values(amp).forEach((arr) =>
      arr.forEach((sku) => allowedSKUs.add(sku))
    )
  );

  // Antennas
  Object.values(fitment.antennas || {}).forEach((arr) =>
    arr.forEach((sku) => allowedSKUs.add(sku))
  );

  // Maestro
  (fitment.maestro || []).forEach((sku) => allowedSKUs.add(sku));

  const norm = (s) => String(s).trim().toUpperCase();

return products.filter((p) => {
  const sku =
    p.sku ||
    p.partNumber ||
    p.SKU ||
    p.vendorSku ||
    p.mpn ||
    p.name;

  if (!sku) return false;

  const skuNorm = norm(sku);

  return Array.from(allowedSKUs).some((a) => {
    const base = norm(a);
    return skuNorm === base || skuNorm.startsWith(base);
  });
});
}

/* ================= RADIO DIN GATING ================= */

export function getAllowedDinSizes(vehicle) {
  if (!vehicle) return { singleDin: false, doubleDin: false };

  const keys = getVehicleKeys(vehicle);

  for (const k of keys) {
    const f = accessoryMap[k];
    if (!f) continue;

    return {
      singleDin: (f.dashKits?.singleDin || []).length > 0,
      doubleDin: (f.dashKits?.doubleDin || []).length > 0,
    };
  }

  return { singleDin: false, doubleDin: false };
}
