// Duty-first UI shots for walkthrough. Run: node tests/shoot-duty.mjs
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const PUB = new URL("../public/", import.meta.url).pathname;
const MOCK = fs.readFileSync(new URL("./mockfb.js", import.meta.url), "utf8");
const OUT = "/opt/cursor/artifacts/screenshots";
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json" };

const browser = await chromium.launch();
async function shot(user, name, w, h, after){
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await ctx.addInitScript(u => { window.__MOCK_USER = u; }, user);
  await ctx.route("**/*", route => {
    const u = new URL(route.request().url());
    if (u.host === "www.gstatic.com") return route.fulfill({ body: MOCK, contentType: "text/javascript" });
    if (u.host === "localhost:5999") {
      let f = path.join(PUB, u.pathname === "/" ? "index.html" : u.pathname);
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(PUB, "index.html");
      return route.fulfill({ body: fs.readFileSync(f), contentType: TYPES[path.extname(f)] || "application/octet-stream" });
    }
    return route.abort();
  });
  const page = await ctx.newPage();
  await page.goto("http://localhost:5999/"); await page.waitForTimeout(900);
  if (after) await after(page);
  await page.screenshot({ path: path.join(OUT, name + ".png") });
  await ctx.close();
  console.log("wrote", name);
}
const OWNER = { email: "dkota@pvrs.org", displayName: "Dkota Wright" };
const MEMBER = { email: "alex@pvrs.org", displayName: "Alex" };
await shot(OWNER, "duty-mnav-owner", 390, 844, async p => {
  await p.click('#mnav [data-m="duty"]'); await p.waitForTimeout(700);
});
await shot(MEMBER, "duty-member-home", 390, 844, async p => { await p.waitForTimeout(600); });
await shot(OWNER, "duty-desk-sidebar", 1280, 820, async p => {
  await p.click("#schedBtn"); await p.waitForTimeout(700);
});
await browser.close();
