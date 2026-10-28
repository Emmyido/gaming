import { legLengthMeters } from "../data/routes.js";
import { rng } from "./rng.js";

/**
 * Lays out everything that happens on a leg, deterministically from its seed:
 * potholes, checkpoints, go-slow jams (with hawkers), animal crossings, speed traps,
 * filling stations and GreenRev billboards. Positions are metres from the start of the leg.
 */
export function planLeg(leg, seed) {
  const r = rng(seed);
  const length = legLengthMeters(leg.km);
  const events = [];
  const potholes = [];
  const busy = []; // [start, end] spans already used by stopping events

  const free = (z, pad = 180) => !busy.some(([a, b]) => z > a - pad && z < b + pad);
  const place = (min, max, tries = 30) => {
    for (let i = 0; i < tries; i++) {
      const z = r.range(min, max);
      if (free(z)) return z;
    }
    return null;
  };

  // City go-slow at the start/end of busy legs
  if (leg.goSlowAtStart) {
    events.push({ type: "goslow", z: 120, length: r.range(380, 520) });
    busy.push([100, 650]);
  }
  if (leg.goSlowAtEnd) {
    const z = length - r.range(650, 800);
    events.push({ type: "goslow", z, length: r.range(380, 500) });
    busy.push([z, z + 520]);
  }
  // Bridges, flyovers, roundabouts and overpasses. Kept >= 1 km into the leg so they are planned
  // before the road there is built, and clear of each other and of stopping events.
  const features = [];
  const addFeature = (f, padBusy = 60) => {
    features.push(f);
    busy.push([f.from - padBusy, f.to + padBusy]);
    events.push({ type: "feature", z: f.from, feature: f });
  };
  if (leg.bridge) {
    const z = place(Math.max(1000, length * 0.42), Math.max(1100, length * 0.6));
    if (z !== null) addFeature({ type: "bridge", from: z, to: z + 300, depth: 15, name: leg.bridge, style: leg.bridge.includes("Second Niger") ? "cable" : "truss" });
  }

  // Checkpoints by type, from the leg's security profile
  const kinds = [];
  for (const [kind, count] of Object.entries(leg.security)) for (let i = 0; i < count; i++) kinds.push(kind);
  for (const kind of kinds) {
    const z = place(400, length - 500);
    if (z === null) continue;
    events.push({ type: "checkpoint", kind, z });
    busy.push([z - 120, z + 60]);
  }

  if ((leg.goSlowAtEnd || leg.goSlowAtStart || leg.traffic > 0.65) && r.chance(0.9)) {
    const z = place(1000, length - 500);
    if (z !== null) addFeature({ type: "flyover", from: z, to: z + 360, name: r.pick(["Junction flyover", "Interchange flyover", "Market flyover"]) });
  }

  // A mid-route jam on busy roads (accident, broken-down trailer, market day)
  if (r.chance(leg.traffic * 0.8)) {
    const z = place(length * 0.3, length * 0.7);
    if (z !== null) {
      const cause = r.pick(["broken-down trailer", "market day", "fallen tanker cleared by FRSC", "road works"]);
      events.push({ type: "goslow", z, length: r.range(250, 380), cause });
      busy.push([z, z + 400]);
    }
  }

  // FRSC speed trap (radar) on good roads
  if (leg.quality > 0.45 && r.chance(0.7)) {
    const z = place(300, length - 400);
    if (z !== null) events.push({ type: "speedtrap", z, limit: 100 });
  }

  // Animals crossing: cattle in the north, goats everywhere
  const animalCount = leg.biome === "sahel" || leg.biome === "savanna" ? r.int(1, 2) : r.int(0, 1);
  for (let i = 0; i < animalCount; i++) {
    const z = place(300, length - 300);
    if (z === null) continue;
    events.push({ type: "animals", kind: leg.biome === "south" ? "goats" : r.pick(["cattle", "goats", "cattle"]), z });
    busy.push([z - 60, z + 60]);
  }

  // Other road features take the space left after checkpoints and animal crossings
  const creekChance = { south: 0.7, savanna: 0.5, plateau: 0.45, sahel: 0.25 }[leg.biome] ?? 0.4;
  if (r.chance(creekChance)) {
    const z = place(1000, length - 400);
    if (z !== null) {
      const len = Math.round(r.range(70, 110));
      addFeature({ type: "bridge", from: z, to: z + len, depth: 6, name: r.pick(["River crossing", "Creek bridge", "Stream crossing"]), style: "beam" });
    }
  }
  if (r.chance(0.75)) {
    const z = place(1000, length - 250);
    if (z !== null) addFeature({ type: "roundabout", from: z, to: z + 56, radius: 14, name: r.pick(["Unity Roundabout", "Independence Roundabout", "Eagle Square Roundabout", "Gate Roundabout", "Clock Tower Roundabout"]) });
  }
  if (r.chance(0.5)) {
    const z = place(1000, length - 200);
    if (z !== null) addFeature({ type: "overpass", from: z - 6, to: z + 6 }, 30);
  }
  features.sort((a, b) => a.from - b.from);

  // Filling station roughly mid-leg
  const fz = place(length * 0.4, length * 0.6);
  if (fz !== null) events.push({ type: "fuel", z: fz });

  // GreenRev billboards (pure scenery + optional tap)
  const boards = ["mechanic", "marketplace", "dealer", "parts"];
  for (let z = 250; z < length - 200; z += r.range(500, 800)) events.push({ type: "billboard", z, ad: r.pick(boards), side: r.pick([-1, 1]) });

  // Potholes: density from road quality, clustered in "bad patches"
  const density = (1 - leg.quality) * 0.035 + 0.004; // per metre
  let z = 200;
  while (z < length - 120) {
    const badPatch = r.chance(1 - leg.quality) ? r.range(1.5, 3) : 1;
    z += r.range(8, 2 / (density * badPatch));
    if (z > length - 120) break;
    if (!free(z, 30)) continue;
    potholes.push({ z, lane: r.pick([0, 1, r.range(-0.4, 1.4)]), radius: r.range(0.55, 1.25), deep: r.chance(0.25) });
  }

  // Roadside breakdown story beat: a car with hazard lights and a mechanic under it
  if (r.chance(0.6)) {
    const bz = place(500, length - 500);
    if (bz !== null) events.push({ type: "breakdown-scene", z: bz });
  }

  events.sort((a, b) => a.z - b.z);
  return { length, events, potholes, features };
}
