// Screenshots of bridges, flyovers, overpasses and roundabouts. npm run build first.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { createServer } from "vite";
import fs from "node:fs";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require(`${execSync("npm root -g").toString().trim()}/playwright`); }
fs.mkdirSync("screenshots", { recursive: true });
const server = await createServer({ server: { port: 5197 }, logLevel: "error" });
await server.listen();
const browser = await pw.chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.addInitScript(() => {
  const today = new Date().toISOString().slice(0, 10);
  localStorage.setItem("greenrev-roadtrip-v2", JSON.stringify({ completedRoutes: ["lagos-abuja", "abuja-kano"], streak: { count: 1, lastDay: today, claimedDay: today } }));
});
await page.goto("http://localhost:5197/");
await page.waitForTimeout(1200);

// find a leg with each feature type for today's seed
const wanted = ["bridge:truss", "bridge:cable", "bridge:beam", "flyover", "roundabout", "overpass"];
for (const want of wanted) {
  const found = await page.evaluate(async (want) => {
    const g = window.game;
    const { ROUTES } = await import("/src/data/routes.js");
    const { planLeg } = await import("/src/game/director.js");
    const S = await import("/src/game/state.js");
    for (const r of ROUTES) for (let i = 0; i < r.legs.length; i++) {
      const plan = planLeg(r.legs[i], `${r.id}-${i}-${S.dayKey()}`);
      const f = plan.features.find((f) => (f.style ? `${f.type}:${f.style}` : f.type) === want);
      if (f) {
        g.state.trip = { routeId: r.id, legIndex: i, elapsed: 0 };
        await g.startRoute(r.id);
        return { route: r.id, leg: i, from: f.from, to: f.to, type: f.type };
      }
    }
    return null;
  }, want);
  if (!found) { console.log("no", want, "today"); continue; }
  for (const [label, frac, cam] of [["approach", -0.6, "chase"], ["on", 0.45, want.startsWith("bridge") ? "cinematic" : "chase"]]) {
    await page.evaluate(({ f, frac, cam }) => {
      const g = window.game;
      const len = f.to - f.from;
      g.player.z = g.legStartZ + f.from + (frac < 0 ? -Math.max(120, len * 0.5) : len * frac);
      g.player.speed = 12;
      g.cameraMode = cam;
      g.timeOfDay = 10;
    }, { f: found, frac, cam });
    await page.waitForTimeout(2200);
    await page.evaluate(() => document.querySelectorAll("#modal-actions .btn").forEach((b) => b.click()));
    await page.screenshot({ path: `screenshots/feature-${want.replace(":", "-")}-${label}.png` });
  }
  console.log("shot", want, found.route, found.leg);
  await page.evaluate(() => { window.game.mode = "menu"; });
}
await browser.close();
await server.close();
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
