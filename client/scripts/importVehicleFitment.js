import fs from "fs";
import path from "path";
import csv from "csv-parser";
import admin from "firebase-admin";

/* ================= FIREBASE ADMIN ================= */

const serviceAccountPath = path.resolve("./client/serviceAccountKey.json");
const serviceAccount = JSON.parse(
  fs.readFileSync(serviceAccountPath, "utf8")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const COLLECTION = "vehicleSpeakerFitment";

/* ================= HEADER NORMALIZATION ================= */

function norm(k) {
  return k.toLowerCase().replace(/\s+/g, " ").trim();
}

function get(row, key) {
  const target = norm(key);
  const found = Object.keys(row).find((k) => norm(k) === target);
  return found ? row[found] : null;
}

/* ================= SIZE PARSING ================= */

// Converts "6 1/2" → 6.5, "3/4" → 0.75
function fractionToDecimal(str) {
  if (!str.includes("/")) return null;
  const [a, b] = str.split("/").map(Number);
  if (!a || !b) return null;
  return a / b;
}

function parseSingleSize(raw) {
  if (!raw) return null;
  let s = raw.toString().toLowerCase().trim();

  // 6x9, 5x7
  if (s.includes("x")) return s.replace(/\s+/g, "");

  // 6 1/2
  if (s.match(/^\d+\s+\d+\/\d+$/)) {
    const [whole, frac] = s.split(" ");
    const f = fractionToDecimal(frac);
    return f ? Number(whole) + f : null;
  }

  // 3/4
  if (s.includes("/")) {
    const f = fractionToDecimal(s);
    if (f) return f;
  }

  // normal number
  const n = Number(s);
  if (!isNaN(n)) return n;

  return null;
}

// "6 1/2 & 3" → [6.5, 3]
function parseSizes(raw) {
  if (!raw) return [];
  return raw
    .toString()
    .split("&")
    .map((s) => parseSingleSize(s))
    .filter((v) => v !== null);
}

/* ================= LOCATION BUILDERS ================= */

// FRONT locations
function buildFrontLocation(row, idx) {
  const role = get(row, `Loc${idx} Role`);
  if (!role) return null;

  const sizes = [
    ...parseSizes(get(row, `Loc${idx} Size A`)),
    ...parseSizes(get(row, `Loc${idx} Size B`)),
  ];

  if (!sizes.length) return null;

  return {
    role: role.trim(),
    sizes: [...new Set(sizes)],
  };
}

// 🔥 REAR locations (NEW)
function buildRearLocation(row, idx) {
  const role = get(row, `Rear Loc${idx} Role`);
  if (!role) return null;

  const sizes = [
    ...parseSizes(get(row, `Rear Loc${idx} Size A`)),
    ...parseSizes(get(row, `Rear Loc${idx} Size B`)),
  ];

  if (!sizes.length) return null;

  return {
    role: role.trim(),
    sizes: [...new Set(sizes)],
  };
}

/* ================= MAIN ================= */

async function run() {
  const csvPath = path.resolve(
    "./client/src/data/processed/vehicle_fitment_clean.csv"
  );

  const rows = [];

  fs.createReadStream(csvPath)
    .pipe(csv())
    .on("data", (row) => rows.push(row))
    .on("end", async () => {
      console.log(`📦 Rows loaded: ${rows.length}`);

      let written = 0;

      for (const row of rows) {
        const make = get(row, "MAKE");
        const model = get(row, "MODEL");

        const yearStart = Number(get(row, "Year start"));
        let yearEnd = Number(get(row, "Column2"));
        if (!yearEnd || isNaN(yearEnd)) yearEnd = yearStart;

        if (!make || !model || !yearStart) continue;

        // 🔥 FRONT + REAR combined
        const locations = [
          ...[1, 2, 3].map((i) => buildFrontLocation(row, i)),
          ...[1, 2, 3].map((i) => buildRearLocation(row, i)),
        ].filter(Boolean);

        if (!locations.length) continue;

        const id = `${make}_${model}_${yearStart}_${yearEnd}`
          .toLowerCase()
          .replace(/\s+/g, "_")
          .replace(/[^a-z0-9_-]/g, "");

        await db.collection(COLLECTION).doc(id).set(
          {
            make,
            model,
            yearStart,
            yearEnd,
            locations,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        written++;
      }

      console.log(
        `🎉 Import complete — ${written} documents written to ${COLLECTION}`
      );
      process.exit(0);
    });
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
