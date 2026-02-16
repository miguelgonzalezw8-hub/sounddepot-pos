import { useState, useEffect, useMemo, useRef } from "react";
import {
  getYearOptions,
  getMakeOptions,
  getModelOptions,
  findFitment,
} from "../utils/fitmentEngine";
import { matchProductsToVehicle } from "../utils/fitmentMatcher";
import {
  matchAccessoriesToVehicle,
  getAllowedDinSizes,
} from "../utils/accessoryMatcher";
import FilterProductsModal from "./FilterProductsModal";

/* ================= FITMENT NORMALIZATION HELPERS ================= */

// 🔊 Speaker identification helper
function isSpeakerProduct(p) {
  return Array.isArray(p.speakerSizes) || !!p.speakerSize;
}

function normalizeLocationLabel(raw) {
  const s = (raw || "").toLowerCase();

  if (s.includes("front") && s.includes("door")) return "Front Door";
  if (s.includes("rear") && s.includes("door")) return "Rear Door";
  if (s.includes("dash")) return "Dash";
  if (s.includes("center")) return "Center";
  if (s.includes("pillar") || s.includes("a-pillar")) return "A-Pillar";
  if (s.includes("sail")) return "Sail Panel";
  if (s.includes("deck") || s.includes("rear deck")) return "Rear Deck";
  if (s.includes("kick")) return "Kick Panel";

  return String(raw || "")
    .replace(/[_\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getLocLabel(loc, idx = 0) {
  const candidates = [
    loc?.name,
    loc?.location,
    loc?.label,
    loc?.position,
    loc?.speakerLocation,
    loc?.mountingLocation,
    loc?.area,
    loc?.description,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.trim())
      return normalizeLocationLabel(c);
  }

  const fallbackByIndex = [
    "Front Door",
    "Front Door Tweeter",
    "Dash / Center",
    "Rear Door",
    "Rear Deck",
    "Rear Side Panel",
  ];

  if (loc?.sizes?.length)
    return fallbackByIndex[idx] || `Location ${idx + 1}`;
  return `Location ${idx + 1}`;
}

function prettyLocationLabel(label) {
  if (!label) return label;
  const map = {
    "Front Door Tweeter": "A-Pillar / Tweeter",
    "Dash / Center": "Dash / Center Speaker",
    "Rear Side Panel": "Rear Side Panel / Quarter",
  };
  return map[label] || label;
}

function getLocSizes(loc) {
  const raw =
    loc?.sizes ??
    loc?.speakerSizes ??
    loc?.size ??
    loc?.speakerSize ??
    loc?.diameter ??
    loc?.diameters ??
    loc?.fitSizes ??
    [];

  if (Array.isArray(raw))
    return raw.map((x) => String(x).trim()).filter(Boolean);

  if (raw && typeof raw === "object") {
    return Object.values(raw)
      .flat()
      .map((x) => String(x).trim())
      .filter(Boolean);
  }

  const str = String(raw || "").trim();
  if (!str) return [];
  return str
    .split(/[,/|]|&| and /i)
    .map((x) => x.trim())
    .filter(Boolean);
}

function normalizeLocationsFromFitment(fitment) {
  if (!fitment?.locations) return [];

  return fitment.locations
    .map((loc, idx) => {
      const label = getLocLabel(loc, idx);
      const sizes = getLocSizes(loc).map(canonicalSpeakerSizeLabel);
      if (!label || sizes.length === 0) return null;
      return { label, sizes };
    })
    .filter(Boolean);
}

function parseInches(str) {
  const s = String(str || "")
    .toLowerCase()
    .replace(/″|”|“/g, '"')
    .replace(/inches|inch|in\./g, "in")
    .replace(/["]/g, "")
    .trim();

  // handle unicode fractions like ¾ ½ ¼
  const fracMap = { "¼": "1/4", "½": "1/2", "¾": "3/4" };
  const s2 = s.replace(/[¼½¾]/g, (m) => fracMap[m]);

  // matches: "6.5", "6 3/4", "6-3/4", "6 1/2"
  const m = s2.match(/^(\d+(?:\.\d+)?)\s*(?:[-\s])?\s*(\d+\/\d+)?/);
  if (!m) return null;

  const whole = Number(m[1]);
  if (!Number.isFinite(whole)) return null;

  let frac = 0;
  if (m[2]) {
    const [a, b] = m[2].split("/").map(Number);
    if (Number.isFinite(a) && Number.isFinite(b) && b !== 0) frac = a / b;
  }

  return whole + frac;
}

// Canonicalize to the sizes YOU want to treat as "same"
function canonicalSpeakerSizeLabel(raw) {
  const inches = parseInches(raw);
  if (!Number.isFinite(inches)) return String(raw || "").trim();

  // ---- common equivalence groups ----
  // You asked specifically to treat 6.5 and 6 3/4 as same.
  // So we bucket anything near 6.5–6.75 into "6.5"
  if (inches >= 6.4 && inches <= 6.8) return '6.5"';

  if (inches >= 5.1 && inches <= 5.4) return '5.25"';
  if (inches >= 3.4 && inches <= 3.6) return '3.5"';
  if (inches >= 4.9 && inches <= 5.05) return '5"';
  if (inches >= 3.9 && inches <= 4.1) return '4"';
  if (inches >= 6.9 && inches <= 7.1) return '7"';
  if (inches >= 7.9 && inches <= 8.1) return '8"';

  // fallback: keep a clean numeric label
  const rounded = Math.round(inches * 4) / 4; // nearest 0.25"
  return `${rounded}"`;
}

function normSize(s) {
  return canonicalSpeakerSizeLabel(s)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}


/* ================= CATEGORY BUCKETING ================= */

function getSkuCandidate(p) {
  return (
    p?.sku ||
    p?.SKU ||
    p?.partNumber ||
    p?.vendorSku ||
    p?.mpn ||
    p?.name ||
    ""
  );
}

function bucketForProduct(p) {
  const cat = String(p?.category || "").toLowerCase();
  const sku = String(getSkuCandidate(p)).toUpperCase();

  if (isSpeakerProduct(p) || cat.includes("speaker")) return "Speakers";
  if (cat.includes("radio") || cat.includes("head unit")) return "Radios";
  if (cat.includes("dash") || cat.includes("kit") || sku.startsWith("95-") || sku.startsWith("99-"))
    return "Dash Kits";
  if (cat.includes("harness") || sku.startsWith("70-") || sku.startsWith("71-") || sku.includes("HRN-"))
    return "Harnesses";
  if (cat.includes("antenna") || sku.startsWith("40-")) return "Antennas";
  if (cat.includes("interface") || cat.includes("module") || sku.startsWith("ADS-") || sku.includes("RR"))
    return "Interfaces";

  return "Accessories";
}

export default function VehicleFitment({
  products = [],
  selectedVehicle,        // ✅ ADD
  onAddProduct,
  onVehicleSelected,
}) {

  /* ================= VEHICLE ================= */
  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");

  /* ================= OPTIONS ================= */
  const [years, setYears] = useState([]);
  const [makes, setMakes] = useState([]);
  const [models, setModels] = useState([]);

  /* ================= FITMENT ================= */
  const [fitment, setFitment] = useState(null);

  /* ================= FILTER MODAL ================= */
  const [showFilters, setShowFilters] = useState(false);

  /* ================= FILTERS ================= */
  const [bucket, setBucket] = useState("All");
  const [brand, setBrand] = useState("All");
  const [location, setLocation] = useState("All");
  const [din, setDin] = useState("All");

  /* ================= MOUNT GUARD (FIX) ================= */
  const hasMountedRef = useRef(false);

  /* ================= LOAD YEARS ================= */
  useEffect(() => {
    getYearOptions().then((yrs) => {
      const cleanYears = Array.from(
        new Set(
          (yrs || [])
            .map((y) => Math.floor(Number(y)))
            .filter((y) => Number.isInteger(y))
        )
      ).sort((a, b) => b - a);

      setYears(cleanYears);
    });
  }, []);

  useEffect(() => {
    if (!year) return setMakes([]);
    getMakeOptions(Number(year)).then(setMakes);
  }, [year]);

  useEffect(() => {
    if (!year || !make) return setModels([]);
    getModelOptions(Number(year), make).then(setModels);
  }, [year, make]);


  useEffect(() => {
  if (!selectedVehicle) return;

  hasMountedRef.current = true;
  
  setYear(String(selectedVehicle.year || ""));
  setMake(selectedVehicle.make || "");
  setModel(selectedVehicle.model || "");
}, [selectedVehicle]);

  /* ================= FIND FITMENT (FIXED) ================= */
  useEffect(() => {
    // ⛔ prevent clearing restored vehicle on initial mount
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    if (!year || !make || !model) {
      setFitment(null);
      return; // ⛔ DO NOT clear parent vehicle
    }

    let cancelled = false;

    (async () => {
      const f = await findFitment(Number(year), make, model);
      if (cancelled) return;

      setFitment(f || null);

      setBucket("All");
      setBrand("All");
      setLocation("All");
      setDin("All");

      onVehicleSelected?.(
        f
          ? {
              year: Number(year),
              make: f.make,
              model: f.model,
              rawFitment: f,
            }
          : null
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [year, make, model, onVehicleSelected]);

  /* ================= MATCH PRODUCTS ================= */
  const recommended = useMemo(() => {
    if (!fitment) return [];

    const speakerMatches = matchProductsToVehicle(fitment, products);
    const accessoryMatches = matchAccessoriesToVehicle(
      {
        year: Number(year),
        make: fitment.make,
        model: fitment.model,
        trim: fitment.raw?.trim || "",
      },
      products
    );

    const map = new Map();
    [...speakerMatches, ...accessoryMatches].forEach((p) => {
      if (p?.id) map.set(p.id, p);
    });
    return Array.from(map.values());
  }, [fitment, products, year]);

  /* ================= LOCATION OPTIONS ================= */
  const locRows = useMemo(
    () => normalizeLocationsFromFitment(fitment),
    [fitment]
  );

  const locationOptions = useMemo(() => {
    const set = new Set();
    locRows.forEach((r) => r.label && set.add(prettyLocationLabel(r.label)));
    return ["All", ...Array.from(set)];
  }, [locRows]);

  /* ================= BUCKET COUNTS ================= */
  const bucketCounts = useMemo(() => {
    const counts = {
      All: recommended.length,
      Speakers: 0,
      "Dash Kits": 0,
      Harnesses: 0,
      Antennas: 0,
      Radios: 0,
      Interfaces: 0,
      Accessories: 0,
    };
    recommended.forEach((p) => {
      const b = bucketForProduct(p);
      counts[b] = (counts[b] || 0) + 1;
    });
    return counts;
  }, [recommended]);

  /* ================= BRAND OPTIONS ================= */
  const brandOptions = useMemo(() => {
    const set = new Set();
    const base =
      bucket === "All"
        ? recommended
        : recommended.filter((p) => bucketForProduct(p) === bucket);

    base.forEach((p) => p.brand && set.add(p.brand));
    return ["All", ...Array.from(set).sort()];
  }, [recommended, bucket]);

  /* ================= FILTERED PRODUCTS ================= */
  const filteredProducts = useMemo(() => {
    let list = [...recommended];

    if (bucket !== "All") {
      list = list.filter((p) => bucketForProduct(p) === bucket);
    }

    if (brand !== "All") {
      list = list.filter((p) => p.brand === brand);
    }

    if (bucket === "Speakers" && location !== "All") {
  const row = locRows.find((r) => prettyLocationLabel(r.label) === location);

  // Fitment sizes -> numeric inches
  const fitInches = (row?.sizes || [])
    .map(parseInches)
    .filter((n) => Number.isFinite(n));

  // If fitment didn't provide usable sizes, don't hide everything
  if (fitInches.length === 0) {
    // keep speakers visible rather than "No matches"
    list = list.filter((p) => isSpeakerProduct(p));
  } else {
    list = list.filter((p) => {
      if (!isSpeakerProduct(p)) return false;

      const ps = Array.isArray(p.speakerSizes)
        ? p.speakerSizes
        : p.speakerSize
        ? [p.speakerSize]
        : [];

      const pInches = ps
        .map(parseInches)
        .filter((n) => Number.isFinite(n));

      if (pInches.length === 0) return false;

      // Treat 6.5 and 6.75 as equivalent by allowing a tolerance
      // (0.35" covers 6.5 ↔ 6.75 but won't accidentally match 5.25 or 8)
      const TOL = 0.35;

      return pInches.some((pin) =>
        fitInches.some((fin) => Math.abs(pin - fin) <= TOL)
      );
    });
  }
}


    if (bucket === "Radios" && din !== "All") {
      const allowed = getAllowedDinSizes({
        year: Number(year),
        make: fitment?.make || make,
        model: fitment?.model || model,
        trim: fitment?.raw?.trim || "",
      });

      list = list.filter(() => {
        if (din === "Single") return allowed.singleDin;
        if (din === "Double") return allowed.doubleDin;
        return true;
      });
    }

    return list;
  }, [recommended, bucket, brand, location, din, locRows, year, make, model, fitment]);

  /* ================= UI ================= */
  return (
    <div className="space-y-3 border p-3 rounded-lg bg-gray-50">
      <h3 className="text-sm font-semibold">Vehicle Fitment</h3>

      <div className="grid grid-cols-3 gap-2">
        <select
          value={year}
          onChange={(e) => {
            setYear(e.target.value);
            setMake("");
            setModel("");
          }}
          className="h-10 px-3 rounded border bg-white text-sm"
        >
          <option value="">Year</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        <select
          value={make}
          onChange={(e) => {
            setMake(e.target.value);
            setModel("");
          }}
          disabled={!year}
          className="h-10 px-3 rounded border bg-white text-sm disabled:bg-gray-100"
        >
          <option value="">Make</option>
          {makes.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={!make}
          className="h-10 px-3 rounded border bg-white text-sm disabled:bg-gray-100"
        >
          <option value="">Model</option>
          {models.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {fitment && (
        <button
          onClick={() => setShowFilters(true)}
          className="h-10 px-3 rounded border bg-white text-sm hover:bg-gray-100 w-full"
        >
          Filter Products
        </button>
      )}

      {fitment && (
        <div className="max-h-[80vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {filteredProducts.length === 0 ? (
              <div className="col-span-full text-xs text-gray-500">
                No matches
              </div>
            ) : (
              filteredProducts.map((p) => (
                <button
                  key={p.id}
                  onMouseDown={() => onAddProduct?.(p)}
                  className="bg-white border rounded-lg p-3 hover:shadow transition text-left"
                >
                  <div className="w-full h-32 bg-gray-100 rounded flex items-center justify-center mb-2 overflow-hidden">
                    {p.imageUrl ? (
                      <img
                        src={p.imageUrl}
                        alt={p.name}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="text-xs text-gray-400">No Image</span>
                    )}
                  </div>

                  <div className="text-sm font-semibold line-clamp-2">
                    {p.name}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-1">
                    {(p.sku || p.name || "—")} • {p.brand || "—"}
                  </div>
                  <div className="text-sm font-bold mt-2">
                    ${Number(p.price || 0).toFixed(2)}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      <FilterProductsModal
        open={showFilters}
        onClose={() => setShowFilters(false)}
        bucket={bucket}
        setBucket={(b) => {
          setBucket(b);
          setBrand("All");
          setLocation("All");
          setDin("All");
        }}
        bucketCounts={bucketCounts}
        brand={brand}
        setBrand={setBrand}
        brandOptions={brandOptions}
        location={location}
        setLocation={setLocation}
        locationOptions={locationOptions}
        din={din}
        setDin={setDin}
      />
    </div>
  );
}
