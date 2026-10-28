// Screenshot tour of every region (for reviews / store listings). npm run build first.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { createServer } from "vite";
import fs from "node:fs";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require(`${execSync("npm root -g").toString().trim()}/playwright`); }
fs.mkdirSync("screenshots", { recursive: true });
const server = await createServer({ server: { port: 5198 }, logLevel: "error" });
await server.listen();
const browser = await pw.chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(() => {
  localStorage.setItem("greenrev-roadtrip-v2", JSON.stringify({ completedRoutes: ["lagos-abuja", "abuja-kano"], streak: { count: 3, lastDay: new Date().toISOString().slice(0, 10), claimedDay: new Date().toISOString().slice(0, 10) } }));
});
await page.goto("http://localhost:5198/");
await page.waitForTimeout(1500);

const shots = [
  { route: "lagos-calabar", leg: 1, find: "checkpoint", offset: -70, time: 10, rain: true, name: "south-rain-checkpoint" },
  { route: "kano-maiduguri", leg: 0, find: "animals", offset: -110, time: 16, name: "sahel-cattle" },
  { route: "abuja-jos", leg: 2, find: null, offset: 900, time: 7.2, name: "plateau-morning" },
  { route: "lagos-abuja", leg: 2, find: "billboard", offset: -60, time: 20.5, name: "savanna-night" },
];
for (const s of shots) {
  await page.evaluate(async (s) => {
    const g = window.game;
    g.state.trip = { routeId: s.route, legIndex: s.leg, elapsed: 0 };
    await g.startRoute(s.route);
  }, s);
  await page.waitForTimeout(800);
  await page.evaluate((s) => {
    const g = window.game;
    const e = s.find ? g.plan.events.find((x) => x.type === s.find) : null;
    g.player.z = g.legStartZ + (e ? e.z : 0) + s.offset;
    g.player.speed = 9;
    g.timeOfDay = s.time;
    if (s.rain) g.world.setRain(true);
  }, s);
  await page.waitForTimeout(3500);
  await page.evaluate((t) => (window.game.timeOfDay = t), s.time);
  await page.screenshot({ path: `screenshots/tour-${s.name}.png` });
  await page.evaluate(() => {
    document.querySelectorAll("#modal-actions .btn").forEach((b) => b.click());
    window.game.mode = "menu";
  });
}
await browser.close();
await server.close();
console.log("tour done");
