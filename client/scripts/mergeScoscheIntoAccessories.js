import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MASTER = path.join(__dirname, "..", "src", "data", "processed", "vehicle_accessories.json");
const SCOSCHE = path.join(__dirname, "..", "src", "data", "processed", "vehicle_accessories_scosche.json");

function readJson(p) {
  if (!fs.existsSync(p)) throw new Error(`Missing file: ${p}`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function pushUnique(arr, v) {
  if (!v) return;
  if (!arr.includes(v)) arr.push(v);
}

function ensureBase(obj) {
  if (!obj.dashKits) obj.dashKits = { singleDin: [], doubleDin: [] };
  if (!obj.dashKits.singleDin) obj.dashKits.singleDin = [];
  if (!obj.dashKits.doubleDin) obj.dashKits.doubleDin = [];

  if (!obj.harnesses) obj.harnesses = { amplified: {}, nonAmplified: {} };
  if (!obj.antennas) obj.antennas = {};
  if (!obj.maestro) obj.maestro = [];

  if (!obj.scosche) {
    obj.scosche = {
      dashKits: { singleDin: [], doubleDin: [] },
      harnesses: { wiring: [], generic: [], reverse: [], usbAux: [], camera: [], speaker: [] },
      antennas: { adapter: [], reverse: [] },
      interfaces: { linkPlusPremier: [], linkSwc: [] },
      speaker: { frontAdapter: [], rearAdapter: [] },
      oemQi: [],
      meta: { nav: [], pages: [], sections: [] },
    };
  }
  return obj;
}

function mergeOne(target, sc) {
  ensureBase(target);

  // 1) Bubble Scosche dashkits into TOP-LEVEL dashKits (what Sell typically uses)
  for (const sku of sc?.scosche?.dashKits?.singleDin || sc?.dashKits?.singleDin || []) {
    pushUnique(target.dashKits.singleDin, sku);
  }
  for (const sku of sc?.scosche?.dashKits?.doubleDin || sc?.dashKits?.doubleDin || []) {
    pushUnique(target.dashKits.doubleDin, sku);
  }

  // 2) Keep the vendor-specific block too (nice to have)
  const s = sc?.scosche || sc;
  if (s?.dashKits) {
    for (const sku of s.dashKits.singleDin || []) pushUnique(target.scosche.dashKits.singleDin, sku);
    for (const sku of s.dashKits.doubleDin || []) pushUnique(target.scosche.dashKits.doubleDin, sku);
  }
  if (s?.harnesses) {
    for (const sku of s.harnesses.wiring || []) pushUnique(target.scosche.harnesses.wiring, sku);
    for (const sku of s.harnesses.generic || []) pushUnique(target.scosche.harnesses.generic, sku);
    for (const sku of s.harnesses.reverse || []) pushUnique(target.scosche.harnesses.reverse, sku);
    for (const sku of s.harnesses.usbAux || []) pushUnique(target.scosche.harnesses.usbAux, sku);
    for (const sku of s.harnesses.camera || []) pushUnique(target.scosche.harnesses.camera, sku);
    for (const sku of s.harnesses.speaker || []) pushUnique(target.scosche.harnesses.speaker, sku);
  }
  if (s?.antennas) {
    for (const sku of s.antennas.adapter || []) pushUnique(target.scosche.antennas.adapter, sku);
    for (const sku of s.antennas.reverse || []) pushUnique(target.scosche.antennas.reverse, sku);
  }
  if (s?.interfaces) {
    for (const sku of s.interfaces.linkPlusPremier || []) pushUnique(target.scosche.interfaces.linkPlusPremier, sku);
    for (const sku of s.interfaces.linkSwc || []) pushUnique(target.scosche.interfaces.linkSwc, sku);
  }
  if (s?.speaker) {
    for (const sku of s.speaker.frontAdapter || []) pushUnique(target.scosche.speaker.frontAdapter, sku);
    for (const sku of s.speaker.rearAdapter || []) pushUnique(target.scosche.speaker.rearAdapter, sku);
  }
  for (const sku of s?.oemQi || []) pushUnique(target.scosche.oemQi, sku);

  return target;
}

const master = readJson(MASTER);
const scosche = readJson(SCOSCHE);

let mergedKeys = 0;

for (const [k, sc] of Object.entries(scosche)) {
  if (!master[k]) master[k] = ensureBase({});
  mergeOne(master[k], sc);
  mergedKeys++;
}

fs.writeFileSync(MASTER, JSON.stringify(master, null, 2));
console.log(`✅ Merged Scosche into vehicle_accessories.json`);
console.log(`ℹ️ scoscheKeys=${Object.keys(scosche).length}, mergedKeys=${mergedKeys}, masterKeys=${Object.keys(master).length}`);
