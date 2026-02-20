export function matchProductsToVehicle(fitment, products) {
  if (!fitment || !Array.isArray(products)) return [];
function normalizeSize(size) {
  if (!size) return null;

  return String(size)
    .toLowerCase()
    .replace(/["']/g, "")
    .replace("1/2", ".5")
    .replace(" ", "")
    .replace("-", "")
    .replace("in", "");
}

  const allowedSizes = new Set();

  // Collect all speaker sizes from vehicle
  fitment.locations?.forEach((loc) => {
    loc.sizes?.forEach((s) => {
  const normalized = normalizeSize(s);
  if (normalized) allowedSizes.add(normalized);
});
  });

  return products.filter((p) => {
    // Only speakers get matched by size
    const category = (p.category || "").toLowerCase();

if (!category.includes("speaker")) return false;


    if (Array.isArray(p.speakerSizes)) {
      return p.speakerSizes.some((s) =>
  allowedSizes.has(normalizeSize(s))
        );
    }

    if (p.speakerSize) {
      return allowedSizes.has(normalizeSize(p.speakerSize));
    }

    return false;
  });
}







