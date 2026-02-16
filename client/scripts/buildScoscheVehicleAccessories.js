// client/scripts/buildScoscheVehicleAccessories.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Prefer CLI arg, fallback to your repo path
const SCOSCHE_FILE =
  process.argv[2] ||
  path.join(
    __dirname,
    "..",
    "src",
    "data",
    "scosche",
    "scosche_2020_application_guide_extracted_v2.csv"
  );

const OUTPUT = path.join(
  __dirname,
  "..",
  "src",
  "data",
  "processed",
  "vehicle_accessories_scosche.json"
);

function clean(v) {
  return String(v ?? "").trim();
}

function titleCase(s) {
  const t = clean(s).toLowerCase();
  if (!t) return "";
  return t.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

function normalizeMake(s) {
  return titleCase(s);
}
function normalizeModel(s) {
  return titleCase(s);
}
function normalizeTrim(s) {
  return titleCase(s);
}

function vehicleKey(year, make, model, trim) {
  return trim ? `${year}|${make}|${model}|${trim}` : `${year}|${make}|${model}`;
}

function pushUnique(arr, v) {
  const s = clean(v);
  if (!s) return;
  const u = s.toUpperCase();
  if (u === "N/A" || u === "-" || u === "N/R") return;
  if (!arr.includes(s)) arr.push(s);
}

function ensure(map, key) {
  if (!map[key]) {
    map[key] = {
      dashKits: { singleDin: [], doubleDin: [] },
      harnesses: { amplified: {}, nonAmplified: {} },
      antennas: {},
      maestro: [],
      scosche: {
        dashKits: { singleDin: [], doubleDin: [] },
        harnesses: {
          wiring: [],
          generic: [],
          reverse: [],
          usbAux: [],
          camera: [],
          speaker: [],
        },
        antennas: { adapter: [], reverse: [] },
        interfaces: { linkPlusPremier: [], linkSwc: [] },
        speaker: { frontAdapter: [], rearAdapter: [] },
        oemQi: [],
        meta: { nav: [], pages: [], sections: [] },
      },
    };
  }
}

/** Robust CSV parser */
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  const s = String(line ?? "").replace(/^\uFEFF/, "");

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (ch === '"') {
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

function readTextFileSmart(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Scosche CSV not found at: ${filePath}`);
  }
  const buf = fs.readFileSync(filePath);

  // UTF-16 LE BOM
  const isUtf16Le = buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe;
  let text = isUtf16Le ? buf.toString("utf16le") : buf.toString("utf8");
  text = text.replace(/^\uFEFF/, "");
  return text;
}

function splitModels(modelRaw) {
  const s = clean(modelRaw);
  if (!s) return [];
  return s
    .replace(/\s+and\s+/gi, ",")
    .split(/[,/&]/g)
    .map((m) => m.trim())
    .filter(Boolean)
    .map(normalizeModel);
}

// For part numbers / SKUs (split on whitespace too)
function splitSkuParts(cell) {
  const s = clean(cell);
  if (!s) return [];
  const u = s.toUpperCase();
  if (u === "N/A" || u === "-" || u === "N/R") return [];

  return s
    .replace(/\s+/g, " ")
    .split(/[\n;|,]+/g)
    .flatMap((x) => x.split(" "))
    .flatMap((x) => x.split("/"))
    .map((x) => x.trim())
    .filter(Boolean);
}

// ====== YEAR PARSING ======
const NOW_YEAR = new Date().getFullYear();
const MIN_YEAR = 1950;
const MAX_YEAR = NOW_YEAR + 1;
const MAX_SPAN = 60;

function extractYearsFromText(s) {
  const m = String(s ?? "").match(/\b(19\d{2}|20\d{2})\b/g);
  if (!m) return [];
  return m.map((x) => Number(x)).filter((n) => Number.isFinite(n));
}

function parseStartEndYears(startCell, endCell) {
  const s = clean(startCell);
  const e = clean(endCell);

  const sy = extractYearsFromText(s);
  const ey = extractYearsFromText(e);

  let startYear = sy.length ? sy[0] : null;
  let endYear = ey.length ? ey[0] : null;

  const saysAndUp = /(\band up\b|\bup\b|\+)$|\bto present\b|\bpresent\b/i.test(
    s + " " + e
  );

  if (!endYear && sy.length >= 2) endYear = sy[1];
  if (!startYear && ey.length >= 2) startYear = ey[0];

  if (startYear && saysAndUp && !endYear) endYear = NOW_YEAR;

  if (!startYear || !endYear) return null;

  const ys = Math.min(startYear, endYear);
  const ye = Math.max(startYear, endYear);

  if (ys < MIN_YEAR || ye > MAX_YEAR) return null;
  if (ye - ys > MAX_SPAN) return null;

  return { ys, ye };
}

// YEAR SPAN like "2001-03", "2012-2019", "1988-88"
function parseYearSpanCell(spanCell) {
  const s = clean(spanCell);
  if (!s) return null;

  const m = s.match(/^(\d{4})\s*-\s*(\d{2}|\d{4})$/);
  if (!m) return null;

  const startYear = Number(m[1]);
  const endRaw = m[2];

  let endYear;
  if (endRaw.length === 2) {
    const century = Math.floor(startYear / 100) * 100;
    endYear = century + Number(endRaw);
  } else {
    endYear = Number(endRaw);
  }

  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) return null;

  const ys = Math.min(startYear, endYear);
  const ye = Math.max(startYear, endYear);

  if (ys < MIN_YEAR || ye > MAX_YEAR) return null;
  if (ye - ys > MAX_SPAN) return null;

  return { ys, ye };
}

// ====== Header helpers ======
function idxExactOrContains(headers, patterns) {
  const up = headers.map((h) => clean(h).toUpperCase());
  for (const p of patterns) {
    const P = p.toUpperCase();
    const exact = up.indexOf(P);
    if (exact !== -1) return exact;
    const contains = up.findIndex((h) => h.includes(P));
    if (contains !== -1) return contains;
  }
  return -1;
}

function idxContainsWithGuards(headers, mustInclude, mustNotInclude = []) {
  const up = headers.map((h) => clean(h).toUpperCase());
  const inc = mustInclude.map((x) => x.toUpperCase());
  const exc = mustNotInclude.map((x) => x.toUpperCase());

  for (let i = 0; i < up.length; i++) {
    const h = up[i];
    const ok =
      inc.every((w) => h.includes(w)) && exc.every((w) => !h.includes(w));
    if (ok) return i;
  }
  return -1;
}

// ====== CRITICAL FIX: only accept real makes as make headings ======
const MAKE_WHITELIST = new Set(
  [
    "ACURA",
    "ALFA ROMEO",
    "ASTON MARTIN",
    "AUDI",
    "BENTLEY",
    "BMW",
    "BUICK",
    "CADILLAC",
    "CHEVROLET",
    "CHRYSLER",
    "DODGE",
    "FIAT",
    "FORD",
    "GENESIS",
    "GMC",
    "HONDA",
    "HYUNDAI",
    "INFINITI",
    "JAGUAR",
    "JEEP",
    "KIA",
    "LAMBORGHINI",
    "LAND ROVER",
    "LEXUS",
    "LINCOLN",
    "LOTUS",
    "MASERATI",
    "MAZDA",
    "MCLAREN",
    "MERCEDES-BENZ",
    "MERCEDES BENZ",
    "MERCURY",
    "MINI",
    "MITSUBISHI",
    "NISSAN",
    "POLESTAR",
    "PONTIAC",
    "PORSCHE",
    "RAM",
    "ROLLS-ROYCE",
    "SAAB",
    "SATURN",
    "SCION",
    "SUBARU",
    "SUZUKI",
    "TESLA",
    "TOYOTA",
    "VOLKSWAGEN",
    "VOLVO",
  ].map((s) => s.toUpperCase())
);

function isRealMakeHeading(s) {
  return MAKE_WHITELIST.has(clean(s).toUpperCase());
}

// ====== RUN ======
const text = readTextFileSmart(SCOSCHE_FILE);
const rawLines = text.split(/\r?\n/).filter((l) => clean(l).length > 0);
if (rawLines.length < 2) throw new Error("Scosche CSV empty after read.");

const parsed = rawLines.map((l) => parseCsvLine(l));
const header = parsed[0];

let maxCols = header.length;
for (let i = 0; i < Math.min(parsed.length, 500); i++) {
  if (parsed[i].length > maxCols) maxCols = parsed[i].length;
}
for (let i = 0; i < parsed.length; i++) padTo(parsed[i], maxCols);
padTo(header, maxCols);

// Support BOTH formats:
// A) extracted_v2: MAKE, MODEL, START YEAR, END YEAR
// B) integration guide: MAKE/MODEL, YEAR SPAN (+ parts columns)
const idxMake = idxExactOrContains(header, ["MAKE"]);
const idxModel = idxExactOrContains(header, ["MODEL"]);
const idxMakeModel = idxExactOrContains(header, ["MAKE/MODEL", "MAKE MODEL"]);
const idxYearSpan = idxExactOrContains(header, ["YEAR SPAN"]);

const idxTrim = idxExactOrContains(header, [
  "TRIM / QUALIFIER",
  "TRIM",
  "QUALIFIER",
  "SUBMODEL",
]);

const idxStart = idxExactOrContains(header, ["START YEAR", "YEAR START", "FROM"]);
const idxEnd = idxExactOrContains(header, ["END YEAR", "YEAR END", "TO"]);

// Kits
const idxSpecificKit = idxExactOrContains(header, ["SPECIFIC KIT"]);
const idxDoubleDinKit = idxExactOrContains(header, [
  "DOUBLE DIN KIT",
  "DOUBLE-DIN KIT",
]);
const idxDashkit = idxExactOrContains(header, ["DASHKIT", "DASH KIT"]);

// Harnesses
const idxWiring = idxContainsWithGuards(header, ["WIRING", "HARNESS"]);
const idxHarnessGeneric = idxContainsWithGuards(
  header,
  ["HARNESS"],
  ["WIRING", "REVERSE", "USB", "AUX", "CAMERA", "SPEAKER"]
);
const idxReverseHarness = idxExactOrContains(header, ["REVERSE HARNESS"]);
const idxUsbAux = idxExactOrContains(header, ["USB/AUX RETENTION HARNESS"]);
const idxCamera = idxExactOrContains(header, ["CAMERA RETENTION HARNESS"]);
const idxSpeakerHarness = idxExactOrContains(header, ["SPEAKER HARNESS"]);

// Antennas
const idxAntenna = idxContainsWithGuards(header, ["ANTENNA ADAPTER"], ["REVERSE"]);
const idxReverseAntenna = idxExactOrContains(header, ["REVERSE ANTENNA ADAPTER"]);

// Interfaces
const idxLinkPlus = idxExactOrContains(header, ["LINK PLUS/PREMIER INTERFACE"]);
const idxLinkSwc = idxExactOrContains(header, ["LINK/SWC INTERFACE"]);

// Speakers
const idxFrontSpkAdapt = idxExactOrContains(header, ["FRONT SPEAKER ADAPTER"]);
const idxRearSpkAdapt = idxExactOrContains(header, ["REAR SPEAKER ADAPTER"]);

const idxOemQi = idxExactOrContains(header, ["OEM DIRECT FIT QI"]);

// meta
const idxNav = idxExactOrContains(header, ["NAV"]);
const idxPage = idxExactOrContains(header, ["PAGE_INDEX", "PAGE"]);
const idxSection = idxExactOrContains(header, ["SECTION"]);

const usingMakeModelFormat = idxMakeModel !== -1 && idxYearSpan !== -1;
const usingSplitColsFormat =
  idxMake !== -1 && idxModel !== -1 && idxStart !== -1 && idxEnd !== -1;

if (!usingMakeModelFormat && !usingSplitColsFormat) {
  throw new Error(
    `Unsupported header format. Found: MAKE=${idxMake}, MODEL=${idxModel}, START=${idxStart}, END=${idxEnd}, MAKE/MODEL=${idxMakeModel}, YEAR SPAN=${idxYearSpan}`
  );
}

console.log(
  "ℹ️ Detected format:",
  usingMakeModelFormat ? "MAKE/MODEL + YEAR SPAN" : "MAKE + MODEL + START/END"
);
console.log("ℹ️ File:", SCOSCHE_FILE);

const out = {};
let lastMake = "";
let processedRows = 0;
let skippedMakeModel = 0;
let skippedBadYears = 0;
let rowsWithAnyParts = 0;

for (let li = 1; li < parsed.length; li++) {
  const row = parsed[li];

  // ----- get make/model depending on format -----
  let make = "";
  let modelRaw = "";

  if (usingMakeModelFormat) {
    const mm = clean(row[idxMakeModel]);
    const span = clean(row[idxYearSpan]);

    // Header/section rows have no YEAR SPAN. Only accept REAL MAKES as make headings.
    if (mm && !span) {
      if (isRealMakeHeading(mm)) lastMake = mm;
      continue;
    }

    make = lastMake;
    modelRaw = mm;
  } else {
    make = clean(row[idxMake]);
    modelRaw = clean(row[idxModel]);
    if (make) lastMake = make;
    else make = lastMake;
  }

  const trim = idxTrim !== -1 ? normalizeTrim(row[idxTrim]) : "";

  make = normalizeMake(make);
  const models = splitModels(modelRaw);

  if (!make || models.length === 0) {
    skippedMakeModel++;
    continue;
  }

  // ----- year range depending on format -----
  let yr = null;
  if (usingMakeModelFormat) {
    yr = parseYearSpanCell(row[idxYearSpan]);
  } else {
    yr = parseStartEndYears(row[idxStart], row[idxEnd]);
  }

  if (!yr) {
    skippedBadYears++;
    continue;
  }

  // ----- parts -----
  const pSingle =
    idxSpecificKit !== -1 ? splitSkuParts(row[idxSpecificKit]) : [];
  const pDouble =
    idxDoubleDinKit !== -1 ? splitSkuParts(row[idxDoubleDinKit]) : [];
  const pDash = idxDashkit !== -1 ? splitSkuParts(row[idxDashkit]) : [];

  const pWiring = idxWiring !== -1 ? splitSkuParts(row[idxWiring]) : [];
  const pHarness =
    idxHarnessGeneric !== -1 ? splitSkuParts(row[idxHarnessGeneric]) : [];
  const pRevHarness =
    idxReverseHarness !== -1 ? splitSkuParts(row[idxReverseHarness]) : [];
  const pUsbAux = idxUsbAux !== -1 ? splitSkuParts(row[idxUsbAux]) : [];
  const pCamera = idxCamera !== -1 ? splitSkuParts(row[idxCamera]) : [];
  const pSpeakerH =
    idxSpeakerHarness !== -1 ? splitSkuParts(row[idxSpeakerHarness]) : [];

  const pAnt = idxAntenna !== -1 ? splitSkuParts(row[idxAntenna]) : [];
  const pRevAnt =
    idxReverseAntenna !== -1 ? splitSkuParts(row[idxReverseAntenna]) : [];

  const pLinkPlus = idxLinkPlus !== -1 ? splitSkuParts(row[idxLinkPlus]) : [];
  const pLinkSwc = idxLinkSwc !== -1 ? splitSkuParts(row[idxLinkSwc]) : [];

  const pFrontAdapt =
    idxFrontSpkAdapt !== -1 ? splitSkuParts(row[idxFrontSpkAdapt]) : [];
  const pRearAdapt =
    idxRearSpkAdapt !== -1 ? splitSkuParts(row[idxRearSpkAdapt]) : [];

  const pQi = idxOemQi !== -1 ? splitSkuParts(row[idxOemQi]) : [];

  const nav = idxNav !== -1 ? clean(row[idxNav]) : "";
  const page = idxPage !== -1 ? clean(row[idxPage]) : "";
  const section = idxSection !== -1 ? clean(row[idxSection]) : "";

  const hasAny =
    pSingle.length ||
    pDouble.length ||
    pDash.length ||
    pWiring.length ||
    pHarness.length ||
    pRevHarness.length ||
    pUsbAux.length ||
    pCamera.length ||
    pSpeakerH.length ||
    pAnt.length ||
    pRevAnt.length ||
    pLinkPlus.length ||
    pLinkSwc.length ||
    pFrontAdapt.length ||
    pRearAdapt.length ||
    pQi.length;

  processedRows++;
  if (hasAny) rowsWithAnyParts++;

  for (let y = yr.ys; y <= yr.ye; y++) {
    for (const model of models) {
      const k = vehicleKey(y, make, model, trim || null);
      ensure(out, k);

      // Store in scosche vendor block
      for (const p of pSingle) pushUnique(out[k].scosche.dashKits.singleDin, p);
      for (const p of pDouble) pushUnique(out[k].scosche.dashKits.doubleDin, p);
      for (const p of pDash) pushUnique(out[k].scosche.dashKits.doubleDin, p);

      for (const p of pWiring) pushUnique(out[k].scosche.harnesses.wiring, p);
      for (const p of pHarness) pushUnique(out[k].scosche.harnesses.generic, p);
      for (const p of pRevHarness) pushUnique(out[k].scosche.harnesses.reverse, p);
      for (const p of pUsbAux) pushUnique(out[k].scosche.harnesses.usbAux, p);
      for (const p of pCamera) pushUnique(out[k].scosche.harnesses.camera, p);
      for (const p of pSpeakerH) pushUnique(out[k].scosche.harnesses.speaker, p);

      for (const p of pAnt) pushUnique(out[k].scosche.antennas.adapter, p);
      for (const p of pRevAnt) pushUnique(out[k].scosche.antennas.reverse, p);

      for (const p of pLinkPlus)
        pushUnique(out[k].scosche.interfaces.linkPlusPremier, p);
      for (const p of pLinkSwc)
        pushUnique(out[k].scosche.interfaces.linkSwc, p);

      for (const p of pFrontAdapt)
        pushUnique(out[k].scosche.speaker.frontAdapter, p);
      for (const p of pRearAdapt)
        pushUnique(out[k].scosche.speaker.rearAdapter, p);

      for (const p of pQi) pushUnique(out[k].scosche.oemQi, p);

      pushUnique(out[k].scosche.meta.nav, nav);
      pushUnique(out[k].scosche.meta.pages, page);
      pushUnique(out[k].scosche.meta.sections, section);

      // OPTIONAL: bubble dashkits to top-level too (keeps existing app expectations)
      for (const p of pSingle) pushUnique(out[k].dashKits.singleDin, p);
      for (const p of pDouble) pushUnique(out[k].dashKits.doubleDin, p);
      for (const p of pDash) pushUnique(out[k].dashKits.doubleDin, p);
    }
  }
}

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2));

console.log("✅ vehicle_accessories_scosche.json rebuilt (Scosche)");
console.log(
  `ℹ️ rows processed=${processedRows}, skipped(make/model)=${skippedMakeModel}, skipped(bad years)=${skippedBadYears}, rowsWithAnyParts=${rowsWithAnyParts}, uniqueVehicleKeys=${Object.keys(out).length}`
);
console.log("📄 Output:", OUTPUT);
