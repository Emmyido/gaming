// Screenshots of a rest stop, "Advertise here" boards, a sponsored board and the booking panel.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { createServer } from "vite";
import fs from "node:fs";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require(`${execSync("npm root -g").toString().trim()}/playwright`); }
fs.mkdirSync("screenshots", { recursive: true });
const server = await createServer({ server: { port: 5196 }, logLevel: "error" });
await server.listen();
const browser = await pw.chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
for (const [name, viewport] of [["desktop", { width: 1280, height: 720 }], ["phone", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.addInitScript(() => {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem("greenrev-roadtrip-v2", JSON.stringify({ streak: { count: 1, lastDay: today, claimedDay: today }, energy: 40, fuel: 50 }));
  });
  await page.goto("http://localhost:5196/");
  await page.waitForTimeout(1200);
  await page.evaluate(async (name) => {
    const g = window.game;
    const today = new Date().toISOString().slice(0, 10);
    // a sponsored campaign using the template image (same origin)
    // phone: a sponsored campaign using the template image; desktop: no campaigns, so "Advertise here" shows
    g.campaigns = name === "phone" ? [{ id: "demo", advertiser: "Demo Advertiser", image: "/ad-template.png", link: "https://example.com", start: today, end: today }] : [];
    await g.startRoute("lagos-abuja");
  }, name);
  await page.waitForTimeout(600);
  // approach the rest stop
  await page.evaluate(() => {
    const g = window.game;
    const e = g.plan.events.find((x) => x.type === "reststop");
    g.player.z = g.legStartZ + e.z - 90;
    g.player.speed = 8;
    g.timeOfDay = 11;
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `screenshots/stop-${name}-1-approach.png` });
  await page.evaluate(() => {
    const g = window.game;
    const e = g.plan.events.find((x) => x.type === "reststop");
    g.player.z = g.legStartZ + e.z + 5;
    g.player.speed = 0;
  });
  await page.waitForTimeout(800);
  // teleporting past a checkpoint can open a "you ran a checkpoint" dialog; dismiss it
  for (let i = 0; i < 4 && (await page.isVisible("#modal")); i++) { await page.click("#modal-actions .btn"); await page.waitForTimeout(300); }
  await page.evaluate(() => { window.game.player.speed = 0; });
  await page.waitForTimeout(800);
  const action = (await page.isVisible("#action")) ? await page.textContent("#action") : "";
  console.log(name, "action:", action);
  if (!action.includes("Pull into")) errors.push(`${name}: no rest stop action`);
  await page.click("#action");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `screenshots/stop-${name}-2-menu.png` });
  // eat the first meal, then leave
  const before = await page.evaluate(() => window.game.state.energy);
  await page.click("#modal-actions .btn:nth-child(2)");
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => window.game.state.energy);
  console.log(name, "energy", before, "->", after);
  if (!(after > before)) errors.push(`${name}: meal did not restore energy`);
  await page.click("#modal-actions .btn.primary");
  // look at an advertise board and a sponsored one
  for (const [i, label] of [[0, "advertise-1"], [1, "advertise-2"]]) {
    await page.evaluate((i) => {
      const g = window.game;
      const stop = g.plan.events.find((x) => x.type === "reststop");
      const boards = g.plan.events.filter((x) => x.type === "billboard" && x.ad === "advertise" && x.z > stop.z + 120);
      const b = boards[i] ?? boards[0];
      g.player.z = g.legStartZ + b.z - 40;
      g.player.x = b.side > 0 ? 6.5 : 2.5;
      g.player.speed = 6;
    }, i);
    await page.waitForTimeout(2000);
    for (let k = 0; k < 4 && (await page.isVisible("#modal")); k++) { await page.click("#modal-actions .btn"); await page.waitForTimeout(300); }
    await page.screenshot({ path: `screenshots/stop-${name}-3-${label}.png` });
  }
  // booking panel
  await page.evaluate(() => { window.game.openAdvertise("test"); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `screenshots/stop-${name}-4-advertise-panel.png`, fullPage: false });
  const links = await page.$$eval("#modal-body a", (as) => as.map((a) => a.getAttribute("href")));
  console.log(name, "panel links:", links.join(" "));
  await page.close();
}
await browser.close();
await server.close();
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log("stops tour ok");
