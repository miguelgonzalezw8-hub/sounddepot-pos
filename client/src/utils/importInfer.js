// client/src/utils/importInfer.js

function normText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/×/g, "x")
    .replace(/[_]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function skuish(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function hasAny(str, arr) {
  return arr.some((x) => str.includes(x));
}

// Simple override table for SKUs that don’t encode size clearly.
// Key is compact sku/name text (letters+digits only).
const OVERRIDES = {
  // Kicker KS series
  ksc2704: { speakerSizeInch: 2.75, driverType: "speaker", confidence: "high", evidence: ["override:ksc2704"] },

  // Add more as you discover them:
  // ksc3504: { speakerSizeInch: 3.5, driverType: "speaker", confidence: "high", evidence: ["override:ksc3504"] },
  // ksc404:  { speakerSizeInch: 4.0, driverType: "speaker", confidence: "high", evidence: ["override:ksc404"] },
};

/**
 * Returns:
 * {
 *   speakerSizeInch: number|null,
 *   speakerSizeOval: string|null, // ex "6x9"
 *   driverType: "tweeter"|"midrange"|"woofer"|"coax"|"component"|"speaker"|null,
 *   confidence: "low"|"medium"|"high",
 *   evidence: string[]
 * }
 */
export function inferSpeakerTraitsFromText(input) {
  const text = normText(input);
  const compact = skuish(input);

  // ✅ 0) Overrides first
  for (const [key, value] of Object.entries(OVERRIDES)) {
    if (compact.includes(key)) {
      return {
        speakerSizeInch: value.speakerSizeInch ?? null,
        speakerSizeOval: value.speakerSizeOval ?? null,
        driverType: value.driverType ?? null,
        confidence: value.confidence ?? "high",
        evidence: value.evidence ?? [`override:${key}`],
      };
    }
  }

  const evidence = [];
  let confidence = "low";
  let speakerSizeInch = null;
  let speakerSizeOval = null;
  let driverType = null;

  // 1) Driver type hints
  if (hasAny(text, ["tweeter", "tweet", "twtr"])) {
    driverType = "tweeter";
    evidence.push("type:tweeter(text)");
  } else if (hasAny(text, ["component", "comp set", "separate tweeter"])) {
    driverType = "component";
    evidence.push("type:component(text)");
  } else if (hasAny(text, ["coax", "coaxial", "2-way", "3-way"])) {
    driverType = "coax";
    evidence.push("type:coax(text)");
  } else if (hasAny(text, ["midrange", "mid"])) {
    driverType = "midrange";
    evidence.push("type:midrange(text)");
  }

  // 2) Direct size patterns in text
  if (/\b6\s*(x|by)\s*9\b/.test(text) || /\b6x9\b/.test(text)) {
    speakerSizeOval = "6x9";
    confidence = "high";
    evidence.push("size:6x9(text)");
  }

  // Tweeter inch sizes
  if (speakerSizeOval == null && speakerSizeInch == null) {
    const m = text.match(/\b(0\.5|0\.75|1\.25|1)\s*("|in\b|inch)\b/);
    if (m) {
      speakerSizeInch = Number(m[1]);
      confidence = "high";
      evidence.push(`size:${speakerSizeInch}(text)`);
      driverType = driverType || "tweeter";
    }
  }

  // 6.5"
  if (speakerSizeOval == null && speakerSizeInch == null) {
    if (/\b6\s*(1\/2|\.5)\b/.test(text) || /\b6-1\/2\b/.test(text) || /\b6\.5\b/.test(text)) {
      speakerSizeInch = 6.5;
      confidence = "high";
      evidence.push("size:6.5(text)");
    }
  }

  // 5.25"
  if (speakerSizeOval == null && speakerSizeInch == null) {
    if (/\b5\s*(1\/4|\.25)\b/.test(text) || /\b5-1\/4\b/.test(text) || /\b5\.25\b/.test(text)) {
      speakerSizeInch = 5.25;
      confidence = "high";
      evidence.push("size:5.25(text)");
    }
  }

  // 4"
  if (speakerSizeOval == null && speakerSizeInch == null) {
    if (/\b4(\.0)?\b/.test(text) && hasAny(text, ["speaker", "speakers", "coax", "component", "midrange", "mid"])) {
      speakerSizeInch = 4.0;
      confidence = "high";
      evidence.push("size:4.0(text)");
    }
  }

  // 3.5"
  if (speakerSizeOval == null && speakerSizeInch == null) {
    if (/\b3\s*(1\/2|\.5)\b/.test(text) || /\b3-1\/2\b/.test(text) || /\b3\.5\b/.test(text)) {
      speakerSizeInch = 3.5;
      confidence = "high";
      evidence.push("size:3.5(text)");
    }
  }

  // 2.75" (2 3/4, 2.75)
  if (speakerSizeOval == null && speakerSizeInch == null) {
    if (/\b2\s*(3\/4|\.75)\b/.test(text) || /\b2-3\/4\b/.test(text) || /\b2\.75\b/.test(text)) {
      speakerSizeInch = 2.75;
      confidence = "high";
      evidence.push("size:2.75(text)");
    }
  }

  // 3) mm patterns (incl tweeter mm)
  if (speakerSizeOval == null && speakerSizeInch == null) {
    const mm2 = text.match(/\b(\d{2})\s*mm\b/);
    if (mm2) {
      const v = Number(mm2[1]);
      if (v >= 12 && v <= 14) {
        speakerSizeInch = 0.5;
        confidence = "medium";
        evidence.push("size:0.5(mm)");
        driverType = driverType || "tweeter";
      } else if (v >= 18 && v <= 21) {
        speakerSizeInch = 0.75;
        confidence = "medium";
        evidence.push("size:0.75(mm)");
        driverType = driverType || "tweeter";
      } else if (v >= 24 && v <= 26) {
        speakerSizeInch = 1.0;
        confidence = "medium";
        evidence.push("size:1.0(mm)");
        driverType = driverType || "tweeter";
      } else if (v >= 29 && v <= 33) {
        speakerSizeInch = 1.25;
        confidence = "medium";
        evidence.push("size:1.25(mm)");
        driverType = driverType || "tweeter";
      }
    }
  }

  if (speakerSizeOval == null && speakerSizeInch == null) {
    const mm = text.match(/\b(\d{2,3})\s*mm\b/);
    if (mm) {
      const v = Number(mm[1]);
      if (v >= 160 && v <= 175) {
        speakerSizeInch = 6.5;
        confidence = "medium";
        evidence.push("size:6.5(mm)");
      } else if (v >= 125 && v <= 139) {
        speakerSizeInch = 5.25;
        confidence = "medium";
        evidence.push("size:5.25(mm)");
      } else if (v >= 95 && v <= 110) {
        speakerSizeInch = 4.0;
        confidence = "medium";
        evidence.push("size:4.0(mm)");
      } else if (v >= 85 && v <= 94) {
        speakerSizeInch = 3.5;
        confidence = "medium";
        evidence.push("size:3.5(mm)");
      } else if (v >= 65 && v <= 72) {
        speakerSizeInch = 2.75;
        confidence = "medium";
        evidence.push("size:2.75(mm)");
      }
    }
  }

  // 4) SKU/name shorthand inference
  if (speakerSizeOval == null && speakerSizeInch == null) {
    if (hasAny(compact, ["6x9", "690", "692", "693", "1692", "1693", "960"])) {
      speakerSizeOval = "6x9";
      confidence = "medium";
      evidence.push("shorthand:6x9(sku)");
    }

    if (speakerSizeOval == null && speakerSizeInch == null) {
      if (hasAny(compact, ["650", "652", "653", "165", "170", "675", "1650", "1675"]) || hasAny(compact, ["65"])) {
        speakerSizeInch = 6.5;
        confidence = "medium";
        evidence.push("shorthand:6.5(sku)");
      }
    }

    if (speakerSizeOval == null && speakerSizeInch == null) {
      if (hasAny(compact, ["525", "5250", "130", "132", "135", "1300", "1320"])) {
        speakerSizeInch = 5.25;
        confidence = "medium";
        evidence.push("shorthand:5.25(sku)");
      }
    }

    if (speakerSizeOval == null && speakerSizeInch == null) {
      if (hasAny(compact, ["350", "352", "353", "35"])) {
        speakerSizeInch = 3.5;
        confidence = "medium";
        evidence.push("shorthand:3.5(sku)");
      }
    }

    if (speakerSizeOval == null && speakerSizeInch == null) {
      if (hasAny(compact, ["270", "2704", "275", "2750"])) {
        speakerSizeInch = 2.75;
        confidence = "medium";
        evidence.push("shorthand:2.75(sku)");
      }
    }

    // Tweeter shorthand
    if (speakerSizeOval == null && speakerSizeInch == null) {
      if (hasAny(compact, ["100ct", "c1100ct", "100t", "25mm", "25t"])) {
        speakerSizeInch = 1.0;
        confidence = "medium";
        evidence.push("shorthand:1.0(sku)");
        driverType = driverType || "tweeter";
      } else if (hasAny(compact, ["075t", "75t", "19mm", "20mm"])) {
        speakerSizeInch = 0.75;
        confidence = "medium";
        evidence.push("shorthand:0.75(sku)");
        driverType = driverType || "tweeter";
      } else if (hasAny(compact, ["050t", "13mm"])) {
        speakerSizeInch = 0.5;
        confidence = "medium";
        evidence.push("shorthand:0.5(sku)");
        driverType = driverType || "tweeter";
      } else if (hasAny(compact, ["125t", "1p25", "30mm", "32mm"])) {
        speakerSizeInch = 1.25;
        confidence = "medium";
        evidence.push("shorthand:1.25(sku)");
        driverType = driverType || "tweeter";
      }
    }
  }

  // Known SKU bump
  if (speakerSizeInch === 1.0 && compact.includes("c1100ct")) {
    confidence = "high";
    evidence.push("known:C1-100ct");
    driverType = driverType || "tweeter";
  }

  return {
    speakerSizeInch,
    speakerSizeOval,
    driverType,
    confidence,
    evidence,
  };
}