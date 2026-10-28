/** Lane geometry and collision helpers in road space (z along the road, x across it). */
export const LANE_WIDTH = 3.6;
export const LANES = 2;               // our carriageway; the other two lanes are oncoming
export const MEDIAN_HALF = 0.6;
export const ROAD_EDGE = MEDIAN_HALF + LANE_WIDTH * LANES; // outer edge of our carriageway
export const SHOULDER = 2.4;

/**
 * Road space: x = 0 is the median. Our carriageway is x > 0 (lane 0 = fast lane by the median,
 * lane 1 = slow lane), oncoming traffic uses x < 0.
 */
export const laneX = (lane) => MEDIAN_HALF + LANE_WIDTH * (lane + 0.5);

/** Gentle highway bends. Lateral offset of the road centre at distance z. */
export function curveX(z) {
  return Math.sin(z / 520) * 38 + Math.sin(z / 197 + 1.3) * 6;
}

export function curveHeading(z) {
  const dz = 1;
  return Math.atan2(curveX(z + dz) - curveX(z - dz), 2 * dz);
}

/** Hill amplitude along the route; the game blends it between legs so biomes never leave a step. */
let ampAt = () => 2;
export function setHillProfile(fn) {
  ampAt = fn;
}
export const BIOME_HILLS = { south: 2.5, savanna: 1.2, sahel: 1.0, plateau: 7 };

/** Rolling hills: road height at distance z. */
export function hillY(z) {
  const a = ampAt(z);
  return Math.sin(z / 310) * a + Math.sin(z / 97 + 0.7) * a * 0.25;
}

/** Axis-aligned overlap test in road space. */
export function overlaps(a, b) {
  return Math.abs(a.z - b.z) < (a.length + b.length) / 2 && Math.abs(a.x - b.x) < (a.width + b.width) / 2;
}

/** Damage from a collision, by closing speed (m/s). */
export function crashDamage(closingSpeed) {
  return Math.min(60, Math.max(4, closingSpeed * 2.2));
}
