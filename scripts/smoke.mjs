// Headless smoke test: boots the built game, drives for a while, takes screenshots,
// and fails on any console error. Usage: npm run build && npm run smoke
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
// Use the project copy if installed, otherwise the machine-wide Playwright.
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require(`${execSync("npm root -g").toString().trim()}/playwright`); }
const { chromium } = pw;
import { createServer } from "vite";
import fs from "node:fs";

const out = "screenshots";
fs.mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5199 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const errors = [];
async function run(name, viewport, mobile) {
  const page = await browser.newPage({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  await page.goto("http://localhost:5199/");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${name}-1-streak.png` });
  await page.click("#modal-actions .btn");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${name}-2-menu.png` });
  await page.click(".route:not(.locked)");
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${out}/${name}-3-driving.png` });
  await page.evaluate(() => {
    const g = window.game;
    const e = g.plan.events.find((x) => x.type === "goslow");
    if (e) { g.player.z = g.legStartZ + e.z + 60; g.player.speed = 0; }
    g.timeOfDay = 18.2;
  });
  await page.keyboard.up("ArrowUp");
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${out}/${name}-6-goslow-dusk.png` });
  const canBuy = await page.isVisible("#action");
  console.log(name, "hawker buy button:", canBuy, canBuy ? await page.textContent("#action") : "");
  if (canBuy) {
    const before = await page.evaluate(() => window.game.state.stats.hawkerBuys);
    await page.click("#action");
    const after = await page.evaluate(() => window.game.state.stats.hawkerBuys);
    console.log(name, "hawker purchase recorded:", after === before + 1);
  }
  await page.evaluate(() => (window.game.timeOfDay = 9));
  // roll slowly up to the first checkpoint: the officer should flag us down
  const ev = await page.evaluate(() => {
    const g = window.game;
    const e = g.plan.events.find((x) => x.type === "checkpoint");
    g.player.z = g.legStartZ + e.z - 220;
    g.player.speed = 16;
    return e.kind;
  });
  await page.keyboard.up("ArrowUp");
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${out}/${name}-4-checkpoint-${ev}.png` });
  await page.evaluate(() => {
    const g = window.game;
    const e = g.plan.events.find((x) => x.type === "checkpoint");
    g.player.z = g.legStartZ + e.z - 40;
    g.player.speed = 4;
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${name}-5-checkpoint-dialog.png` });
  const dialogShown = await page.isVisible("#modal");
  if (!dialogShown) errors.push(`${name}: checkpoint dialog did not open`);
  for (let i = 0; i < 4 && (await page.isVisible("#modal")); i++) { await page.click("#modal-actions .btn"); await page.waitForTimeout(400); }
  const stats = await page.evaluate(() => ({ calls: window.game.renderer.info.render.calls, tris: window.game.renderer.info.render.triangles, cars: window.game.traffic.cars.length, people: window.game.actors.list.length }));
  console.log(name, JSON.stringify(stats));
  await page.close();
}
await run("desktop", { width: 1280, height: 720 }, false);
await run("phone", { width: 390, height: 844 }, true);
await browser.close();
await server.close();
if (errors.length) {
  console.error("Console errors:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("Smoke test passed");
