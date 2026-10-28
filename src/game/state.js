import { CARS, UPGRADES, SAFETY_KIT, getCar } from "../data/cars.js";
import { ROUTES } from "../data/routes.js";
import { hash, rng } from "./rng.js";

export const SAVE_KEY = "greenrev-roadtrip-v2";
export const STREAK_REWARDS = [50_000, 75_000, 100_000, 150_000, 200_000, 300_000, 500_000];

export function newState() {
  return {
    version: 2,
    coins: 250_000,
    xp: 0,
    carId: "corolla",
    owned: ["corolla"],
    upgrades: {},             // per car: { tyres, suspension, engine }
    condition: 100,           // 0..100 for the current car
    fuel: 100,
    energy: 100,              // driver energy; hawker snacks restore it
    papersValidTrips: 3,      // vehicle papers expire after N completed legs
    kit: { extinguisher: false, triangle: true, spareTyre: true, firstAid: false },
    completedRoutes: [],
    stamps: [],               // city ids visited
    bestTimes: {},            // routeId -> seconds
    stats: { km: 0, potholesHit: 0, potholesDodged: 0, checkpoints: 0, crashes: 0, hawkerBuys: 0, legs: 0, ctaClicks: 0, restStops: 0, meals: 0 },
    streak: { count: 0, lastDay: null, claimedDay: null },
    daily: { day: null, missions: [] },
    achievements: [],
    trip: null,               // in-progress route: { routeId, legIndex, startedAt, elapsed }
    settings: { sound: true, quality: "auto", camera: "chase" },
  };
}

export function load(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(SAVE_KEY);
    if (!raw) return newState();
    const parsed = JSON.parse(raw);
    const base = newState();
    return { ...base, ...parsed, stats: { ...base.stats, ...parsed.stats }, kit: { ...base.kit, ...parsed.kit }, settings: { ...base.settings, ...parsed.settings } };
  } catch {
    return newState();
  }
}

export function save(state, storage = globalThis.localStorage) {
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    /* private mode / quota: play on without saving */
  }
}

export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
const prevDay = (key) => dayKey(new Date(Date.parse(`${key}T00:00:00Z`) - 86400000));

/**
 * Daily check-in. Consecutive days grow the streak (rewards escalate for 7 days, then repeat);
 * missing a day resets it. Returns the reward to show, or null if already claimed today.
 */
export function checkIn(state, today = dayKey()) {
  const s = state.streak;
  if (s.claimedDay === today) return null;
  s.count = s.lastDay === prevDay(today) ? s.count + 1 : 1;
  s.lastDay = today;
  s.claimedDay = today;
  const reward = STREAK_REWARDS[(s.count - 1) % STREAK_REWARDS.length];
  state.coins += reward;
  return { day: s.count, reward, nextReward: STREAK_REWARDS[s.count % STREAK_REWARDS.length] };
}

const MISSION_POOL = [
  { id: "dodge", text: "Dodge {n} potholes", stat: "potholesDodged", n: [8, 15], reward: 60_000 },
  { id: "hawker", text: "Buy from {n} roadside hawkers", stat: "hawkerBuys", n: [2, 4], reward: 40_000 },
  { id: "checkpoint", text: "Clear {n} checkpoints with your papers in order", stat: "checkpoints", n: [2, 4], reward: 70_000 },
  { id: "km", text: "Drive {n} km", stat: "km", n: [40, 120], reward: 80_000 },
  { id: "legs", text: "Arrive in {n} new towns", stat: "legs", n: [1, 3], reward: 90_000 },
  { id: "nocrash", text: "Finish a leg without crashing", stat: "cleanLegs", n: [1, 1], reward: 100_000 },
  { id: "greenrev", text: "Check out GreenRev Marketplace", stat: "ctaClicks", n: [1, 1], reward: 50_000 },
  { id: "rest", text: "Take a break at {n} rest stops", stat: "restStops", n: [1, 2], reward: 45_000 },
];

/** Three missions per day, the same for everyone on that date. Progress counts from the day's start. */
export function dailyMissions(state, today = dayKey()) {
  if (state.daily.day === today) return state.daily.missions;
  const r = rng(hash(`missions-${today}`));
  const pool = [...MISSION_POOL];
  const missions = [];
  while (missions.length < 3) {
    const m = pool.splice(Math.floor(r.next() * pool.length), 1)[0];
    const n = r.int(m.n[0], m.n[1]);
    missions.push({ id: m.id, text: m.text.replace("{n}", n), stat: m.stat, target: n, base: state.stats[m.stat] ?? 0, reward: m.reward, done: false });
  }
  state.daily = { day: today, missions };
  return missions;
}

/** Mark finished missions and pay them out. Returns newly completed missions. */
export function updateMissions(state) {
  const done = [];
  for (const m of state.daily.missions) {
    if (m.done) continue;
    if ((state.stats[m.stat] ?? 0) - m.base >= m.target) {
      m.done = true;
      state.coins += m.reward;
      state.xp += 50;
      done.push(m);
    }
  }
  return done;
}

export function addStat(state, key, amount = 1) {
  state.stats[key] = (state.stats[key] ?? 0) + amount;
}

export const level = (xp) => Math.floor(Math.sqrt(xp / 100)) + 1;

export function isRouteUnlocked(state, route) {
  return !route.unlockedBy || state.completedRoutes.includes(route.unlockedBy);
}

export function availableRoutes(state) {
  return ROUTES.map((r) => ({ ...r, unlocked: isRouteUnlocked(state, r), completed: state.completedRoutes.includes(r.id) }));
}

// ------------------------------------------------------------------ economy

export function spend(state, amount) {
  if (state.coins < amount) return false;
  state.coins -= amount;
  return true;
}

export function buyCar(state, carId) {
  const car = CARS.find((c) => c.id === carId);
  if (!car) return { ok: false, reason: "Unknown car" };
  if (state.owned.includes(carId)) {
    state.carId = carId;
    return { ok: true, switched: true };
  }
  if (!spend(state, car.price)) return { ok: false, reason: `You need ₦${(car.price - state.coins).toLocaleString()} more` };
  state.owned.push(carId);
  state.carId = carId;
  state.condition = 100;
  return { ok: true };
}

export function upgradeCost(state, key) {
  const cur = state.upgrades[state.carId]?.[key] ?? 0;
  const next = UPGRADES[key].levels[cur + 1];
  return next === undefined ? null : next;
}

export function buyUpgrade(state, key) {
  const cost = upgradeCost(state, key);
  if (cost === null) return { ok: false, reason: "Already maxed" };
  if (!spend(state, cost)) return { ok: false, reason: "Not enough money" };
  const ups = (state.upgrades[state.carId] ??= {});
  ups[key] = (ups[key] ?? 0) + 1;
  return { ok: true };
}

export function buyKit(state, item) {
  if (state.kit[item]) return { ok: false, reason: "Already have it" };
  if (!spend(state, SAFETY_KIT[item].price)) return { ok: false, reason: "Not enough money" };
  state.kit[item] = true;
  return { ok: true };
}

/** City services. Prices scale with the car's value so a Land Cruiser costs more to fix. */
export function servicePrices(state) {
  const car = getCar(state.carId);
  const factor = 1 + car.price / 40_000_000;
  return {
    refuel: Math.round((100 - state.fuel) * 900 * (0.7 + car.tank)),
    repair: Math.round((100 - state.condition) * 4_500 * factor),
    papers: 45_000,
  };
}

export function refuel(state) {
  const { refuel: cost } = servicePrices(state);
  if (!spend(state, cost)) return false;
  state.fuel = 100;
  return true;
}

export function repair(state, discount = 0) {
  const cost = Math.round(servicePrices(state).repair * (1 - discount));
  if (!spend(state, cost)) return false;
  state.condition = 100;
  return true;
}

export function renewPapers(state) {
  if (!spend(state, servicePrices(state).papers)) return false;
  state.papersValidTrips = 6;
  return true;
}

/** Earnings for finishing a leg. */
export function legPayout(leg, { crashes, checkpointsCleared, potholesHit, seconds }) {
  const base = 40_000 + leg.km * 900;
  const clean = crashes === 0 ? 60_000 : 0;
  const law = checkpointsCleared * 15_000;
  const roadPenalty = Math.min(base * 0.4, potholesHit * 4_000);
  return { base, clean, law, roadPenalty: -Math.round(roadPenalty), total: Math.round(base + clean + law - roadPenalty), seconds };
}

const ACHIEVEMENTS = [
  { id: "first-leg", name: "Off you go", test: (s) => s.stats.legs >= 1 },
  { id: "niger", name: "Crossed the Niger", test: (s) => s.stamps.includes("jebba") || s.stamps.includes("onitsha") },
  { id: "capital", name: "FCT, here I come", test: (s) => s.stamps.includes("abuja") },
  { id: "north", name: "Arewa traveller", test: (s) => s.stamps.includes("kano") },
  { id: "carnival", name: "Calabar Carnival", test: (s) => s.stamps.includes("calabar") },
  { id: "plateau", name: "Cool on the Plateau", test: (s) => s.stamps.includes("jos") },
  { id: "sahel", name: "Home of Peace", test: (s) => s.stamps.includes("maiduguri") },
  { id: "pothole-ninja", name: "Pothole ninja (100 dodged)", test: (s) => s.stats.potholesDodged >= 100 },
  { id: "law-abiding", name: "Papers always correct (20 checkpoints)", test: (s) => s.stats.checkpoints >= 20 },
  { id: "1000km", name: "1,000 km on Naija roads", test: (s) => s.stats.km >= 1000 },
  { id: "garage", name: "Upgraded your ride", test: (s) => s.owned.length >= 2 },
  { id: "streak7", name: "7-day streak", test: (s) => s.streak.count >= 7 },
  { id: "food-tour", name: "Naija food tour (10 roadside meals)", test: (s) => (s.stats.meals ?? 0) >= 10 },
];

export function checkAchievements(state) {
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (!state.achievements.includes(a.id) && a.test(state)) {
      state.achievements.push(a.id);
      state.xp += 100;
      fresh.push(a);
    }
  }
  return fresh;
}

export const ACHIEVEMENT_LIST = ACHIEVEMENTS.map(({ id, name }) => ({ id, name }));
