// Phone-width sign-in page: prints the top of each section (to check order) and saves a full-page screenshot.
import { chromium } from "playwright";
import fs from "node:fs"; import path from "node:path";
const PUB = new URL("../public/", import.meta.url).pathname, OUT = new URL("./shots/", import.meta.url).pathname;
const MOCK = fs.readFileSync(new URL("./mockfb.js", import.meta.url), "utf8"), WX = fs.readFileSync(new URL("./wx-sample.json", import.meta.url), "utf8");
const T = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png" };
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => { window.__MOCK_USER = null; localStorage.setItem("pvrsWho", "staff"); });
await ctx.route("**/*", r => { const u = new URL(r.request().url());
  if (u.host === "www.gstatic.com") return r.fulfill({ body: MOCK, contentType: "text/javascript" });
  if (u.host === "api.open-meteo.com") return r.fulfill({ body: WX, contentType: "application/json" });
  if (u.host === "api.weather.gov") return r.fulfill({ body: '{"features":[]}', contentType: "application/json" });
  if (u.host === "localhost:5999") { let f = path.join(PUB, u.pathname === "/" ? "index.html" : u.pathname); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(PUB, "index.html"); return r.fulfill({ body: fs.readFileSync(f), contentType: T[path.extname(f)] || "application/octet-stream" }); }
  return r.abort(); });
const p = await ctx.newPage(); await p.goto("http://localhost:5999/signin"); await p.waitForTimeout(1200);
console.log(JSON.stringify(await p.evaluate(() => ["#greet", "#wx", ".joincta", "#signin .sheet"].map(s => [s, Math.round(document.querySelector(s).getBoundingClientRect().top)]))));
console.log("sideways scroll:", await p.evaluate(() => document.documentElement.scrollWidth - innerWidth));
const h = await p.evaluate(() => document.querySelector("#signin").scrollHeight);
await p.setViewportSize({ width: 390, height: h }); await p.waitForTimeout(300);
await p.screenshot({ path: path.join(OUT, "mobile-signin-full.png") });
await b.close();
