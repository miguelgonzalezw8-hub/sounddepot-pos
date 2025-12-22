// client/src/utils/fitmentEngine.js
import { collection, getDocs, query, where, limit } from "firebase/firestore";
import { db } from "../firebase";

/* ============================================================
   SMALL HELPERS
============================================================ */
const norm = (s) => (s || "").toString().trim().toLowerCase();

function prettyLocation(loc = "") {
  // Normalize your role names into the labels you used on the live UI
  // Example Firestore roles: "Door", "Rear Door", "Center", "A-Pillar Tweeter"
  const l = norm(loc);

  if (l.includes("rear") && l.includes("door")) return "Rear - Door";
  if ((l.includes("front") && l.includes("door")) || l === "door")
    return "Front - Door";
  if (l.includes("center")) return "Front - Center";
  if (l.includes("dash")) return "Front - Dash";
  if (l.includes("pillar")) return "Pillar";
  if (l.includes("deck")) return "Rear - Deck";

  // fallback
  return loc;
}

function normalizeCategory(cat = "") {
  const c = norm(cat);

  if (
    c.includes("speaker") ||
    c.includes("front") ||
    c.includes("rear") ||
    c.includes("tweeter") ||
    c.includes("component") ||
    c.includes("coax")
  )
    return "Speakers";

  if (c.includes("sub") || c.includes("woofer")) return "Subwoofers";
  if (c.includes("amp")) return "Amplifiers";

  if (
    c.includes("dash") ||
    c.includes("kit") ||
    c.includes("harness") ||
    c.includes("adapter") ||
    c.includes("interface") ||
    c.includes("mount") ||
    c.includes("radio")
  )
    return "Install";

  return "Other";
}

function isSpeakerProduct(p) {
  return normalizeCategory(p.category || "") === "Speakers";
}

function productBrand(p) {
  // Your products show brand like "Garmin", "JL Audio", etc.
  return (p.brand || p.subBrand || "").toString().trim();
}

/* ============================================================
   CACHE (keeps UI snappy, prevents repeated full scans)
============================================================ */
let _yearsCache = null;
let _makesByYearCache = new Map(); // year -> makes[]
let _modelsByYearMakeCache = new Map(); // `${year}__${make}` -> models[]
let _productsCache = null; // active products

async function loadAllActiveProducts() {
  if (_productsCache) return _productsCache;

  // Pull active products once and cache.
  // This avoids doing a ton of Firestore queries during filtering.
  const snap = await getDocs(query(collection(db, "products"), where("active", "==", true)));
  _productsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return _productsCache;
}

/* ============================================================
   DROPDOWN OPTIONS (Vehicle selectors)
   NOTE: These do a scan of vehicleSpeakerFitment.
   You can optimize later (precompute collections), but this matches
   your current data model without adding new files.
============================================================ */
export async function getYearOptions() {
  if (_yearsCache) return _yearsCache;

  const snap = await getDocs(collection(db, "vehicleSpeakerFitment"));
  const years = new Set();

  snap.docs.forEach((d) => {
    const arr = d.data().years;
    if (Array.isArray(arr)) arr.forEach((y) => years.add(y));
    else {
      // fallback if years not present, use yearStart/yearEnd
      const ys = Number(d.data().yearStart);
      const ye = Number(d.data().yearEnd);
      if (ys) {
        if (ye && ye >= ys) {
          for (let y = ys; y <= ye; y++) years.add(y);
        } else {
          years.add(ys);
        }
      }
    }
  });

  _yearsCache = Array.from(years).sort((a, b) => b - a);
  return _yearsCache;
}

export async function getMakeOptions(year) {
  if (!year) return [];
  if (_makesByYearCache.has(year)) return _makesByYearCache.get(year);

  const snap = await getDocs(collection(db, "vehicleSpeakerFitment"));
  const makes = new Set();

  snap.docs.forEach((d) => {
    const v = d.data();
    const yrs = Array.isArray(v.years) ? v.years : null;

    const match =
      yrs ? yrs.includes(year) : (year >= Number(v.yearStart) && year <= Number(v.yearEnd));

    if (match && v.make) makes.add(v.make);
  });

  const out = Array.from(makes).sort();
  _makesByYearCache.set(year, out);
  return out;
}

export async function getModelOptions(year, make) {
  if (!year || !make) return [];

  const key = `${year}__${make}`;
  if (_modelsByYearMakeCache.has(key)) return _modelsByYearMakeCache.get(key);

  const snap = await getDocs(collection(db, "vehicleSpeakerFitment"));
  const models = new Set();

  snap.docs.forEach((d) => {
    const v = d.data();
    const yrs = Array.isArray(v.years) ? v.years : null;

    const matchYear =
      yrs ? yrs.includes(year) : (year >= Number(v.yearStart) && year <= Number(v.yearEnd));
    const matchMake = v.make === make;

    if (matchYear && matchMake && v.model) models.add(v.model);
  });

  const out = Array.from(models).sort();
  _modelsByYearMakeCache.set(key, out);
  return out;
}

/* ============================================================
   FIND FITMENT (one vehicle)
============================================================ */
export async function findFitment(year, make, model) {
  if (!year || !make || !model) return null;

  // Query by make + model ONLY
  const q = query(
    collection(db, "vehicleSpeakerFitment"),
    where("make", "==", make),
    where("model", "==", model)
  );

  const snap = await getDocs(q);
  if (snap.empty) return null;

  // Now filter by yearStart / yearEnd in code
  const doc = snap.docs
    .map((d) => d.data())
    .find(
      (v) =>
        Number(year) >= Number(v.yearStart) &&
        Number(year) <= Number(v.yearEnd)
    );

  if (!doc) return null;

  return {
    make: doc.make,
    model: doc.model,
    trim: doc.trim || "",
    body: doc.body || "",
    yearStart: doc.yearStart,
    yearEnd: doc.yearEnd,
    locations: Array.isArray(doc.locations) ? doc.locations : [],
    raw: doc,
  };
}


/* ============================================================
   BUILD UI-FRIENDLY FITMENT STATE
   Returns the exact structure VehicleFitment.jsx needs
============================================================ */
export async function resolveFitmentUI(year, make, model) {
  const fitment = await findFitment(year, make, model);
  if (!fitment) return null;

  // Build location list for UI buttons + speaker size display
  const speakersByLocation = {}; // { "Front - Door": ["6x9", 6.5], ... }
  const availableLocations = new Set();

  for (const loc of fitment.locations) {
    const label = prettyLocation(loc.role || "Other");
    const sizes = Array.isArray(loc.sizes) ? loc.sizes : [];
    if (!sizes.length) continue;

    availableLocations.add(label);

    // Ensure dedupe and keep original values (numbers or strings)
    const cur = speakersByLocation[label] || [];
    const merged = [...cur, ...sizes].filter((v) => v !== null && v !== "");
    speakersByLocation[label] = Array.from(new Set(merged.map((v) => `${v}`))).map((v) => v);
  }

  // Recommended products: use active products, filter by category/location/brand later in UI
  const allProducts = await loadAllActiveProducts();

  // Compute "recommended" list:
  // - Speakers: if product.speakerSizes or product.speakerSize matches any speaker size
  // - Install (radios/parts): for now we show install category products (you can refine later to Maestro codes)
  const neededSpeakerSizes = new Set();
  Object.values(speakersByLocation).forEach((arr) => arr.forEach((s) => neededSpeakerSizes.add(`${s}`)));

  const recommended = [];

  for (const p of allProducts) {
    const cat = normalizeCategory(p.category || "");

    if (cat === "Speakers") {
      const sizes = Array.isArray(p.speakerSizes)
        ? p.speakerSizes.map((x) => `${x}`)
        : p.speakerSize
        ? [`${p.speakerSize}`]
        : [];

      const fits = sizes.some((s) => neededSpeakerSizes.has(`${s}`));
      if (fits) {
        recommended.push({
          ...p,
          categoryNorm: "Speakers",
          // best-effort location hint (if user stored something like "Rear - Door" later)
          locationHint: p.location || p.fitmentLocation || "",
          matchedSizes: sizes.filter((s) => neededSpeakerSizes.has(`${s}`)),
        });
      }
    } else if (cat === "Install") {
      // show install/radio parts as recommended
      recommended.push({ ...p, categoryNorm: "Install" });
    } else if (cat === "Subwoofers") {
      // keep subwoofers visible when Sub category selected
      recommended.push({ ...p, categoryNorm: "Subwoofers" });
    } else if (cat === "Amplifiers") {
      recommended.push({ ...p, categoryNorm: "Amplifiers" });
    } else {
      recommended.push({ ...p, categoryNorm: "Other" });
    }
  }

  // Brands list from recommended items
  const availableBrands = Array.from(
    new Set(recommended.map((p) => productBrand(p)).filter(Boolean))
  ).sort();

  return {
    fitment,
    speakersByLocation,
    availableLocations: Array.from(availableLocations),
    availableBrands,
    recommended,
  };
}

/* ============================================================
   FILTERING + SORTING for UI
============================================================ */
export function filterRecommended({
  recommended,
  category = "All",
  location = "All Locations",
  brand = "All Brands",
  sort = "Recommended",
  speakersByLocation = {},
}) {
  if (!Array.isArray(recommended)) return [];

  let out = [...recommended];

  // Category filter
  if (category !== "All") {
    out = out.filter((p) => normalizeCategory(p.category || "") === category);
  }

  // If category is Radios/Install in UI, we treat it as "Install"
  // (UI buttons call it Install, so this should already match)

  // Location filter applies only to Speakers (like your live app)
  if (location !== "All Locations") {
    out = out.filter((p) => {
      if (!isSpeakerProduct(p)) return false;

      // If later you store per-product fitment location, we will use it
      const hint = norm(p.location || p.fitmentLocation || "");
      if (hint) return norm(location).includes(hint) || hint.includes(norm(location));

      // Otherwise approximate by size match with that location's speaker sizes
      const locSizes = new Set((speakersByLocation[location] || []).map((x) => `${x}`));
      const sizes = Array.isArray(p.speakerSizes)
        ? p.speakerSizes.map((x) => `${x}`)
        : p.speakerSize
        ? [`${p.speakerSize}`]
        : [];

      return sizes.some((s) => locSizes.has(`${s}`));
    });
  }

  // Brand filter
  if (brand !== "All Brands") {
    out = out.filter((p) => productBrand(p) === brand);
  }

  // Sort
  if (sort === "Price (Low)") {
    out.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
  } else if (sort === "Price (High)") {
    out.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
  } else if (sort === "Name") {
    out.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  } else {
    // Recommended: keep original order
  }

  return out;
}
