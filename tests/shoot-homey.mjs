// Screenshots for the homey / fun redesign: node tests/shoot-homey.mjs
import { chromium } from "playwright";
import fs from "node:fs"; import path from "node:path";
globalThis.WX = JSON.parse(fs.readFileSync(new URL("./wx-sample.json", import.meta.url), "utf8"));
const PUB = new URL("../public/", import.meta.url).pathname;
const OUT = new URL("./shots/", import.meta.url).pathname;
const ART = "/opt/cursor/artifacts";
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(ART, { recursive: true });
const MOCK = fs.readFileSync(new URL("./mockfb.js", import.meta.url), "utf8");
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webmanifest": "application/manifest+json" };
const OWNER = { email: "dkota@pvrs.org", displayName: "Dkota Wright", photoURL: "" };
const APPLICANT = { email: "marcus.bell@example.com", displayName: "Marcus Bell" };
const b = await chromium.launch();
const errs = [];
async function shot(label, url, user, w = 1440, h = 900, after) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(u => { window.__MOCK_USER = u; }, user || null);
  await ctx.route("**/*", r => {
    const u = new URL(r.request().url());
    if (u.host === "www.gstatic.com") return r.fulfill({ body: MOCK, contentType: "text/javascript" });
    if (u.host === "api.weather.gov") return r.fulfill({ contentType: "application/geo+json", body: JSON.stringify({ features: [] }) });
    if (u.host === "api.open-meteo.com") return r.fulfill({ contentType: "application/json", body: JSON.stringify(globalThis.WX) });
    if (u.host === "localhost:5999") {
      let f = path.join(PUB, u.pathname === "/" ? "index.html" : u.pathname);
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(PUB, "index.html");
      return r.fulfill({ body: fs.readFileSync(f), contentType: TYPES[path.extname(f)] || "application/octet-stream" });
    }
    return r.abort();
  });
  const p = await ctx.newPage();
  p.on("pageerror", e => errs.push(label + ": " + e.message));
  await p.goto("http://localhost:5999" + url);
  await p.waitForTimeout(1400);
  if (after) await after(p);
  const dest = path.join(OUT, `homey-${label}.png`);
  await p.screenshot({ path: dest, fullPage: label.startsWith("ref") });
  fs.copyFileSync(dest, path.join(ART, `homey_${label}.png`));
  await ctx.close();
}
await shot("home", "/", null);
await shot("desk_overview", "/", OWNER, 1440, 900, async p => {
  await p.waitForSelector("#app:not([hidden])");
  await p.waitForTimeout(900);
});
await shot("desk_file", "/", OWNER, 1440, 900, async p => {
  await p.waitForSelector("#app:not([hidden])");
  await p.evaluate(() => [...document.querySelectorAll(".arow")].find(r => r.textContent.includes("Georgia"))?.click());
  await p.waitForTimeout(700);
});
await shot("portal", "/", APPLICANT, 1440, 900, async p => {
  await p.waitForSelector("#portal:not([hidden])");
  await p.evaluate(() => {
    const d = window.__mock.docs, portal = d.get("portal/a2");
    portal.steps = [
      { label: "Application received", detail: "We have your application.", state: "done" },
      { label: "Application review", detail: "The membership committee is reviewing your file.", state: "done" },
      { label: "Interview", detail: "Pick a time below once interview times open.", state: "now" },
      { label: "Board review", detail: "Your application goes to the next board meeting.", state: "todo" },
      { label: "Background check", detail: "After the board approves you.", state: "todo" },
      { label: "Welcome to PVRS", detail: "Orientation and duty crew.", state: "todo" },
    ];
    d.set("portal/a2", portal); window.__mock.emit();
  });
  await p.waitForTimeout(500);
});
await shot("ref_phone", "/ref/linkGoodToken123456789", null, 390, 844);
await b.close();
console.log(errs.length ? "ERRORS:\n" + errs.join("\n") : "homey shots ok → " + ART);
