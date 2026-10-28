import { describe, expect, it } from "vitest";
import * as S from "../src/game/state.js";
import { ROUTES } from "../src/data/routes.js";

const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};

describe("daily streak", () => {
  it("grows on consecutive days, resets after a gap, and pays once per day", () => {
    const s = S.newState();
    const start = s.coins;
    expect(S.checkIn(s, "2026-10-01")).toMatchObject({ day: 1, reward: 50_000 });
    expect(S.checkIn(s, "2026-10-01")).toBeNull();
    expect(S.checkIn(s, "2026-10-02")).toMatchObject({ day: 2, reward: 75_000 });
    expect(S.checkIn(s, "2026-10-03")).toMatchObject({ day: 3 });
    expect(S.checkIn(s, "2026-10-05")).toMatchObject({ day: 1 }); // missed the 4th
    expect(s.coins).toBe(start + 50_000 + 75_000 + 100_000 + 50_000);
  });

  it("cycles the 7-day reward ladder", () => {
    const s = S.newState();
    const rewards = [];
    for (let d = 1; d <= 8; d++) rewards.push(S.checkIn(s, `2026-11-${String(d).padStart(2, "0")}`).reward);
    expect(rewards).toEqual([...S.STREAK_REWARDS, S.STREAK_REWARDS[0]]);
  });
});

describe("daily missions", () => {
  it("are the same for everyone on a date and count progress from that day", () => {
    const a = S.newState(), b = S.newState();
    a.stats.potholesDodged = 500;
    expect(S.dailyMissions(a, "2026-10-28").map((m) => m.id)).toEqual(S.dailyMissions(b, "2026-10-28").map((m) => m.id));
    expect(S.dailyMissions(a, "2026-10-28")).toHaveLength(3);
    const m = a.daily.missions[0];
    expect(S.updateMissions(a)).toHaveLength(0); // old stats do not count
    const coins = a.coins;
    a.stats[m.stat] = (a.stats[m.stat] ?? 0) + m.target;
    expect(S.updateMissions(a).map((x) => x.id)).toEqual([m.id]);
    expect(a.coins).toBe(coins + m.reward);
    expect(S.updateMissions(a)).toHaveLength(0); // paid once
  });
});

describe("economy", () => {
  it("buys cars and upgrades only with enough money", () => {
    const s = S.newState();
    s.coins = 5_000_000;
    expect(S.buyCar(s, "rx350").ok).toBe(false);
    expect(S.buyCar(s, "accord")).toEqual({ ok: true });
    expect(s.carId).toBe("accord");
    expect(s.coins).toBe(500_000);
    expect(S.buyUpgrade(s, "tyres").ok).toBe(true);
    expect(S.upgradeCost(s, "tyres")).toBe(800_000);
    expect(S.buyUpgrade(s, "tyres").ok).toBe(false);
    expect(S.buyCar(s, "corolla")).toEqual({ ok: true, switched: true });
  });

  it("prices services by damage and car value", () => {
    const s = S.newState();
    s.condition = 50;
    const cheap = S.servicePrices(s).repair;
    s.carId = "landcruiser";
    expect(S.servicePrices(s).repair).toBeGreaterThan(cheap);
    s.condition = 100;
    expect(S.servicePrices(s).repair).toBe(0);
  });

  it("pays more for clean, lawful driving", () => {
    const leg = ROUTES[0].legs[0];
    const clean = S.legPayout(leg, { crashes: 0, checkpointsCleared: 2, potholesHit: 0, seconds: 100 });
    const messy = S.legPayout(leg, { crashes: 2, checkpointsCleared: 0, potholesHit: 30, seconds: 100 });
    expect(clean.total).toBeGreaterThan(messy.total);
    expect(messy.roadPenalty).toBeLessThan(0);
  });
});

describe("progression", () => {
  it("unlocks northern routes after Lagos → Abuja", () => {
    const s = S.newState();
    const locked = S.availableRoutes(s).filter((r) => !r.unlocked).map((r) => r.id);
    expect(locked).toEqual(["abuja-kano", "abuja-jos", "kano-maiduguri"]);
    s.completedRoutes.push("lagos-abuja");
    expect(S.availableRoutes(s).find((r) => r.id === "abuja-kano").unlocked).toBe(true);
    expect(S.availableRoutes(s).find((r) => r.id === "kano-maiduguri").unlocked).toBe(false);
  });

  it("awards achievements once", () => {
    const s = S.newState();
    s.stamps.push("abuja", "calabar");
    expect(S.checkAchievements(s).map((a) => a.id)).toEqual(["capital", "carnival"]);
    expect(S.checkAchievements(s)).toHaveLength(0);
  });

  it("saves and loads, surviving corrupt data", () => {
    const st = memory();
    const s = S.newState();
    s.coins = 123;
    S.save(s, st);
    expect(S.load(st).coins).toBe(123);
    st.setItem(S.SAVE_KEY, "{not json");
    expect(S.load(st).coins).toBe(S.newState().coins);
  });
});
