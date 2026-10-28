/**
 * Garage. Stats are 0..1 and feed the driving model; price in in-game naira (not real money).
 * `marketplace` deep-links the "see the real one on GreenRev" button.
 */
export const CARS = [
  { id: "corolla", name: "Toyota Corolla 2008", tag: "Tokunbo starter", body: "sedan", color: "#c9ced6", price: 0, topSpeed: 0.55, accel: 0.55, handling: 0.6, toughness: 0.5, tank: 0.6, marketplace: "toyota corolla" },
  { id: "accord", name: "Honda Accord 2005 'Evil Spirit'", tag: "Fast & loved", body: "sedan", color: "#1d1f24", price: 4_500_000, topSpeed: 0.72, accel: 0.7, handling: 0.62, toughness: 0.45, tank: 0.6, marketplace: "honda accord" },
  { id: "innoson", name: "Innoson IVM G5", tag: "Made in Nigeria", body: "suv", color: "#e8e8e8", price: 9_000_000, topSpeed: 0.62, accel: 0.55, handling: 0.6, toughness: 0.75, tank: 0.75, marketplace: "innoson" },
  { id: "hilux", name: "Toyota Hilux", tag: "Pothole crusher", body: "pickup", color: "#8b0000", price: 14_000_000, topSpeed: 0.6, accel: 0.55, handling: 0.5, toughness: 0.95, tank: 0.85, marketplace: "toyota hilux" },
  { id: "rx350", name: "Lexus RX 350", tag: "Big man jeep", body: "suv", color: "#0b2545", price: 22_000_000, topSpeed: 0.85, accel: 0.78, handling: 0.75, toughness: 0.7, tank: 0.8, marketplace: "lexus rx 350" },
  { id: "landcruiser", name: "Toyota Land Cruiser V8", tag: "Oga at the top", body: "suv", color: "#f4f4f4", price: 55_000_000, topSpeed: 0.92, accel: 0.8, handling: 0.72, toughness: 0.95, tank: 1, marketplace: "land cruiser" },
];

export const UPGRADES = {
  tyres: { name: "New tyres", levels: [0, 350_000, 800_000, 1_600_000], effect: "More grip, fewer blowouts" },
  suspension: { name: "Suspension", levels: [0, 500_000, 1_200_000, 2_500_000], effect: "Potholes hurt less" },
  engine: { name: "Engine tune", levels: [0, 900_000, 2_000_000, 4_500_000], effect: "Higher top speed" },
};

/** Road-safety kit FRSC checks. Buying it is the in-game nudge towards GreenRev parts vendors. */
export const SAFETY_KIT = {
  extinguisher: { name: "Fire extinguisher", price: 25_000 },
  triangle: { name: "Warning triangle", price: 8_000 },
  spareTyre: { name: "Spare tyre", price: 60_000 },
  firstAid: { name: "First-aid box", price: 12_000 },
};

export function getCar(id) {
  return CARS.find((c) => c.id === id) ?? CARS[0];
}

/** Convert 0..1 stats into driving numbers (m/s etc.), including upgrades. */
export function carPhysics(car, upgrades = {}) {
  const lvl = (k) => upgrades[k] ?? 0;
  return {
    topSpeed: 30 + car.topSpeed * 18 + lvl("engine") * 2.2, // m/s (≈ 108–180 km/h)
    accel: 5 + car.accel * 6,
    brake: 16,
    steer: 6 + car.handling * 5 + lvl("tyres") * 0.6,
    potholeDamage: (1.15 - car.toughness * 0.7) * (1 - lvl("suspension") * 0.18),
    fuelUse: 0.012 / (0.6 + car.tank * 0.6),
  };
}
