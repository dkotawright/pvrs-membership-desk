// Ad-hoc screenshot of any page against the mock: node tests/shoot.mjs <url> <name> [width] [user|none|email] [js to run first]
// e.g. node tests/shoot.mjs /apply apply-1 1200 none "window.scrollTo(0, 2000)"
import { chromium } from "playwright";
import fs from "node:fs"; import path from "node:path";
const PUB = new URL("../public/", import.meta.url).pathname, OUT = new URL("./shots/", import.meta.url).pathname; fs.mkdirSync(OUT, { recursive: true });
const MOCK = fs.readFileSync(new URL("./mockfb.js", import.meta.url), "utf8");
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json" };
const [url = "/", name = "shot", w = "1440", who = "owner", js = "", dark = ""] = process.argv.slice(2);
const user = who === "none" ? null : who === "owner" ? { email: "dkota@pvrs.org", displayName: "Dkota Wright" } : { email: who, displayName: who.split("@")[0] };
const b = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
const ctx = await b.newContext({ viewport: { width: +w, height: +w < 600 ? 844 : 900 }, colorScheme: dark ? "dark" : "light" });
await ctx.addInitScript(u => { window.__MOCK_USER = u; }, user);
await ctx.route("**/*", r => { const u = new URL(r.request().url());
  if (u.host === "www.gstatic.com") return r.fulfill({ body: MOCK, contentType: "text/javascript" });
  if (u.host === "localhost:5999") { let f = path.join(PUB, u.pathname === "/" ? "index.html" : u.pathname); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(PUB, "index.html"); return r.fulfill({ body: fs.readFileSync(f), contentType: TYPES[path.extname(f)] || "application/octet-stream" }); }
  return r.abort(); });
const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.goto("http://localhost:5999" + url); await p.waitForTimeout(1200);
if (js) { await p.evaluate(js); await p.waitForTimeout(800); }
await p.screenshot({ path: path.join(OUT, name + ".png") }); await b.close();
console.log(errs.length ? "ERRORS: " + errs.join("\n") : "saved tests/shots/" + name + ".png");
