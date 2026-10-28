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

/**
 * Road features in route z: flyovers lift the road, bridges drop the land into a river valley,
 * roundabouts widen the median into an island the carriageways swing around.
 * { type: "flyover" | "bridge" | "roundabout" | "overpass", from, to, ... }
 */
let features = [];
export function setRoadFeatures(list) {
  features = list;
}
export function featureAt(z, pad = 0) {
  return features.find((f) => z >= f.from - pad && z <= f.to + pad) ?? null;
}

const smooth = (t) => t * t * (3 - 2 * t);
export const FLYOVER_HEIGHT = 7.5;
const RAMP = 140;

/** Extra height of the road deck (flyovers). */
export function liftAt(z) {
  const f = featureAt(z);
  if (!f || f.type !== "flyover") return 0;
  const up = Math.min(1, (z - f.from) / RAMP), down = Math.min(1, (f.to - z) / RAMP);
  return FLYOVER_HEIGHT * smooth(Math.max(0, Math.min(up, down)));
}

/** How far the land drops below the road (river valleys under bridges). */
export function dipAt(z) {
  const f = featureAt(z);
  if (!f || f.type !== "bridge") return 0;
  const bank = Math.min(40, (f.to - f.from) * 0.2);
  const t = Math.min(1, (z - f.from) / bank, (f.to - z) / bank);
  return f.depth * smooth(Math.max(0, t));
}

/** Half-gap the median opens to at a roundabout (each carriageway moves out this far). */
export function widen(z) {
  const f = featureAt(z);
  if (!f || f.type !== "roundabout") return 0;
  const mid = (f.from + f.to) / 2, half = (f.to - f.from) / 2;
  const t = Math.abs(z - mid) / half;
  return t >= 1 ? 0 : f.radius * (0.5 + 0.5 * Math.cos(Math.PI * t));
}

/** World-space X of road-space x at z (x is mirrored: +x is the driver's right, world -X). */
export function lateralX(z, x) {
  return curveX(z) - x - Math.sign(x || 1) * widen(z);
}

/** Direction of travel at z for something at road-space x (bends, and the swing around a roundabout). */
export function curveHeading(z, x = 1) {
  const dz = 1;
  return Math.atan2(lateralX(z + dz, x) - lateralX(z - dz, x), 2 * dz);
}

/** Hill amplitude along the route; the game blends it between legs so biomes never leave a step. */
let ampAt = () => 2;
export function setHillProfile(fn) {
  ampAt = fn;
}
export const BIOME_HILLS = { south: 2.5, savanna: 1.2, sahel: 1.0, plateau: 7 };

/** Rolling hills: natural height of the land along the road. */
export function baseY(z) {
  const a = ampAt(z);
  return Math.sin(z / 310) * a + Math.sin(z / 97 + 0.7) * a * 0.25;
}

/** Road deck height (includes flyovers). */
export function hillY(z) {
  return baseY(z) + liftAt(z);
}

/** Ground height beside the road (river valleys dip, flyovers don't lift it). */
export function groundY(z) {
  return baseY(z) - dipAt(z);
}

/** Axis-aligned overlap test in road space. */
export function overlaps(a, b) {
  return Math.abs(a.z - b.z) < (a.length + b.length) / 2 && Math.abs(a.x - b.x) < (a.width + b.width) / 2;
}

/** Damage from a collision, by closing speed (m/s). */
export function crashDamage(closingSpeed) {
  return Math.min(60, Math.max(4, closingSpeed * 2.2));
}
