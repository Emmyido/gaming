// Renders public/ad-template.png: the 1024×512 billboard artwork template advertisers download.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require(`${execSync("npm root -g").toString().trim()}/playwright`); }
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 512 } });
await page.setContent(`<html><body style="margin:0">
<div style="width:1024px;height:512px;position:relative;font-family:system-ui,sans-serif;background:repeating-linear-gradient(45deg,#f4f6f5 0 24px,#e9eeeb 24px 48px)">
  <div style="position:absolute;inset:40px;border:4px dashed #1faa59;border-radius:8px"></div>
  <div style="position:absolute;left:60px;top:64px;color:#0b6e4f;font-weight:900;font-size:64px;letter-spacing:-1px">YOUR BIG MESSAGE</div>
  <div style="position:absolute;left:62px;top:150px;color:#334;font-size:30px">One short line about your offer</div>
  <div style="position:absolute;left:60px;bottom:64px;background:#ffd60a;color:#111;font-weight:800;font-size:34px;padding:14px 22px;border-radius:12px">0803 000 0000 · yourbusiness.ng</div>
  <div style="position:absolute;right:64px;top:64px;width:200px;height:200px;border:4px dashed #889;border-radius:16px;display:grid;place-items:center;color:#667;font-size:26px;font-weight:700">LOGO</div>
  <div style="position:absolute;right:52px;bottom:16px;color:#1faa59;font-size:16px;font-weight:700">1024 × 512 px · keep text inside the dashed line · GreenRev Roadtrip billboard</div>
</div></body></html>`);
await page.screenshot({ path: "public/ad-template.png" });
await browser.close();
console.log("public/ad-template.png written");
