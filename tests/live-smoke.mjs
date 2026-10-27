// Read-only check of the LIVE site's public pages (no sign-in, submits nothing): node tests/live-smoke.mjs
import { chromium } from "playwright";
const BASE = "https://pvrs-membership.web.app", errs = [], notes = [];
const b = await chromium.launch();
for (const [path, w, check] of [
  ["/", 1440, async p => /volunteer EMS/.test(await p.locator("#home h1").textContent()) && await p.locator(".homecard.featured").isVisible()],
  ["/apply", 1440, async p => (await p.locator("#applyForm").count()) === 1 && /About you/.test(await p.locator("#applyRoot h1").textContent())],
  ["/signin", 1440, async p => (await p.locator("#googleBtn").count()) === 1 && /Good (morning|afternoon|evening)/.test(await p.locator("#greet").textContent())],
  ["/signin", 390, async p => (await p.locator("#signApply").isVisible()) && (await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1],
  ["/ref/notARealLinkCode12345", 1440, async p => /doesn't work/.test(await p.locator("#refRoot").textContent())],
  ["/apply", 390, async p => (await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1],
]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  const p = await ctx.newPage(), bad = [];
  p.on("pageerror", e => bad.push("pageerror: " + e.message));
  p.on("console", m => { if (m.type() === "error") bad.push("console: " + m.text()); });
  p.on("response", r => { if (r.status() >= 400 && r.url().startsWith(BASE)) bad.push(`HTTP ${r.status()} ${r.url()}`); });
  await p.goto(BASE + path, { waitUntil: "load" }); await p.waitForTimeout(3500);
  const okv = await check(p).catch(e => (bad.push("check threw: " + e.message), false));
  if (path === "/signin" && w === 1440) notes.push("weather bar " + (await p.locator("#wx").isVisible() ? "showing" : "hidden"));
  (okv && !bad.length ? notes : errs).push(`${path} @${w}px: ${okv ? "ok" : "CHECK FAILED"}${bad.length ? " | " + bad.join(" | ") : ""}`);
  await ctx.close();
}
await b.close();
console.log(notes.join("\n")); console.log(errs.length ? "\nPROBLEMS:\n" + errs.join("\n") : "\nlive public pages: no errors");
