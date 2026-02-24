export function matchProductsToVehicle(fitment, products) {
  if (!fitment || !Array.isArray(products)) return [];

  function normalizeSize(size) {
    if (!size) return null;

    let s = String(size)
      .toLowerCase()
      .replace(/["']/g, "")
      .replace(/×/g, "x")
      .replace(/\s+/g, "")
      .replace(/-/g, "")
      .replace(/inches?|in\b/g, "");

    s = s.replace(/1\/2/g, ".5").replace(/1\/4/g, ".25").replace(/3\/4/g, ".75");

    const mmMatch = s.match(/^(\d{2,3})mm$/);
    if (mmMatch) {
      const mm = Number(mmMatch[1]);
      if (mm >= 160 && mm <= 175) return "6.5";
      if (mm >= 125 && mm <= 139) return "5.25";
      if (mm >= 95 && mm <= 110) return "4";
      if (mm >= 85 && mm <= 94) return "3.5";
      if (mm >= 55 && mm <= 69) return "2.75";
      return String(mm);
    }

    return s || null;
  }

  const allowedSizes = new Set();

  // ✅ Schema A: fitment.locations[].sizes[]
  if (Array.isArray(fitment.locations)) {
    fitment.locations.forEach((loc) => {
      (loc?.sizes || []).forEach((sz) => {
        const n = normalizeSize(sz);
        if (n) allowedSizes.add(n);
      });

      // some datasets use loc.size instead of loc.sizes
      if (loc?.size) {
        const n = normalizeSize(loc.size);
        if (n) allowedSizes.add(n);
      }
    });
  }

  // ✅ Schema B: fitment.speakers.front/rear/other[].size
  const allSpeakers = [
    ...(fitment?.speakers?.front || []),
    ...(fitment?.speakers?.rear || []),
    ...(fitment?.speakers?.other || []),
  ];

  allSpeakers.forEach((sp) => {
    const n = normalizeSize(sp?.size);
    if (n) allowedSizes.add(n);
  });

  // If we still don't have any sizes, nothing can match by size
  if (allowedSizes.size === 0) return [];
console.log("FITMENT allowedSizes:", [...allowedSizes]);
  return products.filter((p) => {
    const category = (p.category || "").toLowerCase();

    // ✅ allow matches if it looks speaker-ish OR already has speaker size fields
    const isSpeakerish =
      category.includes("speaker") ||
      category.includes("speakers") ||
      category.includes("component") ||
      category.includes("coax") ||
      category.includes("coaxial") ||
      !!p.speakerSize ||
      (Array.isArray(p.speakerSizes) && p.speakerSizes.length);

    if (!isSpeakerish) return false;

    if (Array.isArray(p.speakerSizes)) {
      return p.speakerSizes.some((s) => allowedSizes.has(normalizeSize(s)));
    }

    if (p.speakerSize) {
      return allowedSizes.has(normalizeSize(p.speakerSize));
    }

    return false;
  });
}