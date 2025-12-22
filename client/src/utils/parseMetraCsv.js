// ===============================================
//  FITMENT ENGINE
//  - Loads normalized fitment data from JSON
//  - Provides Year / Make / Model lookup
//  - Provides recommended products for VehicleFitment
// ===============================================

import fitmentData from "../data/fitment.json";
const productCatalog = [];
// ------------------------------
// Category Normalization
// ------------------------------
function normalizeCategory(cat = "") {
  const c = cat.toLowerCase();

  if (c.includes("speaker") || c.includes("front") || c.includes("rear") || c.includes("tweeter") || c.includes("coax"))
    return "Speakers";

  if (c.includes("sub") || c.includes("woofer"))
    return "Subwoofers";

  if (c.includes("amp"))
    return "Amplifiers";

  if (c.includes("dash") || c.includes("kit") || c.includes("harness") || c.includes("adapter") || c.includes("interface"))
    return "Install";

  return "Other";
}

// ===============================================
//  BUILD LOOKUP INDEX
// ===============================================

const index = {}; // year → make → model → [entries]

function buildIndex() {
  for (const v of fitmentData) {
    for (let y = v.yearStart; y <= v.yearEnd; y++) {
      if (!index[y]) index[y] = {};
      if (!index[y][v.make]) index[y][v.make] = {};
      if (!index[y][v.make][v.model]) index[y][v.make][v.model] = [];
      index[y][v.make][v.model].push(v);
    }
  }
}

buildIndex();

// ===============================================
//  PUBLIC API FUNCTIONS
// ===============================================

// -----------------------------------------------
// getYearOptions()
// -----------------------------------------------
export function getYearOptions() {
  return Object.keys(index)
    .map((y) => Number(y))
    .sort((a, b) => b - a);
}

// -----------------------------------------------
// getMakeOptions(year)
// -----------------------------------------------
export function getMakeOptions(year) {
  if (!year || !index[year]) return [];
  return Object.keys(index[year]).sort();
}

// -----------------------------------------------
// getModelOptions(year, make)
// -----------------------------------------------
export function getModelOptions(year, make) {
  if (!year || !make || !index[year] || !index[year][make]) return [];
  return Object.keys(index[year][make]).sort();
}

// -----------------------------------------------
// findFitment(year, make, model)
// returns FIRST matching fitment row
// -----------------------------------------------
export function findFitment(year, make, model) {
  if (!year || !make || !model) return null;

  const results =
    index[year] &&
    index[year][make] &&
    index[year][make][model]
      ? index[year][make][model]
      : null;

  if (!results || results.length === 0) return null;

  // Most vehicles only have 1 entry per trim,  
  // but if multiple exist, return the first.
  return results[0];
}

// ===============================================
//  PRODUCT RECOMMENDATION ENGINE
// ===============================================

// Match by category, speaker size, or SKU
function matchProduct(fItem) {
  const possible = [];

  for (const p of productCatalog) {
    const cat = normalizeCategory(p.category);

    const fitsCategory =
      cat === "Speakers" && normalizeCategory(fItem.location) === "Speakers";

    const fitsSize =
      fItem.size &&
      p.size &&
      fItem.size.replace(/[^0-9x]/gi, "") === p.size.replace(/[^0-9x]/gi, "");

    const harnessMatch =
      fItem.harness && p.sku && p.sku.toLowerCase() === fItem.harness.toLowerCase();

    const adapterMatch =
      fItem.adapter && p.sku && p.sku.toLowerCase() === fItem.adapter.toLowerCase();

    const premiumMatch =
      fItem.premium && p.sku && p.sku.toLowerCase() === fItem.premium.toLowerCase();

    if (fitsCategory || fitsSize || harnessMatch || adapterMatch || premiumMatch) {
      possible.push(p);
    }
  }

  return possible;
}

// -----------------------------------------------
// getRecommendedProducts(fitment)
// -----------------------------------------------
export function getRecommendedProducts(fitment) {
  if (!fitment) return [];

  const result = [];

  // SPEAKER LOCATIONS
  for (const f of fitment.speakers) {
    const matches = matchProduct(f);
    result.push(...matches);
  }

  // RADIO PARTS (dash kit, harness, antenna adapter)
  if (fitment.radio) {
    for (const p of productCatalog) {
      // Match dash kit
      if (fitment.radio.dashKit && p.sku.toLowerCase() === fitment.radio.dashKit.toLowerCase()) {
        result.push(p);
      }

      // Match radio harness
      if (fitment.radio.harness && p.sku.toLowerCase() === fitment.radio.harness.toLowerCase()) {
        result.push(p);
      }

      // Match antenna adapter
      if (fitment.radio.antennaAdapter && p.sku.toLowerCase() === fitment.radio.antennaAdapter.toLowerCase()) {
        result.push(p);
      }
    }
  }

  // Remove duplicates by product ID
  const seen = new Set();
  const unique = [];
  for (const p of result) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      unique.push(p);
    }
  }

  return unique;
}