// scripts/buildFitment.js
// ===============================================
// Build fitment.json from Metra CSVs
// - Sheet 2: Speaker locations / sizes / harness / adapter
// - Sheet 1: Radio dash kits / harness / antenna adapter
// ===============================================

import fs from "fs";
import path from "path";
import Papa from "papaparse";

// ---- CSV LOCATIONS (MATCH YOUR PROJECT) ----
const METRA_DIR = path.join("src", "data", "metra");

const SHEET2_FILE = path.join(
  METRA_DIR,
  "Metra_Vehicle_Application_Guide sheet 2.csv"
);
const SHEET1_FILE = path.join(
  METRA_DIR,
  "Metra_Vehicle_Application_Guide sheet 1.csv"
);

const OUTPUT_FILE = path.join("src", "data", "fitment.json");

// ---- Helpers ----
const normalize = (s) => (s || "").toString().trim().toLowerCase();

function loadCsvRows(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ CSV not found: ${filePath}`);
    process.exit(1);
  }

  const csvText = fs.readFileSync(filePath, "utf8");

  const { data, errors } = Papa.parse(csvText, {
    header: false,
    dynamicTyping: false,
    skipEmptyLines: false,

    // 🔥 ABSOLUTELY REQUIRED FOR METRA FILES
    delimiter: "",         // auto-detect
    error: () => {},       // ignore parse errors
    transform: (value) => value.trim(),

    // 🔥 Disable field mismatch enforcement:
    transformHeader: undefined,
  });

  // We still show error count, but only as info
  if (errors.length > 0) {
    console.log(`⚠️ CSV warnings in ${filePath}: (${errors.length} issues, safe to ignore)`);
  }

  // 🔥 Trim trailing empty columns Excel adds
  return data.map((row) => {
    while (row.length && row[row.length - 1] === "") {
      row.pop();
    }
    return row;
  });
}

function buildSpeaker(location, size, harness, adapter) {
  const loc = (location || "").trim();
  const sz = (size || "").trim();
  const har = (harness || "").trim();
  const ad = (adapter || "").trim();

  if (!loc && !sz && !har && !ad) return null;

  return {
    location: loc,
    size: sz,
    harness: har,
    adapter: ad,
  };
}

// ===============================================
// SHEET 2: Speakers + Year / Body / Trim
// ===============================================
//
// Sheet 2 mapping (0-based index by column):
//
//  0: A - MAKE
//  1: B - MODEL
//  2: C - TRIM/QUALIFIER
//  3: D - BODY STYLE
//  4: E - Start Year (no label)
//  5: F - End Year (no label)
//  6: G - (empty)
//
//  7: H - FRONT Location 1
//  8: I - FRONT Size 1
//  9: J - FRONT Speaker harness 1
// 10: K - FRONT Speaker adapter 1
// 11: L - empty
// 12: M - FRONT Premium kit (ignored here)
// 13: N - empty
//
// 14: O - FRONT Location 2
// 15: P - FRONT Size 2
// 16: Q - FRONT Harness 2
// 17: R - FRONT Adapter 2
// 18: S - empty
//
// 19: T - FRONT Location 3
// 20: U - FRONT Size 3
// 21: V - FRONT Harness 3
// 22: W - FRONT Adapter 3
// 23: X - empty
//
// 24: Y  - REAR Location 1
// 25: Z  - REAR Size 1
// 26: AA - REAR Harness 1
// 27: AB - REAR Adapter 1
// 28: AC - empty
// 29: AD - REAR Premium kit (ignored)
// 30: AE - empty
//
// 31: AF - REAR Location 2
// 32: AG - REAR Size 2
// 33: AH - REAR Harness 2
// 34: AI - REAR Adapter 2
// 35: AJ - empty
//
// 36: AK - REAR Location 3
// 37: AL - REAR Size 3
// 38: AM - REAR Harness 3
// 39: AN - REAR Adapter 3
// 40: AO - empty
// 41: AP - empty
//
// First TWO rows are header rows; data starts at row index 2.
//

function parseSheet2Speakers() {
  const rows = loadCsvRows(SHEET2_FILE);

  if (!rows || rows.length < 3) {
    console.warn("⚠️ Sheet2 has too few rows.");
    return [];
  }

  const out = [];

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const make = (row[0] || "").trim();
    const model = (row[1] || "").trim();
    const trim = (row[2] || "").trim();
    const bodyStyle = (row[3] || "").trim();

    const yearStart = parseInt(row[4]) || 0;
    const yearEnd = parseInt(row[5]) || yearStart || 0;

    if (!make || !model || !yearStart) {
      // invalid / placeholder row
      continue;
    }

    // FRONT groups
    const front = [];
    const f1 = buildSpeaker(row[7], row[8], row[9], row[10]);
    const f2 = buildSpeaker(row[14], row[15], row[16], row[17]);
    const f3 = buildSpeaker(row[19], row[20], row[21], row[22]);
    if (f1) front.push(f1);
    if (f2) front.push(f2);
    if (f3) front.push(f3);

    // REAR groups
    const rear = [];
    const r1 = buildSpeaker(row[24], row[25], row[26], row[27]);
    const r2 = buildSpeaker(row[31], row[32], row[33], row[34]);
    const r3 = buildSpeaker(row[36], row[37], row[38], row[39]);
    if (r1) rear.push(r1);
    if (r2) rear.push(r2);
    if (r3) rear.push(r3);

    const speakers = {
      front,
      rear,
      other: [], // "OTHER" group currently unused / not mapped
    };

    out.push({
      make,
      model,
      trim,
      bodyStyle,
      yearStart,
      yearEnd,
      speakers,
    });
  }

  return out;
}

// ===============================================
// SHEET 1: Radio / Dash Kit / Harness / Antenna
// ===============================================
//
// Sheet1 layout (we treat it as header:false):
// - First 4 rows are header/meta rows
// - Row 4 (index 4) has actual column titles:
//   A: MAKE
//   B: MODEL
//   C: TRIM/QUALIFIER
//   D: NAV
//   E: StartYear (blank header, numeric)
//   F: EndYear (blank header, numeric)
//   G: (unused)
//   H: SINGLE DIN dash kit
//   I: (unused or variant)
//   J: (unused or variant)
//   K: DOUBLE DIN dash kit
//   L: (unused)
//   M: INTO CAR (standard)
//   N: INTO RADIO (standard)
//   O: INTO CAR (amplified)
//   P: INTO RADIO (amplified)
//   Q: BYPASS
//   R: ANTENNA ADAPTER
//   S: OE RADIO → AFTERMARKET ANTENNA
//   T: RF MOD COMBO
//   U: FIXED
//   V: POWER
//
// Data rows start at index 5
//

function parseSheet1Radio() {
  const rows = loadCsvRows(SHEET1_FILE);
  if (!rows || rows.length < 6) {
    console.warn("⚠️ Sheet1 has too few rows.");
    return new Map();
  }

  const radiosByKey = new Map();

  for (let i = 5; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const make = (row[0] || "").trim();
    const model = (row[1] || "").trim();
    const trim = (row[2] || "").trim();
    const navFlag = (row[3] || "").trim();

    const yearStart = parseInt(row[4]) || 0;
    const yearEnd = parseInt(row[5]) || yearStart || 0;

    if (!make || !model) continue;

    // dash kits
    const singleDin = (row[7] || "").trim();
    const doubleDin = (row[10] || "").trim();
    const dashKit = doubleDin || singleDin || "";

    // harnesses
    const harnessStdIntoCar = (row[12] || "").trim();
    const harnessStdIntoRadio = (row[13] || "").trim();
    const harnessAmpIntoCar = (row[14] || "").trim();
    const harnessAmpIntoRadio = (row[15] || "").trim();
    const harness =
      harnessStdIntoCar ||
      harnessAmpIntoCar ||
      harnessStdIntoRadio ||
      harnessAmpIntoRadio ||
      "";

    // antenna adapter
    const antennaAdapter = ((row[17] || row[18]) || "").trim();

    const radio = {
      dashKit,
      harness,
      antennaAdapter,
      navFlag,
      yearStart,
      yearEnd,
    };

    // primary key: make + model + trim (normalized)
    const key = `${normalize(make)}|${normalize(
      model
    )}|${normalize(trim)}`;

    radiosByKey.set(key, {
      make,
      model,
      trim,
      radio,
    });
  }

  return radiosByKey;
}

// ===============================================
// COMBINE SHEET2 (speakers) + SHEET1 (radio)
// ===============================================

function buildFitment() {
  console.log("\n================ FITMENT BUILD ================\n");

  console.log("🔧 Loading Sheet 2 (speakers)...");
  const speakersList = parseSheet2Speakers();
  console.log(`✔ Sheet2 speaker entries: ${speakersList.length}`);

  console.log("🔧 Loading Sheet 1 (radio)...");
  const radiosByKey = parseSheet1Radio();
  console.log(`✔ Sheet1 radio entries: ${radiosByKey.size}`);

  const fitment = [];

  for (const v of speakersList) {
    const keyExact = `${normalize(v.make)}|${normalize(
      v.model
    )}|${normalize(v.trim)}`;
    const keyNoTrim = `${normalize(v.make)}|${normalize(v.model)}|`;

    let radioData = radiosByKey.get(keyExact);
    if (!radioData) {
      // fallback: match without trim
      radioData = radiosByKey.get(keyNoTrim);
    }

    fitment.push({
      make: v.make,
      model: v.model,
      trim: v.trim,
      bodyStyle: v.bodyStyle,
      yearStart: v.yearStart,
      yearEnd: v.yearEnd,
      speakers: v.speakers,
      radio: radioData ? radioData.radio : null,
    });
  }

  // Optional: de-dupe by make+model+trim+year range
  const unique = [];
  const seen = new Set();

  for (const f of fitment) {
    const key = `${normalize(f.make)}|${normalize(
      f.model
    )}|${normalize(f.trim)}|${f.yearStart}|${f.yearEnd}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(f);
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(unique, null, 2));

  console.log("\n🎉 FITMENT BUILD COMPLETE!");
  console.log(`📄 Output written to: ${OUTPUT_FILE}`);
  console.log(`📦 Total records: ${unique.length}\n`);
}

// Run
buildFitment();
