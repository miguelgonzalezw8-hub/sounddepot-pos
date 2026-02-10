// client/src/utils/vehicleKey.js

export function normVehiclePart(s) {
  return String(s || "").trim().toLowerCase();
}

/**
 * Build a stable key you can store in Firestore and query via array-contains.
 * Requires year/make/model. trim optional.
 * Format: "YYYY|make|model|trim"
 */
export function makeVehicleKey({ year, make, model, trim }) {
  const y = String(year || "").trim();
  const mk = normVehiclePart(make);
  const md = normVehiclePart(model);
  const tr = normVehiclePart(trim);

  if (!y || !mk || !md) return null;
  return `${y}|${mk}|${md}|${tr}`;
}
