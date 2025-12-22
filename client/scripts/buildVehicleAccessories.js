import fs from "fs";
import path from "path";

const METRA_FILE =
  "client/src/data/metra/Metra_Vehicle_Application_Guide sheet 1.csv";
const OUTPUT = "client/src/data/processed/vehicle_accessories.json";

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
  if (s === "N/A" || s === "-" || s === "N/R") return;
  if (!arr.includes(s)) arr.push(s);
}

// Basic CSV split for this specific file shape (no quoted commas in your shown rows)
function splitRow(line) {
  return String(line || "").split(",");
}

function padTo(arr, n) {
  while (arr.length < n) arr.push("");
  return arr;
}

// Shift section row (row1) so that TURBO KITS lines up above SINGLE DIN
function alignSectionRow(sectionRow, roleRow) {
  const kitsIdx = sectionRow.findIndex((x) => clean(x) === "TURBO KITS");
  const singleIdx = roleRow.findIndex((x) => clean(x).toUpperCase().includes("SINGLE DIN"));

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

// Get first ~few rows as arrays
const r1 = splitRow(lines[0] || "");
const r2 = splitRow(lines[1] || "");
const r3 = splitRow(lines[2] || "");
const r4 = splitRow(lines[3] || "");

// Determine max columns from a real data row (row 6 in your sample is perfect)
let maxCols = Math.max(r1.length, r2.length, r3.length, r4.length);
for (let i = 4; i < Math.min(lines.length, 50); i++) {
  const cols = splitRow(lines[i]);
  if (cols.length > maxCols) maxCols = cols.length;
}

// Pad header rows to maxCols
let sectionRow = padTo(r1.slice(), maxCols);
const subsectionRow = padTo(r2.slice(), maxCols);
const roleRow = padTo(r3.slice(), maxCols);

// Align and then forward-fill section/subsection
sectionRow = alignSectionRow(sectionRow, roleRow);
sectionRow = padTo(sectionRow, maxCols);

const sectionFF = forwardFill(sectionRow);
const subsectionFF = forwardFill(subsectionRow);

// Build colMap using context carry-forward
const colMap = {};

// DASH KIT columns: TURBO KITS area + current DIN context
let currentDin = null;

// HARNESS columns: TURBO WIRE + amp context from subsection row + role from role row
// ANTENNAS columns: ANTENNAWORKS + sub context from subsection row + role from role row
for (let idx = 0; idx < maxCols; idx++) {
  const sec = clean(sectionFF[idx]).toUpperCase();
  const sub = clean(subsectionFF[idx]).toUpperCase();
  const role = clean(roleRow[idx]).toUpperCase();

  // Track DIN group across blank role cells
  if (role.includes("SINGLE DIN")) currentDin = "singleDin";
  if (role.includes("DOUBLE DIN")) currentDin = "doubleDin";

  if (sec === "TURBO KITS") {
    if (currentDin) {
      colMap[idx] = { type: "dashKits", sub: currentDin };
    }
  }

  if (sec === "TURBO WIRE") {
    const amp =
      sub.includes("NON-AMPLIFIED") ? "nonAmplified" :
      sub.includes("AMPLIFIED") ? "amplified" :
      null;

    if (!amp) continue;

    if (role.includes("INTO CAR")) colMap[idx] = { type: "harnesses", amp, role: "intoCar" };
    else if (role.includes("INTO RADIO")) colMap[idx] = { type: "harnesses", amp, role: "intoRadio" };
    else if (role.includes("BYPASS")) colMap[idx] = { type: "harnesses", amp, role: "bypass" };
  }

  if (sec === "ANTENNAWORKS") {
    // subsection tells whether we're in adapter vs antenna group
    if (sub.includes("ANTENNA ADAPTER")) {
      colMap[idx] = { type: "antennas", sub: "adapter", role: clean(roleRow[idx]) || "adapter" };
    } else if (sub.includes("ANTENNA")) {
      // role row carries FIXED/POWER in your sample
      if (role.includes("POWER")) colMap[idx] = { type: "antennas", sub: "power" };
      else if (role.includes("FIXED")) colMap[idx] = { type: "antennas", sub: "fixed" };
      else colMap[idx] = { type: "antennas", sub: "antenna" };
    }
  }
}

// Parse data rows (starting at line 5 / index 4; your row 5 is "Acura, , ,...")
const out = {};

for (let li = 4; li < lines.length; li++) {
  const row = padTo(splitRow(lines[li]), maxCols);

  const make = clean(row[0]);
  const model = clean(row[1]);
  const trim = clean(row[2]);
  const yearStart = Number(clean(row[4]));
  const yearEnd = Number(clean(row[5]));

  // skip non-data / brand-only rows
  if (!make || !model || !yearStart || !yearEnd) continue;

  for (let y = yearStart; y <= yearEnd; y++) {
    const k = vehicleKey(y, make, model, trim || null);
    ensure(out, k);

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

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2));
console.log("✅ vehicle_accessories.json rebuilt (Metra headers aligned)");
