import { afterEach, describe, expect, it } from "vitest";
import { curveHeading, dipAt, featureAt, FLYOVER_HEIGHT, groundY, hillY, lateralX, liftAt, setRoadFeatures, widen } from "../src/game/physics.js";

afterEach(() => setRoadFeatures([]));

describe("road features", () => {
  it("lifts the deck over a flyover and brings it back down smoothly", () => {
    setRoadFeatures([{ type: "flyover", from: 1000, to: 1360 }]);
    expect(liftAt(990)).toBe(0);
    expect(liftAt(1180)).toBe(FLYOVER_HEIGHT);
    expect(liftAt(1055)).toBeGreaterThan(0);
    expect(liftAt(1055)).toBeLessThan(FLYOVER_HEIGHT);
    expect(hillY(1180) - groundY(1180)).toBeCloseTo(FLYOVER_HEIGHT); // land stays below
    // no sudden steps: max height change per metre stays gentle (< 10% grade)
    let worst = 0;
    for (let z = 1000; z < 1360; z++) worst = Math.max(worst, Math.abs(liftAt(z + 1) - liftAt(z)));
    expect(worst).toBeLessThan(0.1);
  });

  it("drops the land into a river valley under a bridge while the deck stays level", () => {
    setRoadFeatures([{ type: "bridge", from: 2000, to: 2300, depth: 15 }]);
    expect(dipAt(2150)).toBe(15);
    expect(hillY(2150) - groundY(2150)).toBe(15);
    expect(dipAt(1990)).toBe(0);
  });

  it("opens the median into a roundabout island and swings traffic around it", () => {
    setRoadFeatures([{ type: "roundabout", from: 3000, to: 3056, radius: 14 }]);
    expect(widen(3028)).toBeCloseTo(14);
    expect(widen(3000)).toBeCloseTo(0);
    // our side moves one way, oncoming the other, so the island fits between them
    expect(lateralX(3028, 2) - lateralX(3028, -2)).toBeLessThan(-28);
    // drivers steer around: heading changes sign across the island
    expect(Math.abs(curveHeading(3007, 2) - curveHeading(3049, 2))).toBeGreaterThan(0.5); // entry and exit swing opposite ways
    expect(featureAt(3020).type).toBe("roundabout");
    expect(featureAt(3200)).toBeNull();
  });
});
