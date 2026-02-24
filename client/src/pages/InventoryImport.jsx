// client/src/pages/InventoryImport.jsx
import { useMemo, useState } from "react";
import Papa from "papaparse";
import { writeProductsAndUnitsBatch } from "../services/inventoryImportService";
import { inferSpeakerTraitsFromText } from "../utils/importInfer";
import { useSession } from "../session/SessionProvider";

function pickFirst(obj, keys, fallback = "") {
  for (const k of keys) {
    if (obj && obj[k] != null && String(obj[k]).trim() !== "") return obj[k];
  }
  return fallback;
}

function toNumberSafe(v, fallback = 0) {
  if (v == null) return fallback;
  const s = String(v).replace(/[^0-9.\-]/g, "").trim();
  if (!s) return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

// Detect delimiter from header line so Excel/region exports work (comma/semicolon/tab/pipe)
function detectDelimiterFromHeader(text) {
  const firstLine = String(text || "").split(/\r?\n/).find((l) => l.trim()) || "";
  const counts = {
    ",": (firstLine.match(/,/g) || []).length,
    ";": (firstLine.match(/;/g) || []).length,
    "\t": (firstLine.match(/\t/g) || []).length,
    "|": (firstLine.match(/\|/g) || []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ",";
}

// Remove BOM + strip weird whole-line quoting that Excel sometimes produces
function sanitizeCsvText(text) {
  const stripBom = (s) => String(s || "").replace(/^\uFEFF/, "");
  const lines = stripBom(text).split(/\r?\n/);

  const cleaned = lines
    .map((line) => {
      let s = String(line || "").trim();
      if (!s) return "";

      // Fix:  '"foo;bar;baz"'  ->  "foo;bar;baz"
      if (s.startsWith(`'"`)) s = s.slice(1);

      // If the ENTIRE line is wrapped in quotes, strip them:
      // "a;b;c" -> a;b;c
      if (s.startsWith(`"`) && s.endsWith(`"`)) s = s.slice(1, -1);

      return s;
    })
    .filter(Boolean)
    .join("\n");

  return cleaned;
}

function normalizeRowToProduct(row) {
  // Common column aliases from random POS exports
  const name = String(
    pickFirst(row, ["name", "item", "item_name", "title", "product", "description_short"], "")
  ).trim();

  const description = String(
    pickFirst(row, ["description", "desc", "details", "long_description", "notes"], "")
  ).trim();

  const sku = String(
    pickFirst(row, ["sku", "part", "part_number", "partnumber", "item_code", "code"], "")
  ).trim();
  
  const serialNumber = String(
    pickFirst(row, ["serial_number", "serial", "sn", "s/n", "imei"], "")
  ).trim();
  
const barcodeRaw = pickFirst(row, ["barcode", "upc", "ean", "gtin"], "");
let barcode = String(barcodeRaw || "").trim();
if (name?.toLowerCase().includes("c1-650")) {
  console.log("ROW KEYS:", Object.keys(row));
  console.log("SERIAL PICKED:", serialNumber);
}
// If Excel exported scientific notation, convert to integer string
if (/e\+?/i.test(barcode)) {
  const n = Number(barcode);
  if (Number.isFinite(n)) barcode = String(Math.trunc(n));
}

  // Your manual products show the real audio brand often in subBrand.
  // We’ll store the same value in BOTH brand and subBrand so nothing downstream breaks.
  const rawBrand = String(pickFirst(row, ["brand", "manufacturer", "mfg", "make"], "")).trim();
  const brand = rawBrand; // keep consistent
  const subBrand = rawBrand; // match your manual schema

  const category = String(pickFirst(row, ["category", "type", "department", "group"], "")).trim();

  const price = toNumberSafe(pickFirst(row, ["price", "retail", "msrp", "sell_price"], 0), 0);
  const cost = toNumberSafe(pickFirst(row, ["cost", "wholesale", "unit_cost"], 0), 0);

  // IMPORTANT: your app uses "stock" (manual products) more than qtyOnHand
  const stock = toNumberSafe(pickFirst(row, ["stock", "qty", "quantity", "on_hand"], 0), 0);

  // 🔥 Inference happens here using your existing importInfer.js
  const combined = `${name} ${description}`;
  const inferred = inferSpeakerTraitsFromText(combined);

  // Clean, consistent speaker size values (NO quotes)
  const normalizedSpeakerSize =
    inferred?.speakerSizeOval != null
      ? String(inferred.speakerSizeOval).trim() // ex: "6x9"
      : inferred?.speakerSizeInch != null
        ? String(inferred.speakerSizeInch).trim() // ex: "6.5"
        : null;

  // ✅ Write BOTH shapes so every part of the app matches it
  const speakerSize = normalizedSpeakerSize || null;
  const speakerSizes = normalizedSpeakerSize ? [normalizedSpeakerSize] : [];

  return {
    // ✅ match manual product schema expectations
    active: true,
    name,
    description,
    sku,
    serialNumber,
    barcode,
    brand,
    subBrand,
    category,

    price,
    cost,
    stock,

    ...(speakerSize ? { speakerSize, speakerSizes } : {}),

    // Optional: keep evidence while you’re in beta.
    importMeta: {
      speakerInference: inferred || null,
      source: "csv",
    },
  };
}

export default function InventoryImport() {
  const { terminal, tenant } = useSession();

  const tenantId = terminal?.tenantId || tenant?.tenantId;
console.log("SESSION TENANT:", tenantId);
  const [fileName, setFileName] = useState("");
  const [rawRows, setRawRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [parseError, setParseError] = useState("");
  const [status, setStatus] = useState({ state: "idle", message: "" });

  const preview = useMemo(() => products.filter((p) => p.name), [products]);

  const speakerInferredCount = useMemo(
    () => preview.filter((p) => p.speakerSize).length,
    [preview]
  );

  function onPickFile(e) {
    setParseError("");
    setStatus({ state: "idle", message: "" });
    setRawRows([]);
    setProducts([]);

    const f = e.target.files?.[0];
    if (!f) return;

    setFileName(f.name);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rawText = String(reader.result || "");
        const fixedText = sanitizeCsvText(rawText);
        const delimiter = detectDelimiterFromHeader(fixedText);

        Papa.parse(fixedText, {
          header: true,
          skipEmptyLines: "greedy",
          delimiter, // ✅ handle comma/semicolon/tab/pipe
          transformHeader: (h) => String(h || "").trim().toLowerCase(),
          complete: (results) => {
            const rows = Array.isArray(results.data) ? results.data : [];
            const cleanedRows = rows.filter(
              (r) => r && Object.values(r).some((v) => String(v || "").trim() !== "")
            );

            if (!cleanedRows.length && results.errors?.length) {
              setParseError(results.errors[0]?.message || "CSV parse error");
              return;
            }

            setRawRows(cleanedRows);
            setProducts(cleanedRows.map(normalizeRowToProduct));
          },
        });
      } catch (err) {
        console.error(err);
        setParseError(err?.message || "Failed to read/parse CSV");
      }
    };

    reader.readAsText(f);
  }

  async function onImport() {
    setParseError("");

    if (!tenantId) {
      setParseError("No tenantId found in session/terminal. Log in with a tenant loaded first.");
      return;
    }

    if (!preview.length) {
      setParseError("No valid rows to import (missing names).");
      return;
    }

    setStatus({ state: "running", message: "Importing..." });

    try {
      const res = await writeProductsAndUnitsBatch({ tenantId, rows: preview });
setStatus({
  state: "done",
  message: `Imported ${res.productsUpserted} products and ${res.unitsInserted} units.`,
});
    } catch (err) {
      console.error(err);
      setStatus({ state: "error", message: err?.message || "Import failed" });
    }
  }

  return (
    <div className="p-4">
      <div className="bg-app-panel dark:bg-app-panel border border-app-border rounded-xl p-4">
        <div className="text-lg font-semibold">Inventory Import (CSV)</div>
        <div className="text-sm text-app-text/70 mt-1">
          Upload a CSV export from another POS. We’ll infer missing traits like speaker size from
          name/description.
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <input type="file" accept=".csv,text/csv" onChange={onPickFile} />

          {fileName ? (
            <div className="text-sm">
              <span className="font-semibold">File:</span> {fileName}
              <span className="ml-3 text-app-text/70">
                Rows: {rawRows.length} • Preview valid: {preview.length} • Speaker size inferred:{" "}
                {speakerInferredCount}
              </span>
            </div>
          ) : null}

          {parseError ? <div className="text-sm text-red-500">{parseError}</div> : null}

          <div className="flex gap-2">
            <button
              className="px-3 h-10 rounded-lg border border-app-border bg-app-panel text-app-text hover:bg-slate-50 text-sm font-semibold disabled:opacity-50"
              onClick={onImport}
              disabled={status.state === "running" || preview.length === 0}
            >
              Import to Inventory
            </button>

            {status.state !== "idle" ? (
              <div className="text-sm flex items-center">
                <span className={status.state === "error" ? "text-red-500" : "text-app-text/70"}>
                  {status.message}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {preview.length ? (
        <div className="mt-4 bg-app-panel dark:bg-app-panel border border-app-border rounded-xl p-4">
          <div className="font-semibold">Preview (first 25)</div>
          <div className="mt-3 overflow-auto">
            <table className="min-w-[900px] w-full text-sm">
              <thead>
                <tr className="text-left border-b border-app-border">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">SKU</th>
                  <th className="py-2 pr-3">Brand</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Price</th>
                  <th className="py-2 pr-3">Stock</th>
                  <th className="py-2 pr-3">Speaker Size</th>
                  <th className="py-2 pr-3">Barcode</th>
                  <th className="py-2 pr-3">Serial</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 25).map((p, idx) => (
                  <tr key={idx} className="border-b border-app-border/60">
                    <td className="py-2 pr-3">{p.name}</td>
                    <td className="py-2 pr-3">{p.sku}</td>
                    <td className="py-2 pr-3">{p.subBrand || p.brand}</td>
                    <td className="py-2 pr-3">{p.category}</td>
                    <td className="py-2 pr-3">{p.price}</td>
                    <td className="py-2 pr-3">{p.stock}</td>
                    <td className="py-2 pr-3">{p.speakerSize || ""}</td>
                    <td className="py-2 pr-3">{p.barcode || ""}</td>
                    <td className="py-2 pr-3">{p.serialNumber || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-xs text-app-text/60 mt-2">
            Tip: if the CSV column names don’t match, we can add aliases without changing the UI.
          </div>
        </div>
      ) : null}
    </div>
  );
}