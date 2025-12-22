// src/data/vehicleFitment.js
import { db } from "../firebase";
import { collection, getDocs } from "firebase/firestore";

/* ================================
   VEHICLE FITMENT DATA
   ================================ */
export const vehicleFitment = [
  {
    yearStart: 2015,
    yearEnd: 2020,
    make: "Dodge",
    model: "Charger",
    trim: "All",
    body: "Sedan",
    radio: {
      dashKit: "95-6511",
      harness: "70-6520",
      antennaAdapter: "40-CR10",
      ampBypass: null,
    },
    speakers: {
      front: [
        { location: "Front Door", size: '6.5"', adapter: "82-4201", harness: null },
      ],
      rear: [
        { location: "Rear Deck", size: '6x9"', adapter: null, harness: null },
      ],
      other: [],
    },
  },
  {
    yearStart: 2018,
    yearEnd: 2022,
    make: "Honda",
    model: "Civic",
    trim: "EX",
    body: "Sedan",
    radio: {
      dashKit: "95-7810",
      harness: "70-1729",
      antennaAdapter: "40-HD11",
      ampBypass: null,
    },
    speakers: {
      front: [
        { location: "Front Door", size: '6.5"', adapter: null, harness: null },
        { location: "Dash", size: '3.5"', adapter: null, harness: null },
      ],
      rear: [
        { location: "Rear Deck", size: '6x9"', adapter: null, harness: null },
      ],
      other: [],
    },
  },
];

/* ================================
   BASIC SELECTOR HELPERS
   ================================ */
export function getYearOptions() {
  const years = new Set();
  vehicleFitment.forEach((v) => {
    for (let y = v.yearStart; y <= v.yearEnd; y++) {
      years.add(y);
    }
  });
  return Array.from(years).sort((a, b) => b - a);
}

export function getMakeOptions(year) {
  if (!year) return [];
  return [
    ...new Set(
      vehicleFitment
        .filter((v) => year >= v.yearStart && year <= v.yearEnd)
        .map((v) => v.make)
    ),
  ];
}

export function getModelOptions(year, make) {
  if (!year || !make) return [];
  return [
    ...new Set(
      vehicleFitment
        .filter(
          (v) =>
            year >= v.yearStart &&
            year <= v.yearEnd &&
            v.make === make
        )
        .map((v) => v.model)
    ),
  ];
}

export function findFitment(year, make, model) {
  if (!year || !make || !model) return null;

  return (
    vehicleFitment.find(
      (v) =>
        year >= v.yearStart &&
        year <= v.yearEnd &&
        v.make === make &&
        v.model === model
    ) || null
  );
}

/* ================================
   ✅ CORE MATCHING LOGIC
   ================================ */

// 1️⃣ Pull every possible part number out of the vehicle
function extractVehiclePartNumbers(fitment) {
  const parts = new Set();

  // RADIO PARTS
  Object.values(fitment.radio || {}).forEach((val) => {
    if (val) parts.add(val);
  });

  // SPEAKER PARTS
  ["front", "rear", "other"].forEach((pos) => {
    (fitment.speakers?.[pos] || []).forEach((s) => {
      if (s.adapter) parts.add(s.adapter);
      if (s.harness) parts.add(s.harness);
    });
  });

  return Array.from(parts);
}

// 2️⃣ MATCH INVENTORY AGAINST VEHICLE PART NUMBERS
export async function getRecommendedProducts(fitment) {
  if (!fitment) return [];

  const vehicleParts = extractVehiclePartNumbers(fitment);
  if (vehicleParts.length === 0) return [];

  // 🔥 Get Firebase inventory
  const snap = await getDocs(collection(db, "inventory"));
  const inventory = snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));

  // ✅ Match by SKU / part number
  return inventory.filter((item) =>
    item.sku && vehicleParts.includes(item.sku)
  );
}
