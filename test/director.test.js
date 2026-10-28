import { describe, expect, it } from "vitest";
import { planLeg } from "../src/game/director.js";
import { ROUTES, CITIES, legLengthMeters } from "../src/data/routes.js";
import { CARS, carPhysics } from "../src/data/cars.js";
import { overlaps, laneX, ROAD_EDGE } from "../src/game/physics.js";

describe("routes data", () => {
  it("chains legs city to city with known cities", () => {
    for (const r of ROUTES) {
      r.legs.forEach((leg, i) => {
        expect(CITIES[leg.from], `${r.id} ${leg.from}`).toBeTruthy();
        expect(CITIES[leg.to], `${r.id} ${leg.to}`).toBeTruthy();
        if (i > 0) expect(leg.from).toBe(r.legs[i - 1].to);
      });
    }
    expect(ROUTES.map((r) => r.id)).toEqual(["lagos-abuja", "lagos-calabar", "abuja-kano", "abuja-jos", "kano-maiduguri"]);
  });

  it("keeps every leg between ~1.5 and 5 minutes of driving", () => {
    for (const r of ROUTES) for (const leg of r.legs) {
      const m = legLengthMeters(leg.km);
      expect(m).toBeGreaterThanOrEqual(1600);
      expect(m).toBeLessThanOrEqual(4800);
    }
  });
});

describe("event director", () => {
  const lagosIbadan = ROUTES[0].legs[0];

  it("is deterministic per seed and different across days", () => {
    expect(planLeg(lagosIbadan, "a")).toEqual(planLeg(lagosIbadan, "a"));
    expect(planLeg(lagosIbadan, "a").potholes).not.toEqual(planLeg(lagosIbadan, "b").potholes);
  });

  it("places the expected checkpoints and Lagos go-slow without overlaps", () => {
    for (let i = 0; i < 25; i++) {
      const plan = planLeg(lagosIbadan, `seed-${i}`);
      const kinds = plan.events.filter((e) => e.type === "checkpoint").map((e) => e.kind).sort();
      expect(kinds.length).toBeGreaterThanOrEqual(2);
      expect(plan.events[0]).toMatchObject({ type: "goslow", z: 120 });
      const stops = plan.events.filter((e) => e.type === "checkpoint");
      for (let a = 0; a < stops.length; a++) for (let b = a + 1; b < stops.length; b++) expect(Math.abs(stops[a].z - stops[b].z)).toBeGreaterThan(150);
      for (const e of plan.events) expect(e.z).toBeLessThan(plan.length);
    }
  });

  it("makes bad roads much worse than good ones", () => {
    const good = { ...lagosIbadan, quality: 0.9, goSlowAtStart: false };
    const bad = { ...lagosIbadan, quality: 0.2, goSlowAtStart: false };
    let g = 0, b = 0;
    for (let i = 0; i < 10; i++) {
      g += planLeg(good, `q${i}`).potholes.length;
      b += planLeg(bad, `q${i}`).potholes.length;
    }
    expect(b).toBeGreaterThan(g * 2.5);
  });

  it("sends cattle across northern roads and military to the North-East", () => {
    const maiduguri = ROUTES.find((r) => r.id === "kano-maiduguri").legs[2];
    const plan = planLeg(maiduguri, "x");
    expect(plan.events.filter((e) => e.type === "checkpoint" && e.kind === "military").length).toBeGreaterThanOrEqual(2);
    let cattle = 0;
    for (let i = 0; i < 10; i++) cattle += planLeg(maiduguri, `c${i}`).events.filter((e) => e.type === "animals" && e.kind === "cattle").length;
    expect(cattle).toBeGreaterThan(3);
  });
});

describe("cars & physics", () => {
  it("makes tougher cars and suspension take less pothole damage", () => {
    const corolla = carPhysics(CARS[0]);
    const hilux = carPhysics(CARS.find((c) => c.id === "hilux"));
    expect(hilux.potholeDamage).toBeLessThan(corolla.potholeDamage);
    expect(carPhysics(CARS[0], { suspension: 3 }).potholeDamage).toBeLessThan(corolla.potholeDamage);
    expect(carPhysics(CARS.at(-1)).topSpeed).toBeGreaterThan(corolla.topSpeed);
  });

  it("puts both lanes inside our carriageway and detects collisions", () => {
    expect(laneX(0)).toBeGreaterThan(0);
    expect(laneX(1)).toBeLessThan(ROAD_EDGE);
    const a = { z: 0, x: laneX(1), length: 4.5, width: 1.8 };
    expect(overlaps(a, { z: 4, x: laneX(1), length: 4.5, width: 1.8 })).toBe(true);
    expect(overlaps(a, { z: 4, x: laneX(0), length: 4.5, width: 1.8 })).toBe(false);
  });
});
