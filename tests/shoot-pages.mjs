// Quick screenshots of public pages: node tests/shoot-pages.mjs [prefix]
import { chromium } from "playwright";
import fs from "node:fs"; import path from "node:path";
globalThis.WX = JSON.parse(fs.readFileSync(new URL("./wx-sample.json", import.meta.url), "utf8"));
const PUB = new URL("../public/", import.meta.url).pathname, OUT = new URL("./shots/", import.meta.url).pathname; fs.mkdirSync(OUT, { recursive: true });
const MOCK = fs.readFileSync(new URL("./mockfb.js", import.meta.url), "utf8");
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webmanifest": "application/manifest+json" };
const pre = process.argv[2] || "page", errs = [];
const b = await chromium.launch();
for (const [url, w, h, dark, who] of [["/signin", 1440, 900, false, "staff"], ["/signin", 1440, 900, false, "applicant"], ["/signin", 390, 844, false, "staff"], ["/", 1440, 900, false, ""], ["/apply", 1440, 900, false, ""], ["/", 390, 844, false, ""]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: dark ? "dark" : "light" });
  await ctx.addInitScript(x => { window.__MOCK_USER = null; try { if (x) localStorage.setItem("pvrsWho", x); } catch {} }, who);
  await ctx.route("**/*", r => { const u = new URL(r.request().url());
    if (u.host === "www.gstatic.com") return r.fulfill({ body: MOCK, contentType: "text/javascript" });
    if (u.host === "api.weather.gov") return r.fulfill({ contentType: "application/geo+json", body: JSON.stringify({ features: process.env.ALERT ? [{ properties: { event: "Winter Weather Advisory", ends: new Date(Date.now() + 864e5).toISOString() } }] : [] }) });
    if (u.host === "api.open-meteo.com") return r.fulfill({ contentType: "application/json", body: JSON.stringify(globalThis.WX) });
    if (u.host === "localhost:5999") { let f = path.join(PUB, u.pathname === "/" ? "index.html" : u.pathname); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(PUB, "index.html"); return r.fulfill({ body: fs.readFileSync(f), contentType: TYPES[path.extname(f)] || "application/octet-stream" }); }
    return r.abort(); });
  const p = await ctx.newPage(); p.on("pageerror", e => errs.push(e.message)); p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto("http://localhost:5999" + url); await p.waitForTimeout(1200);
  await p.screenshot({ path: path.join(OUT, `${pre}-${url === "/" ? "home" : "signin"}-${who || "x"}-${w}.png`) });
  await ctx.close();
}
await b.close(); console.log(errs.length ? "ERRORS:\n" + errs.join("\n") : "no errors");
