// utils/componentMatcher.js

export function isComponentCompatible(vehicle, product) {
  if (!product.component) return false;

  const door = vehicle.locations.find(
    l => l.role === "Door"
  );

  const tweeter = vehicle.locations.find(
    l => l.role.toLowerCase().includes("tweeter")
  );

  if (!door || !tweeter) return false;

  const midMatch = door.sizes.includes(product.component.midSize);
  const tweeterMatch = tweeter.sizes.includes(product.component.tweeterSize);

  return midMatch && tweeterMatch;
}







