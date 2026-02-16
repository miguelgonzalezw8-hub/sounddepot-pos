import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const METRA_FILE = path.join(
  __dirname,
  "..",
  "src",
  "data",
  "metra",
  "Metra_Vehicle_Application_Guide sheet 1.csv"
);

const OUTPUT = path.join(
  __dirname,
  "..",
  "src",
  "data",
  "processed",
  "vehicle_accessories.json"
);

function clean(v) {
  return String(v ?? "").trim();
}

function vehicleKey(year, make, model, trim) {
  return trim ? `${year}|${make}|${model}|${trim}` : `${year}|${make}|${model}`;
}

function ensure(map, key) {
  if (!map[key]) {
    map[key] = {
      dashKits: { singleDin: [], doubleDin: [] },
      harnesses: { amplified: {}, nonAmplified: {} },
      antennas: {},
      maestro: [], // reserved for later merge
    };
  }
}

function pushUnique(arr, v) {
  const s = clean(v);
  if (!s) return;
  const u = s.toUpperCase();
  if (u === "N/A" || u === "-" || u === "N/R") return;
  if (!arr.includes(s)) arr.push(s);
}

/**
 * Robust CSV parser for one line:
 * - handles quoted commas
 * - handles escaped quotes ("")
 */
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;

  const s = String(line ?? "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (ch === '"') {
      // double quote inside quoted string => literal quote
      if (inQuotes && s[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }
  out.push(cur);
  return out;
}

function padTo(arr, n) {
  while (arr.length < n) arr.push("");
  return arr;
}

// Shift section row (row1) so that TURBO KITS lines up above SINGLE DIN
function alignSectionRow(sectionRow, roleRow) {
  const kitsIdx = sectionRow.findIndex((x) => clean(x) === "TURBO KITS");
  const singleIdx = roleRow.findIndex((x) =>
    clean(x).toUpperCase().includes("SINGLE DIN")
  );

  if (kitsIdx === -1 || singleIdx === -1) return sectionRow; // can't align safely

  const offset = singleIdx - kitsIdx;
  if (offset <= 0) return sectionRow;

  return Array(offset).fill("").concat(sectionRow);
}

// Forward fill merged-header rows (but don't fill leading empties before first real value)
function forwardFill(row) {
  let last = "";
  return row.map((cell) => {
    const c = clean(cell);
    if (c) {
      last = c;
      return c;
    }
    return last ? last : "";
  });
}

const lines = fs.readFileSync(METRA_FILE, "utf8").split(/\r?\n/);

// Header rows
const r1 = parseCsvLine(lines[0] || "");
const r2 = parseCsvLine(lines[1] || "");
const r3 = parseCsvLine(lines[2] || "");

// Determine max columns from early scan
let maxCols = Math.max(r1.length, r2.length, r3.length);
for (let i = 3; i < Math.min(lines.length, 200); i++) {
  const cols = parseCsvLine(lines[i]);
  if (cols.length > maxCols) maxCols = cols.length;
}

// Pad header rows
let sectionRow = padTo(r1.slice(), maxCols);
const subsectionRow = padTo(r2.slice(), maxCols);
const roleRow = padTo(r3.slice(), maxCols);

// Align and pad again (alignment may increase length)
sectionRow = alignSectionRow(sectionRow, roleRow);
if (sectionRow.length > maxCols) maxCols = sectionRow.length;

sectionRow = padTo(sectionRow, maxCols);
padTo(subsectionRow, maxCols);
padTo(roleRow, maxCols);

// Forward-fill header context
const sectionFF = forwardFill(sectionRow).map((x) => clean(x));
const subsectionFF = forwardFill(subsectionRow).map((x) => clean(x));

// Build colMap using context carry-forward
const colMap = {};

// DASH KIT columns: TURBO KITS area + current DIN context
let currentDin = null;

for (let idx = 0; idx < maxCols; idx++) {
  const sec = clean(sectionFF[idx]).toUpperCase();
  const sub = clean(subsectionFF[idx]).toUpperCase();
  const role = clean(roleRow[idx]).toUpperCase();

  // Track DIN group across blank role cells
  if (role.includes("SINGLE DIN")) currentDin = "singleDin";
  if (role.includes("DOUBLE DIN")) currentDin = "doubleDin";

  if (sec === "TURBO KITS") {
    if (currentDin) colMap[idx] = { type: "dashKits", sub: currentDin };
  }

  if (sec === "TURBO WIRE") {
    const amp = sub.includes("NON-AMPLIFIED")
      ? "nonAmplified"
      : sub.includes("AMPLIFIED")
      ? "amplified"
      : null;

    if (!amp) continue;

    if (role.includes("INTO CAR"))
      colMap[idx] = { type: "harnesses", amp, role: "intoCar" };
    else if (role.includes("INTO RADIO"))
      colMap[idx] = { type: "harnesses", amp, role: "intoRadio" };
    else if (role.includes("BYPASS"))
      colMap[idx] = { type: "harnesses", amp, role: "bypass" };
  }

  if (sec === "ANTENNAWORKS") {
    if (sub.includes("ANTENNA ADAPTER")) {
      colMap[idx] = {
        type: "antennas",
        sub: "adapter",
        role: clean(roleRow[idx]) || "adapter",
      };
    } else if (sub.includes("ANTENNA")) {
      if (role.includes("POWER")) colMap[idx] = { type: "antennas", sub: "power" };
      else if (role.includes("FIXED")) colMap[idx] = { type: "antennas", sub: "fixed" };
      else colMap[idx] = { type: "antennas", sub: "antenna" };
    }
  }
}

// Parse data rows
const out = {};

let lastMake = "";
let processedRows = 0;
let skippedBrandRows = 0;
let expandedVehicleKeys = 0;

for (let li = 3; li < lines.length; li++) {
  if (!lines[li] || !clean(lines[li])) continue;

  const row = padTo(parseCsvLine(lines[li]), maxCols);

  // Forward-fill MAKE across continuation rows
  let make = clean(row[0]);
  const modelRaw = clean(row[1]);
  const trim = clean(row[2]);

  if (make) lastMake = make;
  else make = lastMake;

  // Some rows contain multiple models separated by commas
  const models = modelRaw
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  // Skip brand-only rows like "Acura,,,,," (make present, model missing)
  if (!make || models.length === 0) {
    if (make && models.length === 0) skippedBrandRows++;
    continue;
  }

  // Year columns (based on your current logic)
  const yearStartRaw = clean(row[4]);
  const yearEndRaw = clean(row[5]);

  const yearStart = Number(yearStartRaw);
  const yearEnd = Number(yearEndRaw);

  // skip non-data rows
  if (!Number.isFinite(yearStart) || !Number.isFinite(yearEnd)) continue;
  if (yearStart <= 0 || yearEnd <= 0) continue;

  processedRows++;

  const ys = Math.min(yearStart, yearEnd);
  const ye = Math.max(yearStart, yearEnd);

  for (let y = ys; y <= ye; y++) {
    for (const model of models) {
      const k = vehicleKey(y, make, model, trim || null);
      ensure(out, k);
      expandedVehicleKeys++;

      for (const [idxStr, meta] of Object.entries(colMap)) {
        const idx = Number(idxStr);
        const sku = clean(row[idx]);
        if (!sku) continue;

        if (meta.type === "dashKits") {
          pushUnique(out[k].dashKits[meta.sub], sku);
        } else if (meta.type === "harnesses") {
          out[k].harnesses[meta.amp][meta.role] ??= [];
          pushUnique(out[k].harnesses[meta.amp][meta.role], sku);
        } else if (meta.type === "antennas") {
          out[k].antennas[meta.sub] ??= [];
          pushUnique(out[k].antennas[meta.sub], sku);
        }
      }
    }
  }
}

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2));

console.log("✅ vehicle_accessories.json rebuilt (Metra headers aligned)");
console.log(
  `ℹ️ rows processed=${processedRows}, brand-only skipped=${skippedBrandRows}, vehicleKeysExpanded=${expandedVehicleKeys}, uniqueVehicleKeys=${Object.keys(out).length}`
);
