// Phone-width screenshots of the desk (owner): overview, an open file, and the applicant list.
import { chromium } from "playwright";
import fs from "node:fs"; import path from "node:path";
const PUB = new URL("../public/", import.meta.url).pathname, OUT = new URL("./shots/", import.meta.url).pathname;
const MOCK = fs.readFileSync(new URL("./mockfb.js", import.meta.url), "utf8");
const T = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png" };
const pre = process.argv[2] || "phone", errs = [];
const b = await chromium.launch();
for (const dark of [false, true]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: dark ? "dark" : "light", deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { window.__MOCK_USER = { email: "dkota@pvrs.org", displayName: "Dkota Wright" }; });
  await ctx.route("**/*", r => { const u = new URL(r.request().url());
    if (u.host === "www.gstatic.com") return r.fulfill({ body: MOCK, contentType: "text/javascript" });
    if (u.host === "localhost:5999") { let f = path.join(PUB, u.pathname === "/" ? "index.html" : u.pathname); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(PUB, "index.html"); return r.fulfill({ body: fs.readFileSync(f), contentType: T[path.extname(f)] || "application/octet-stream" }); }
    return r.abort(); });
  const p = await ctx.newPage(); p.on("pageerror", e => errs.push(e.message));
  await p.goto("http://localhost:5999/"); await p.waitForTimeout(1200);
  const d = dark ? "-dark" : "";
  await p.screenshot({ path: path.join(OUT, `${pre}-overview${d}.png`) });
  if (!dark) {
    await p.click('#mnav [data-m="ov"]'); await p.waitForTimeout(500);
    await p.screenshot({ path: path.join(OUT, `${pre}-ov.png`) });
    await p.click('#mnav [data-m="more"]'); await p.waitForTimeout(400);
    await p.screenshot({ path: path.join(OUT, `${pre}-more.png`) });
    await p.click("#modal [data-x]"); await p.waitForTimeout(300);
    await p.click('#mnav [data-m="list"]'); await p.waitForTimeout(400);
    await p.evaluate(() => [...document.querySelectorAll(".arow")].find(r => r.textContent.includes("Georgia"))?.click()); await p.waitForTimeout(600);
    await p.screenshot({ path: path.join(OUT, `${pre}-file.png`) });
    await p.evaluate(() => document.querySelector("#dbody") && (document.querySelector("#dbody").scrollTop = 600)); await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(OUT, `${pre}-file-scrolled.png`) });
  }
  await ctx.close();
}
await b.close(); console.log(errs.length ? "ERRORS:\n" + errs.join("\n") : "no errors");
