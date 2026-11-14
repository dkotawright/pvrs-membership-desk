// Browser tests against the in-memory Firebase stand-in (tests/mockfb.js). Run: node tests/browser.test.mjs
// Screenshots go to tests/shots/ (git-ignored).
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const PUB = new URL("../public/", import.meta.url).pathname, OUT = new URL("./shots/", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const MOCK = fs.readFileSync(new URL("./mockfb.js", import.meta.url), "utf8");
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json" };
const errors = [], notes = [];
const fail = m => errors.push("[check] " + m), ok = m => notes.push("ok: " + m);
// YYYY-MM-DD in the local time zone (toISOString is UTC, a day ahead on US evenings)
const localDay = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const OWNER = { email: "dkota@pvrs.org", displayName: "Dkota Wright" };

async function open(browser, { url = "/", user = OWNER, w = 1440, h = 900, dark = false, seed = null, files = {}, tour = false } = {}){
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: dark ? "dark" : "light" });
  if (!tour) await ctx.addInitScript(() => { try { localStorage.setItem("pvrsTourOff", "1"); } catch {} });   // the first-visit tour would cover the page in every other test
  if (seed) await ctx.addInitScript(list => { window.__mock = { docs: new Map(list), listeners: new Set(), seq: 0 }; }, seed);   // extra docs on top of the usual test data
  await ctx.addInitScript(u => { window.__MOCK_USER = u; HTMLAnchorElement.prototype.click = function(){ (window.__clicked = window.__clicked || []).push(this.href); }; }, user);
  await ctx.route("**/*", route => {
    const u = new URL(route.request().url());
    if (u.host === "www.gstatic.com") return route.fulfill({ body: MOCK, contentType: "text/javascript" });
    if (u.host === "localhost:5999") {
      if (files[u.pathname]) return route.fulfill({ body: files[u.pathname](fs.readFileSync(path.join(PUB, u.pathname), "utf8")), contentType: TYPES[path.extname(u.pathname)] });   // patched copy of a site file
      let f = path.join(PUB, u.pathname === "/" ? "index.html" : u.pathname);
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(PUB, "index.html");   // SPA fallback, like Firebase Hosting
      return route.fulfill({ body: fs.readFileSync(f), contentType: TYPES[path.extname(f)] || "application/octet-stream" });
    }
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(`[pageerror ${url}] ${e.message}`));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`[console ${url}] ${m.text()}`); });   // outside requests (weather) are blocked on purpose
  await page.goto("http://localhost:5999" + url); await page.waitForTimeout(700);
  return { ctx, page };
}
const wait = (page, ms = 250) => page.waitForTimeout(ms);
const snap = (page, name) => page.screenshot({ path: path.join(OUT, name + ".png") });
const priv = (page, id) => page.evaluate(i => window.__mock.docs.get(`applicants/${i}/private/main`), id);
// Board-approved people live in the Onboard list, so look there when the applicant list doesn't have them.
const pickApplicant = async (page, name) => { const find = n => [...document.querySelectorAll(".arow")].find(r => r.textContent.includes(n));
  if (!(await page.evaluate(n => !![...document.querySelectorAll(".arow")].find(r => r.textContent.includes(n)), name))) { await page.evaluate(() => (document.querySelector('#chips [data-f="orient"]') || document.querySelector('#chipsMini [data-f="orient"]'))?.click()); await wait(page, 300); }
  await page.evaluate(n => [...document.querySelectorAll(".arow")].find(r => r.textContent.includes(n))?.click(), name); await wait(page, 400); };

const browser = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});   // PW_CHROME: use a preinstalled Chromium
try {
  // ---- the reference opens their private link
  {
    const { ctx, page } = await open(browser, { url: "/ref/linkGoodToken123456789", user: null });
    if (await page.locator("#reference").isHidden()) fail("reference page not shown");
    const head = await page.locator("#refRoot h1").textContent(), lead = await page.locator("#refRoot .lead2").textContent();
    if (!/Reference for Georgia Thurmond/.test(head) || !/^Hi Ann,/.test(lead.trim())) fail("not personalised: " + head + " / " + lead); else ok("link opens a page naming the applicant and greeting the reference");
    if (!/How long have you known Georgia/.test(await page.locator("#refForm").textContent())) fail("questions don't use the applicant's name"); else ok("questions use the applicant's first name");
    if (await page.locator("#pubnav").isVisible()) fail("public nav shown on reference page");
    if (await page.locator("#rf-signName").inputValue() !== "Ann Lee") fail("name not prefilled"); else ok("reference's name prefilled");
    await snap(page, "01-ref-form");
    await page.locator("#refForm button[type=submit]").click(); await wait(page);
    const err = await page.locator("#rfErr").textContent();
    if (!/Rate: Reliability/.test(err) || !/personal information/.test(err)) fail("empty form not blocked: " + err); else ok("required questions and ratings are enforced");
    await page.locator("#rf-known").fill("About 3 years, as her swim coach.");
    await page.locator("#rf-skills").fill("Dependable and calm. Could speak up more.");
    // the answers survive a reload (saved on their device)
    await page.reload(); await wait(page, 700);
    if (!/swim coach/.test(await page.locator("#rf-known").inputValue())) fail("draft lost on reload"); else ok("half-finished answers survive a reload");
    await page.locator("#rf-getAlong").fill("Very well."); await page.locator("#rf-criticism").fill("Takes it well.");
    for (const k of ["reliability", "flexibility", "timeManagement", "communication", "responsibility", "appearance", "disposition"]) await page.locator(`[data-rate="${k}"][data-v="5"]`).click();
    await page.locator('[data-trust="yes"]').click();
    await page.locator("#rf-reservations").fill("None."); await page.locator("#rf-other").fill("She'd be a great member.");
    await snap(page, "02-ref-filled");
    await page.locator("#refForm button[type=submit]").click(); await wait(page, 500);
    const w = await page.evaluate(() => (window.__mock.writes || []).filter(x => /^(refResponses|refLinks)\//.test(x.path)));
    const resp = w.find(x => x.path === "refResponses/linkGoodToken123456789"), mark = w.find(x => x.path === "refLinks/linkGoodToken123456789" && x.op === "update");
    if (!resp || resp.data.answers.ratings.reliability !== 5 || resp.data.answers.trustworthy !== "yes" || resp.data.answers.signName !== "Ann Lee" || Object.keys(resp.data).sort().join() !== "answers,hp,submittedAt,v") fail("response wrong: " + JSON.stringify(resp)); else ok("answers saved under the link's code (no applicant id, no sign-in)");
    if (!mark || !mark.data.submittedAt) fail("link not marked answered"); else ok("link marked answered");
    if (!/Thank you, Ann!/.test(await page.locator("#refRoot").textContent())) fail("no thank-you screen"); else ok("thank-you screen");
    await snap(page, "03-ref-done");
    await ctx.close();
  }
  for (const [url, want, label] of [["/ref/linkUsedToken12345678", /We already have your reference[\s\S]*Georgia Thurmond/, "already-answered link"], ["/ref/linkOldToken1234567890", /expired/, "expired link"], ["/ref/nonsense", /doesn't work/, "bad link"], ["/ref/doesNotExist12345678", /doesn't work/, "unknown link"]]) {
    const { ctx, page } = await open(browser, { url, user: null });
    if (!want.test(await page.locator("#refRoot").textContent())) fail(label + " message"); else ok(label + " shows a friendly message");
    await ctx.close();
  }
  { // phone width
    const { ctx, page } = await open(browser, { url: "/ref/linkGoodToken123456789", user: null, w: 390, h: 844 });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (over > 1) fail("reference form scrolls sideways on a phone"); else ok("reference form fits a phone");
    await page.locator(".rate").first().scrollIntoViewIfNeeded(); await snap(page, "04-ref-phone");
    await ctx.close();
  }
  // ---- the owner sends the link, the answers come back
  {
    const { ctx, page } = await open(browser);
    await page.evaluate(() => { const d = window.__mock.docs; d.delete("refLinks/linkGoodToken123456789"); window.__mock.emit(); });
    await pickApplicant(page, "Georgia Thurmond");
    await page.locator('.tabdock [data-tab="checks"]').click(); await wait(page, 300);
    if (!/Send Ann a private link/.test(await page.locator("#refFormNote1").textContent())) fail("form row text: " + await page.locator("#refFormNote1").textContent()); else ok("References tab offers the form link");
    await page.locator('[data-refmail="1"]').click(); await wait(page, 700);
    const p = await priv(page, "a1"), tok = p.refs.r1.link;
    const link = tok && await page.evaluate(t => window.__mock.docs.get("refLinks/" + t), tok);
    if (!tok || !/^[A-Za-z0-9_-]{24}$/.test(tok) || !link || link.appId !== "a1" || link.slot !== 1 || link.applicant !== "Georgia Thurmond" || link.refName !== "Ann Lee") fail("link not made: " + JSON.stringify({ tok, link })); else ok("owner makes a private 24-character link");
    const mail = (await page.evaluate(() => window.__clicked || [])).find(h => h.startsWith("mailto:")) || "";
    const body = decodeURIComponent(mail);
    if (!body.startsWith("mailto:ann.lee%40example.com") && !body.startsWith("mailto:ann.lee@example.com") || !body.includes("/ref/" + tok) || !/Reference for Georgia Thurmond/.test(body) || !/Hi Ann/.test(body)) fail("email wrong: " + body.slice(0, 300)); else ok("Email link opens a personal email to the reference with their link");
    if (!p.refs.r1.contacted || p.refs.r1.method !== "Email") fail("contacted date not filled"); else ok("Date contacted filled in");
    await page.locator('[data-refcopy="1"]').click(); await wait(page, 300);
    if ((await priv(page, "a1")).refs.r1.link !== tok) fail("copy made a second link"); else ok("Copy link reuses the same link");
    await snap(page, "05-desk-link-made");
    // the reference answers
    await page.evaluate(t => { window.__mock.docs.set("refResponses/" + t, { v: 1, submittedAt: Date.now(), hp: "", answers: { known: "3 years, coach", skills: "Dependable", getAlong: "Very well", criticism: "Takes it well", ratings: { reliability: 5, flexibility: 4, timeManagement: 4, communication: 5, responsibility: 5, appearance: 4, disposition: 5 }, trustworthy: "yes", reservations: "None", other: "Great member", others: "", signName: "Ann Lee", signDate: "2026-10-19" } }); window.__mock.emit(); }, tok);
    await wait(page, 1200);
    const p2 = await priv(page, "a1"), resp = await page.evaluate(t => window.__mock.docs.get("refResponses/" + t), tok);
    if (!p2.refs.r1.form || p2.refs.r1.form.answers.ratings.reliability !== 5 || !p2.refs.r1.returned) fail("answers not filed: " + JSON.stringify(p2.refs.r1)); else ok("answers filed on the reference and it's marked received");
    if (!resp.importedAt) fail("response not marked imported"); else ok("response marked imported");
    const shared = await page.evaluate(() => JSON.stringify(window.__mock.docs.get("applicants/a1")) + JSON.stringify(window.__mock.docs.get("portal/a1") || {}));
    if (/3 years, coach|Dependable/.test(shared)) fail("answers leaked outside the private record"); else ok("answers stay in the private record (not the shared record or portal)");
    if (!/Answered/.test(await page.locator("#refFormNote1").textContent()) || await page.locator("#refView1").isHidden()) fail("desk doesn't show answered"); else ok("desk shows Answered + View answers");
    await page.locator('[data-refview="1"]').click(); await wait(page, 300);
    const m = await page.locator("#modal").textContent();
    if (!/Reliability: 5 \/ 5/.test(m) || !/How long have you known Georgia/.test(m) || !/3 years, coach/.test(m)) fail("answers modal: " + m.slice(0, 200)); else ok("View answers shows the questions, answers and ratings");
    await snap(page, "06-desk-answers");
    await ctx.close();
  }
  { // admins can read answers but not send links
    const { ctx, page } = await open(browser, { user: { email: "admin@pvrs.org", displayName: "Casey" } });
    await page.evaluate(() => { const d = window.__mock.docs, p = d.get("applicants/a1/private/main"); p.refs.r1.form = { label: "x", date: "2026-10-19", answers: { known: "k", ratings: {}, signName: "Ann Lee" } }; window.__mock.emit(); });
    await pickApplicant(page, "Georgia Thurmond");
    await page.locator('.tabdock [data-tab="checks"]').click(); await wait(page, 300);
    if (await page.locator("#refView1").isHidden()) fail("admin can't view answers"); else ok("admins can view answers");
    if (await page.locator("#refMail2").isVisible() || await page.locator("#refCopy2").isVisible()) fail("admin sees link buttons"); else ok("admins can't send links");
    await ctx.close();
  }
  // ---- 4 references listed, 3 required
  {
    const { ctx, page } = await open(browser);
    const setRefs = n => page.evaluate(n => { const d = window.__mock.docs, p = d.get("applicants/a1/private/main");
      p.refs = { r1: { name: "Ann Lee" }, r2: { name: "Sam Ortiz" }, r3: { name: "Kim Park" }, r4: { name: "Lee Chu" } };
      ["r1", "r2", "r3", "r4"].slice(0, n).forEach(k => { p.refs[k].returned = "2026-10-10"; }); window.__mock.emit(); }, n);
    await setRefs(2); await pickApplicant(page, "Georgia Thurmond");
    await page.locator('.tabdock [data-tab="checks"]').click(); await wait(page, 300);
    let t = await page.locator("#refSummary").textContent();
    if (!/2 of 3 required references received · need 1 more/.test(t)) fail("2 of 4 in: " + t); else ok("4 listed, 2 in → 'need 1 more' (not 2)");
    await setRefs(3); await wait(page, 300);
    t = await page.locator("#refSummary").textContent();
    if (!/3 of 4 references received · requirement met/.test(t) || /need/.test(t.split("·")[1] || "")) fail("3 of 4 in: " + t); else ok("4 listed, 3 in → requirement met");
    await wait(page, 1800);
    const pr = await page.evaluate(() => window.__mock.docs.get("portal/a1"));
    const steps = JSON.stringify(pr && pr.steps || []);
    if (!pr) fail("portal not synced");
    await snap(page, "07-refs-3-of-4");
    await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, { user: { email: "marcus.bell@example.com", displayName: "" } });
    const setP = n => page.evaluate(n => { const d = window.__mock.docs, p = d.get("portal/a2");
      p.refs = [1, 2, 3, 4].map(i => ({ slot: i, name: "Ref " + i, received: i <= n })); d.set("portal/a2", p); window.__mock.emit(); }, n);
    await setP(2); await wait(page, 300);
    let t = await page.locator("#refCard").textContent();
    if (!/We've heard from 2 so far, so we need 1 more/.test(t)) fail("portal 2 of 4: " + t); else ok("portal: 2 of 4 in → 'need 1 more'");
    await setP(3); await wait(page, 300);
    t = await page.locator("#refCard").textContent();
    if (!/received the references we need/.test(t) || !/Not needed/.test(t) || /Waiting/.test(t)) fail("portal 3 of 4: " + t); else ok("portal: 3 of 4 in → done, the 4th shows 'Not needed'");
    await ctx.close();
  }
  // ---- sign-in page: wording, greeting, weather hides itself if the service is unreachable
  {
    const { ctx, page } = await open(browser, { url: "/signin", user: null });   // weather requests are blocked here
    if (!/Good (morning|afternoon|evening)/.test(await page.locator("#greet").textContent())) fail("no greeting"); else ok("sign-in greets by time of day");
    if (await page.locator("#wx").isVisible()) fail("weather card shown with no data"); else ok("weather card stays hidden when the weather service is unreachable");
    const txt = await page.locator("#signin").textContent();
    if (/Dkota/.test(txt) || !/spam or junk/.test(txt) || await page.locator("#whoSeg").count() || !/Continue with Google/.test(txt)) fail("sign-in wording"); else ok("sign-in wording is professional (no first names)");
    await ctx.close();
  }
  // ---- create an account with email + password → confirm email → request access (approval still required)
  {
    const { ctx, page } = await open(browser, { url: "/signin", user: null });
    await page.evaluate(() => localStorage.setItem("pvrsWho", "staff")); await page.reload(); await wait(page, 700);
    await page.locator("#reqEmailBtn").click(); await wait(page, 300);
    if (await page.locator("#signupForm").isHidden() || !(await page.locator("#manualSignin").evaluate(d => d.open))) fail("Request with email didn't open Create account"); else ok("'With email' opens Create account");
    await snap(page, "08-create-account");
    await page.locator("#newName").fill("Pat Rivera"); await page.locator("#newEmail").fill("Pat.Rivera@Example.com");
    await page.locator("#newPass").fill("short"); await page.locator("#newPass2").fill("short");
    await page.locator("#signupForm button[type=submit]").click(); await wait(page, 200);
    if (await page.evaluate(() => window.__mock.created)) fail("weak password accepted"); else ok("passwords under 10 characters are refused");
    await page.locator("#newPass").fill("a-long-password-1"); await page.locator("#newPass2").fill("a-long-password-2");
    await page.locator("#signupForm button[type=submit]").click(); await wait(page, 200);
    if (await page.evaluate(() => window.__mock.created)) fail("mismatched passwords accepted"); else ok("mismatched passwords are refused");
    await page.locator("#newPass2").fill("a-long-password-1");
    await page.locator("#signupForm button[type=submit]").click(); await wait(page, 700);
    const st = await page.evaluate(() => ({ c: window.__mock.created, v: window.__mock.verifySent, u: window.__MOCK_USER }));
    if (!st.c || st.c.email !== "pat.rivera@example.com" || st.u.displayName !== "Pat Rivera") fail("account not created: " + JSON.stringify(st)); else ok("account created (email lowercased, name saved)");
    if (!st.v || !st.v.length || !/\/signin$/.test(st.v[0].url)) fail("no confirmation email"); else ok("confirmation email sent");
    if (await page.locator("#verify").isHidden() || !/pat\.rivera@example\.com/.test(await page.locator("#verifyMsg").textContent())) fail("verify screen not shown"); else ok("'Confirm your email' screen shown");
    const reads = await page.evaluate(() => (window.__mock.writes || []).length);
    if (await page.locator("#app").isVisible() || await page.locator("#noaccess").isVisible()) fail("unconfirmed account got past the confirm screen"); else ok("an unconfirmed account goes no further");
    await snap(page, "09-verify");
    await page.locator("#verifyDone").click(); await wait(page, 300);
    if (!/Not confirmed yet/.test(await page.locator("#toast").textContent())) fail("no 'not confirmed yet' message");
    await page.evaluate(() => { window.__MOCK_USER.emailVerified = true; });   // they click the link in the email
    await wait(page, 4800);
    if (await page.locator("#noaccess").isHidden()) fail("didn't continue after confirming"); else ok("continues on its own once the email is confirmed");
    if (!/Request team access/.test(await page.locator("#noaccessTitle").textContent()) || await page.locator("#reqName").inputValue() !== "Pat Rivera") fail("request form not shown/prefilled"); else ok("then shows the access request form, name filled in");
    await page.locator("#reqForm button[type=submit]").click(); await wait(page, 400);
    const req = await page.evaluate(() => window.__mock.docs.get("accessRequests/pat.rivera@example.com"));
    if (!req || req.status !== "pending" || req.name !== "Pat Rivera") fail("request not filed: " + JSON.stringify(req)); else ok("request filed as pending for approval");
    if (await page.locator("#app").isVisible()) fail("got into the desk without approval"); else ok("no desk access until approved");
    await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, { url: "/signin", user: null });
    await page.evaluate(() => localStorage.setItem("pvrsWho", "staff")); await page.reload(); await wait(page, 700);
    await page.locator("#reqEmailBtn").click(); await wait(page, 200);
    await page.locator("#newName").fill("Dkota W"); await page.locator("#newEmail").fill("dkota@pvrs.org");
    await page.locator("#newPass").fill("a-long-password-1"); await page.locator("#newPass2").fill("a-long-password-1");
    await page.locator("#signupForm button[type=submit]").click(); await wait(page, 400);
    if (!/already an account/.test(await page.locator("#toast").textContent())) fail("existing email message"); else ok("an email that already has an account gets a clear message");
    await ctx.close();
  }
  { // applicant portal: the secure upload button
    const { ctx, page } = await open(browser, { user: { email: "marcus.bell@example.com", displayName: "" } });
    const b = page.locator('[data-upload="_private"]');
    if (!/Secure document upload/.test(await b.textContent()) || /Social Security paperwork/.test(await page.locator("#portal").textContent())) fail("secure upload wording"); else ok("portal says 'Secure document upload'");
    await b.scrollIntoViewIfNeeded(); await snap(page, "10-portal-secure-upload");
    await ctx.close();
  }
  // ---- an online application is imported exactly once, even if several desks see it
  {
    const { ctx, page } = await open(browser); await wait(page, 800);
    const count = () => page.evaluate(() => [...window.__mock.docs.entries()].filter(([k, v]) => /^applicants\/[^/]+$/.test(k) && v.name === "Test Online").length);
    if (await count() !== 1) fail("online application not imported once: " + await count()); else ok("online application imported into the desk");
    const st = await page.evaluate(() => window.__mock.docs.get("submissions/sub1"));
    if (st.status !== "imported" || !st.applicantId) fail("submission not marked imported"); else ok("submission marked imported");
    const hd = await page.evaluate(id => window.__mock.docs.get("applicants/" + id).app, st.applicantId);
    if (hd.heard !== "Social media" || hd.heardDetail !== "Instagram") fail("how they heard not imported: " + JSON.stringify(hd)); else ok("how they heard about PVRS is imported");
    const hc = await page.locator(".hchart").textContent().catch(() => "");
    if (!/How applicants heard about us/.test(hc) || !/Social media\s*1/.test(hc)) fail("heard chart: " + hc); else ok("Year at a glance shows how applicants heard about us");
    // two more desks wake up with an out-of-date copy that still says "new" and try to import it at the same moment
    await page.evaluate(async () => {
      const fb = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
      const claim = () => fb.runTransaction({}, async tx => { const cur = await tx.get(fb.doc({}, "submissions/sub1"));
        if (cur.data().status !== "new") return false; tx.set(fb.doc({}, "applicants/dupe" + Math.random()), { name: "Test Online" }); tx.update(fb.doc({}, "submissions/sub1"), { status: "imported" }); return true; });
      const d = window.__mock.docs.get("submissions/sub1"); d.status = "new"; delete d.applicantId;   // pretend it was never imported, then race 3 desks
      [...window.__mock.docs.keys()].filter(k => /^applicants\//.test(k) && window.__mock.docs.get(k).name === "Test Online").forEach(k => window.__mock.docs.delete(k));
      window.__race = await Promise.all([claim(), claim(), claim()]);
    });
    const race = await page.evaluate(() => window.__race);
    if (race.filter(Boolean).length !== 1 || await count() !== 1) fail("race made duplicates: " + JSON.stringify(race) + " count " + await count()); else ok("3 desks racing for one application → exactly 1 applicant");
    await ctx.close();
  }
  // ---- Email all reference forms (one email each, from one window)
  {
    const { ctx, page } = await open(browser);
    await page.evaluate(() => { const d = window.__mock.docs, p = d.get("applicants/a1/private/main");
      p.refs = { r1: { name: "Ann Lee", email: "ann.lee@example.com" }, r2: { name: "Sam Ortiz", email: "sam@example.com", returned: "2026-10-01" }, r3: { name: "Kim Park", email: "kim@example.com" }, r4: { name: "Lee Chu" } }; window.__mock.emit(); });
    await pickApplicant(page, "Georgia Thurmond");
    await page.locator('.tabdock [data-tab="checks"]').click(); await wait(page, 300);
    await page.locator('[data-act="refsall"]').click(); await wait(page, 300);
    const list = await page.locator("#rallList").textContent();
    if ((await page.locator("[data-allmail]").count()) !== 2 || !/Already received/.test(list) || !/No email on file/.test(list)) fail("send-all list: " + list); else ok("send-all lists who still needs the form (skips received, flags missing email)");
    await snap(page, "11-refs-email-all");
    await page.locator('[data-allmail="1"]').click(); await wait(page, 600);
    await page.locator('[data-allmail="3"]').click(); await wait(page, 1500);   // edits save ~0.6 s after the last change
    const mails = (await page.evaluate(() => window.__clicked || [])).filter(h => h.startsWith("mailto:")).map(decodeURIComponent);
    const p = await priv(page, "a1");
    if (mails.length !== 2 || !mails[0].includes("ann.lee@example.com") || !mails[1].includes("kim@example.com") || !mails[0].includes("/ref/" + p.refs.r1.link) || !mails[1].includes("/ref/" + p.refs.r3.link) || p.refs.r1.link === p.refs.r3.link)
      fail("send-all emails: " + JSON.stringify(mails.map(m => m.slice(0, 60)))); else ok("each reference gets their own email with their own link");
    if ((await page.locator("#rallList").textContent()).match(/Opened ✓/g)?.length !== 2) fail("rows not marked opened"); else ok("sent rows are checked off");
    if (!p.refs.r1.contacted || !p.refs.r3.contacted) fail("contacted dates not filled"); else ok("date contacted filled for each");
    await ctx.close();
  }
  { // admins don't get the button
    const { ctx, page } = await open(browser, { user: { email: "admin@pvrs.org", displayName: "Casey" } });
    await pickApplicant(page, "Georgia Thurmond");
    await page.locator('.tabdock [data-tab="checks"]').click(); await wait(page, 300);
    if (await page.locator('[data-act="refsall"]').count()) fail("admin sees Email all"); else ok("only the owner can email all references");
    await ctx.close();
  }
  // ---- phones: floating glass menu at the bottom
  {
    const { ctx, page } = await open(browser, { w: 390, h: 844 });
    if (await page.locator(".app > .side").isVisible() || await page.locator("#mnav").isHidden()) fail("phone: sidebar strip still showing / no bottom menu"); else ok("phone: bottom menu replaces the icon strip");
    const items = await page.locator("#mnav [data-m]:visible").evaluateAll(b => b.map(x => x.dataset.m));
    if (items.join() !== "list,orient,ov,msgs,more") fail("phone menu items: " + items); else ok("phone menu: Applicants, Orientation, Overview, Messages, More (no big +)");
    { const fit = await page.evaluate(() => { const r = document.querySelector("#mnav").getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; });
      if (!fit) fail("phone menu wider than the screen"); else ok("the five-item phone menu fits the screen");
      await page.click('#mnav [data-m="orient"]'); await wait(page, 400);
      if (!/^Onboard$/.test((await page.locator("#rosterTitle").textContent()).trim()) || !/Onboard/.test(await page.locator('#mnav [data-m="orient"]').textContent()) || !(await page.locator('#mnav [data-m="orient"].on').count())) fail("phone Onboard menu"); else ok("the phone Onboard menu opens the onboarding list");
      await page.click('#mnav [data-m="list"]'); await wait(page, 400);
      if (!/All applicants/.test(await page.locator("#rosterTitle").textContent())) fail("Applicants menu didn't go back to applicants"); else ok("Applicants goes back to the applicant list"); }
    await page.click('#mnav [data-m="ov"]'); await wait(page, 500);
    if (await page.locator(".ov").isHidden() || !/Good (morning|afternoon|evening)/.test(await page.locator(".ov").textContent())) fail("phone overview not shown"); else ok("phone: Overview shows the dashboard");
    await page.click('#mnav [data-m="list"]'); await wait(page, 500);
    if (await page.locator("#app").evaluate(a => a.classList.contains("ovopen"))) fail("Applicants didn't close overview"); else ok("phone: Applicants returns to the list");
    await page.click('#mnav [data-m="more"]'); await wait(page, 300);
    const more = await page.locator("#modal").textContent();
    if (!/New applicant/.test(more) || !/Interview times/.test(more) || !/Settings/.test(more) || !/Sign out/.test(more)) fail("More sheet: " + more.slice(0, 120)); else ok("phone: More has New applicant, interview times, settings, sign out");
    await page.click('#modal [data-more="slotsBtn"]'); await wait(page, 500);
    if (!/Interview times/.test(await page.locator("#modal").textContent())) fail("More → Interview times didn't open"); else ok("phone: More → Interview times opens");
    await page.click("#modal [data-x]").catch(() => {}); await page.keyboard.press("Escape"); await wait(page, 300);
    await page.evaluate(() => [...document.querySelectorAll(".arow")].find(r => r.textContent.includes("Georgia"))?.click()); await wait(page, 600);
    const hidden = await page.locator("#mnav").evaluate(m => getComputedStyle(m).opacity === "0" || getComputedStyle(m).pointerEvents === "none");
    if (!hidden || await page.locator(".tabdock").isHidden()) fail("phone: menu should step aside inside a file"); else ok("phone: inside a file the section bar takes the bottom");
    await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, { w: 390, h: 844, user: { email: "admin@pvrs.org", displayName: "Casey" } });
    await page.click('#mnav [data-m="more"]'); await wait(page, 300);
    if (/New applicant/.test(await page.locator("#modal").textContent())) fail("admin sees New applicant in More"); else ok("phone: only the owner gets New applicant (in More)");
    await ctx.close();
  }
  for (const w of [360, 390]) { // the file's section bar fits a phone without scrolling (Checks = Screening + References)
    const { ctx, page } = await open(browser, { w, h: 800 });
    await pickApplicant(page, "Georgia Thurmond");
    const tabs = await page.locator(".tabdock [data-tab]").evaluateAll(b => b.map(x => x.dataset.tab).join());
    const over = await page.evaluate(() => { const t = document.querySelector(".tabdock .tabs"); return t.scrollWidth - t.clientWidth; });
    if (tabs !== "app,checks,iv,board,onb,notes,msgs" || over > 1) fail(`tabs at ${w}px: ${tabs} overflow ${over}`); else ok(`section bar fits at ${w}px (7 tabs, Checks merged)`);
    await page.locator('.tabdock [data-tab="checks"]').click(); await wait(page, 300);
    if (!(await page.locator("#f-mvr-completed").count()) || !(await page.locator("#refSummary").count())) fail("Checks tab missing MVR or references"); else if (w === 390) ok("Checks tab holds MVR/license and references");
    await ctx.close();
  }
  { // phones: one Actions button in the file header instead of five unlabeled icons
    const { ctx, page } = await open(browser, { w: 390, h: 844 });
    await pickApplicant(page, "Georgia Thurmond");
    const vis = await page.locator(".dhead .hacts .btn:visible").evaluateAll(b => b.map(x => x.dataset.act));
    if (vis.join() !== "actions") fail("phone header buttons: " + vis); else ok("phone file header shows one Actions button");
    await page.locator('[data-act="actions"]').click(); await wait(page, 300);
    const t = await page.locator("#modal").textContent();
    if (!/Write an email/.test(t) || !/Book an interview time/.test(t) || !/Request documents/.test(t) || !/See their applicant portal/.test(t) || !/Delete this applicant/.test(t)) fail("Actions sheet: " + t.slice(0, 160)); else ok("Actions sheet lists email, book, documents, portal, delete");
    await page.screenshot({ path: path.join(OUT, "12-phone-actions.png") });
    await page.locator("#modal [data-pick]", { hasText: "Request documents" }).click(); await wait(page, 400);
    if (!/Request documents/.test(await page.locator("#modal h3").textContent())) fail("Actions → Request documents didn't open"); else ok("picking an action opens it");
    await ctx.close();
  }
  // ---- nudges: references emailed 7+ days ago with no answer get a reminder
  {
    const { ctx, page } = await open(browser);
    const iso = d => localDay(Date.now() - d * 864e5);
    await page.evaluate(([old, recent]) => { const d = window.__mock.docs, p = d.get("applicants/a1/private/main");
      p.refs = { r1: { name: "Ann Lee", email: "ann.lee@example.com", contacted: old, method: "Email" }, r2: { name: "Sam Ortiz", email: "sam@example.com", contacted: recent }, r3: { name: "Kim Park", email: "kim@example.com" } };
      window.__mock.emit(); }, [iso(10), iso(3)]);
    await pickApplicant(page, "Georgia Thurmond");
    await page.locator('.tabdock [data-tab="checks"]').click(); await wait(page, 300);
    if (await page.locator("#refRemind1").isHidden() || !/no answer after 10 days/.test(await page.locator("#refFormNote1").textContent())) fail("no reminder for a 10-day-old reference"); else ok("a reference emailed 10 days ago is flagged with Send reminder");
    if (await page.locator("#refRemind2").isVisible()) fail("reminder offered too early (3 days)"); else ok("no reminder before 7 days");
    await page.locator('[data-act="refsall"]').click(); await wait(page, 300);
    const rows = await page.locator("#rallList .row").evaluateAll(r => r.map(x => x.textContent.replace(/\s+/g, " ").trim()));
    if (!/Ann Lee.*Send reminder/.test(rows[0]) || !/Sam Ortiz.*waiting for their answers/.test(rows[1]) || !/Kim Park.*Open email/.test(rows[2])) fail("email-all rows: " + JSON.stringify(rows)); else ok("Email-all window: reminder for Ann, waiting for Sam, first email for Kim");
    await page.locator('[data-allmail="1"]').click(); await wait(page, 1500);
    const mail = decodeURIComponent((await page.evaluate(() => window.__clicked || [])).filter(h => h.startsWith("mailto:")).pop() || "");
    const p = await priv(page, "a1");
    if (!/Reminder: reference for Georgia Thurmond/.test(mail) || !/friendly reminder/.test(mail) || !mail.includes("/ref/" + p.refs.r1.link)) fail("reminder email: " + mail.slice(0, 160)); else ok("reminder email is polite and carries the same private link");
    if (!p.refs.r1.reminded) fail("reminded date not saved"); else ok("reminder date recorded");
    await page.locator("#modal [data-x]").click(); await wait(page, 300);
    if (await page.locator("#refRemind1").isVisible()) fail("reminder offered again right away"); else ok("no second reminder within a week");
    await ctx.close();
  }
  // ---- Overview: To do list
  {
    const { ctx, page } = await open(browser); await wait(page, 600);
    const items = await page.locator(".todo .todoitem").evaluateAll(r => r.map(x => x.textContent.replace(/\s+/g, " ").trim()));
    const has = re => items.some(t => re.test(t));
    if (!has(/Send a reference form.*Georgia Thurmond.*Ann Lee.*Email forms/) || !has(/Request the driving record.*Marcus Bell/) || !has(/Review the application.*Test Online/)) fail("to do items: " + JSON.stringify(items)); else ok("To do lists each applicant's next step");
    await page.screenshot({ path: path.join(OUT, "13-todo.png") });
    await page.locator(".todoitem", { hasText: "Georgia Thurmond" }).locator("[data-todoact]").click(); await wait(page, 300);
    if (!/Email reference forms/.test(await page.locator("#modal").textContent())) fail("Email forms action didn't open the window"); else ok("one-tap action opens Email reference forms");
    await page.keyboard.press("Escape"); await wait(page, 300);
    await page.locator(".todoitem", { hasText: "Marcus Bell" }).locator("[data-todo]").click(); await wait(page, 500);
    if (!/Marcus Bell/.test(await page.locator("#dName").textContent()) || !(await page.locator('.tabdock [data-tab="checks"][aria-selected="true"]').count())) fail("to do row didn't open Marcus on Checks"); else ok("tapping a to-do opens the file on the right tab");
    await ctx.close();
  }
  // ---- Welcome: a new online application gets portal access, a welcome message and the welcome email in one step
  {
    const { ctx, page } = await open(browser); await wait(page, 600);
    await pickApplicant(page, "Marcus Bell");   // a different file open, so the email must follow the row clicked, not the selection
    await page.keyboard.press("Escape"); await wait(page, 300);
    const row = page.locator(".todo .todoitem", { hasText: "Welcome Test" });
    if (!(await row.count()) || !/Test Online/.test(await row.textContent())) fail("no Welcome to-do for the new online application"); else ok("new online applications show Welcome at the top of To do");
    await row.locator("[data-todoact]").click(); await wait(page, 800);
    const st = await page.evaluate(() => { const d = window.__mock.docs, id = [...d.keys()].find(k => /^applicants\/[^/]+$/.test(k) && d.get(k).name === "Test Online").split("/")[1];
      const pm = d.get(`applicants/${id}/private/main`) || {}, msgs = [...d.entries()].filter(([k]) => k.startsWith(`portal/${id}/messages/`)).map(([, v]) => v);
      return { portal: d.get(`portal/${id}`)?.email, invited: pm.portal?.invited, welcomed: pm.portal?.welcomed, msgs }; });
    if (st.portal !== "test.online@example.com" || !st.invited || !st.welcomed) fail("welcome didn't open the portal: " + JSON.stringify(st)); else ok("Welcome opens their portal and records the date");
    if (st.msgs.length !== 1 || st.msgs[0].from !== "staff" || !/^Hi Test, welcome/.test(st.msgs[0].text) || st.msgs[0].text.length > 2000) fail("welcome message: " + JSON.stringify(st.msgs)); else ok("a welcome message is waiting in their portal");
    const m = await page.locator("#modal").textContent();
    if (!/Welcome email/.test(m) || !/test\.online@example\.com/.test(m) || /marcus/i.test(m)) fail("welcome email window: " + m.slice(0, 200)); else ok("the welcome email opens for the applicant clicked");
    await page.keyboard.press("Escape"); await wait(page, 300);
    const resend = await page.evaluate(() => [...document.querySelectorAll(".todo .todoitem")].some(r => /Welcome Test/.test(r.textContent)));
    if (resend) fail("Welcome still on the To do list"); else ok("Welcome leaves the To do list once done");
    await pickApplicant(page, "Test Online");
    if ((await page.locator("#inviteBtn").textContent()) !== "Resend link") fail("invite button after welcome: " + await page.locator("#inviteBtn").textContent());
    await page.locator("#inviteBtn").click(); await wait(page, 600);
    const n = await page.evaluate(() => [...window.__mock.docs.keys()].filter(k => /^portal\/[^/]+\/messages\//.test(k) && window.__mock.docs.get(k).text.startsWith("Hi Test, welcome")).length);
    if (n !== 1) fail("resending the link posted another welcome: " + n); else ok("resending the link doesn't repeat the welcome");
    await ctx.close();
  }
  // ---- Saved replies: chips fill the reply box; Settings edits them
  {
    const { ctx, page } = await open(browser); await wait(page, 600);
    await pickApplicant(page, "Marcus Bell");
    await page.locator('.tabdock [data-tab="msgs"]').click(); await wait(page, 300);
    await page.locator('#qReplies [data-qr]', { hasText: "Documents received" }).click(); await wait(page, 100);
    if (await page.locator("#replyText").inputValue() !== "Thanks, Marcus. We received your documents and they're under review.") fail("saved reply text: " + await page.locator("#replyText").inputValue()); else ok("a saved reply fills the box with their first name");
    await page.evaluate(() => document.querySelector("#settingsBtn")?.click()); await wait(page, 300);
    await page.locator("#qrAdd").click();
    await page.locator("#qrList .qredit:last-child .qrTitle").fill("Welcome back");
    await page.locator("#qrList .qredit:last-child .qrText").fill("Good to hear from you, {first}.");
    await page.locator("#qrList .qredit").first().locator("[data-qrrm]").click();
    await page.locator("#sSave").click(); await wait(page, 400);
    const r = await page.evaluate(() => window.__mock.docs.get("settings/main").replies);
    if (!r || r.length !== 5 || r[0].title !== "Documents received" || r[4].title !== "Welcome back") fail("saved replies settings: " + JSON.stringify(r)); else ok("Settings adds and removes saved replies");
    await ctx.close();
  }
  // ---- New-member checklist and expiration reminders
  {
    const { ctx, page } = await open(browser); await wait(page, 600);
    await pickApplicant(page, "Marcus Bell");
    await page.locator('.tabdock [data-tab="onb"]').click(); await wait(page, 300);
    const soon = localDay(Date.now() + 10 * 864e5);
    await page.locator('[data-k="onb.cprExpires"]').fill(soon); await page.locator('[data-k="onb.cprExpires"]').blur(); await wait(page, 400);
    if ((await priv(page, "a2"))?.onb?.cprExpires !== soon) fail("CPR expiry not saved privately"); else ok("expiration dates save to the private record");
    const items = await page.locator('[data-k^="onb.items."]').count();
    if (items !== 15 || !/0 of 15 done/.test(await page.locator("#onbCount").textContent())) fail("checklist rows: " + items); else ok("Onboard tab shows the new-member checklist");
    await pickApplicant(page, "Georgia Thurmond");
    await page.locator('.tabdock [data-tab="board"]').click(); await wait(page, 300);
    await page.locator('[data-k="board.result"] [data-v="approved"]').click(); await wait(page, 300);
    await page.locator('.tabdock [data-tab="onb"]').click(); await wait(page, 300);
    await page.locator('[data-k="onb.items.completed_application"]').fill(localDay(Date.now())); await page.locator('[data-k="onb.items.completed_application"]').blur(); await wait(page, 400);
    if (!/1 of 15 done/.test(await page.locator("#onbCount").textContent())) fail("checklist count: " + await page.locator("#onbCount").textContent()); else ok("checking off an item updates the count");
    await page.keyboard.press("Escape"); await wait(page, 200); await page.keyboard.press("Escape"); await wait(page, 500);
    await page.evaluate(() => document.querySelector("#overviewBtn")?.click()); await wait(page, 500);
    await page.evaluate(() => document.querySelector('[data-cmd="todoall"]')?.click()); await wait(page, 300);
    const td = await page.locator(".todo .todoitem").evaluateAll(r => r.map(x => x.textContent.replace(/\s+/g, " ").trim()));
    if (!td.some(t => /CPR \/ BLS card expires in 10 days.*Marcus Bell/.test(t))) fail("no expiry to do: " + JSON.stringify(td)); else ok("To do warns 30 days before a card expires");
    if (!td.some(t => /Finish the new-member checklist.*Georgia Thurmond.*1 of 15 done · next: Acknowledgement of Sterling/.test(t))) fail("no checklist to do: " + JSON.stringify(td)); else ok("To do tracks the new-member checklist after approval");
    await ctx.close();
  }
  // ---- Data retention: old declined/withdrawn files are flagged for review, never deleted automatically
  {
    const old = Date.now() - 5 * 365 * 864e5;
    const { ctx, page } = await open(browser, { seed: [["applicants/old1", { name: "Pat Oldfile", email: "pat@example.com", status: "withdrawn", app: { received: "2021-01-05" }, updatedAt: old, createdAt: old }],
      ["applicants/old1/private/main", { status: "withdrawn", secUpdatedAt: old }]] }); await wait(page, 600);
    if (await page.locator(".todo .todoitem", { hasText: "old file" }).count()) fail("retention flagged while it's off"); else ok("retention is off until a period is set");
    await page.evaluate(() => document.querySelector("#settingsBtn")?.click()); await wait(page, 300);
    await page.locator("#sRet").fill("3"); await page.locator("#sSave").click(); await wait(page, 500);
    const row = page.locator(".todo .todoitem", { hasText: "old file" });
    if (!/Review an old file past the 3-year retention.*Pat Oldfile/.test(await row.textContent().catch(() => ""))) fail("retention to do missing"); else ok("To do flags files past the retention period");
    await row.locator("[data-todoact]").click(); await wait(page, 300);
    await page.locator("#retGo").click(); await wait(page, 100);
    if (!(await page.evaluate(() => window.__mock.docs.has("applicants/old1")))) fail("deleted without confirming"); else ok("deleting old files asks to confirm");
    await page.locator("#retGo").click(); await wait(page, 800);
    if (await page.evaluate(() => window.__mock.docs.has("applicants/old1") || window.__mock.docs.has("applicants/old1/private/main"))) fail("old file not deleted"); else ok("confirmed old files are deleted");
    if (!(await page.evaluate(() => window.__mock.docs.has("applicants/a1")))) fail("retention deleted an active file"); else ok("active files are untouched");
    await ctx.close();
  }
  // ---- Two-step sign-in: set up from the key button; sign-in asks for the code
  {
    const { ctx, page } = await open(browser); await wait(page, 600);
    await page.locator("#pwBtn").click(); await wait(page, 200);
    if (!/Off/.test(await page.locator("#modal").textContent())) fail("two-step status not shown"); else ok("the key button shows two-step sign-in status");
    await page.locator("#twoStepBtn").click(); await wait(page, 200);
    await page.locator("#tsStart").click(); await wait(page, 300);
    if (!/JBSW Y3DP EHPK 3PXP/.test(await page.locator(".tskey").textContent()) || !/^otpauth:\/\/totp\//.test(await page.locator('#tsBody a.btn').getAttribute("href"))) fail("setup key / app link missing"); else ok("setup shows a key to type and an Open in app link");
    await page.locator("#tsCode").fill("000000"); await page.locator("#tsForm button[type=submit]").click(); await wait(page, 300);
    if (await page.evaluate(() => (window.__mock.enrolled || []).length)) fail("wrong code turned it on"); else ok("a wrong code doesn't turn it on");
    await page.locator("#tsCode").fill("123456"); await page.locator("#tsForm button[type=submit]").click(); await wait(page, 300);
    if (await page.evaluate(() => (window.__mock.enrolled || []).length) !== 1 || !(await page.locator("#modal").isHidden())) fail("two-step not enrolled"); else ok("the right code turns two-step sign-in on");
    await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, { url: "/signin", user: null }); await wait(page, 400);
    await page.evaluate(() => { window.__mock.mfaUser = { email: "dkota@pvrs.org", displayName: "Dkota Wright" }; });
    await page.evaluate(() => { document.querySelector('[data-who="staff"]')?.click(); document.querySelector("#manualSignin").open = true; });
    await page.locator("#pwEmail").fill("dkota@pvrs.org"); await page.locator("#pwPass").fill("long-enough-password");
    await page.locator("#pwForm button[type=submit]").click(); await wait(page, 300);
    if (!(await page.locator("#mfaCode").count())) fail("sign-in didn't ask for the code"); else ok("password sign-in asks for the code when two-step is on");
    await page.locator("#mfaCode").fill("111111"); await page.locator("#mfaForm button[type=submit]").click(); await wait(page, 300);
    if (await page.evaluate(() => !!window.__MOCK_USER)) fail("wrong code signed in"); else ok("a wrong code doesn't sign in");
    await page.locator("#mfaCode").fill("123456"); await page.locator("#mfaForm button[type=submit]").click(); await wait(page, 1200);
    if (!(await page.locator("#desk").isVisible().catch(() => false)) && !(await page.locator("#app").isVisible().catch(() => false))) fail("the right code didn't open the desk"); else ok("the right code opens the desk");
    await ctx.close();
  }
  // ---- Notifications: off until the Web Push key is set; then each device turns them on for itself
  {
    const { ctx, page } = await open(browser, { files: { "/js/config.js": t => t.replace(/VAPID_KEY = "[^"]*"/, 'VAPID_KEY = ""') } }); await wait(page, 600);
    await page.locator("#pwBtn").click(); await wait(page, 200); await page.locator("#notifBtn").click(); await wait(page, 400);
    if (!/aren't set up for PVRS yet/.test(await page.locator("#modal").textContent())) fail("notifications without a key: " + await page.locator("#modal").textContent()); else ok("notifications explain they need setting up first");
    await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, { files: { "/js/config.js": t => t.replace(/VAPID_KEY = "[^"]*"/, 'VAPID_KEY = "test-key"') } }); await wait(page, 600);
    // Headless browsers (GitHub's Linux one especially) may report notifications as missing or blocked: stand in for them.
    await page.evaluate(() => { window.__mock.pushOk = true;
      Object.defineProperty(window, "Notification", { configurable: true, value: { permission: "default", requestPermission: async () => "granted" } });
      if (!navigator.serviceWorker) Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: {} });
      navigator.serviceWorker.register = async () => ({}); });
    await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k"); await page.locator("#palQ").fill("notif"); await wait(page, 150); await page.keyboard.press("Enter"); await wait(page, 500);
    await page.locator("#pushGo").click(); await wait(page, 500);
    const t = await page.evaluate(() => [...window.__mock.docs.entries()].filter(([k]) => k.startsWith("pushTokens/")).map(([k, v]) => ({ k, ...v })));
    if (t.length !== 1 || t[0].email !== "dkota@pvrs.org" || !t[0].device) fail("push token: " + JSON.stringify(t)); else ok("turning notifications on registers this device");
    await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k"); await page.locator("#palQ").fill("notif"); await wait(page, 150); await page.keyboard.press("Enter"); await wait(page, 500);
    await page.locator("#pushStop").click(); await wait(page, 500);
    if (await page.evaluate(() => [...window.__mock.docs.keys()].some(k => k.startsWith("pushTokens/")))) fail("push token not removed"); else ok("turning them off removes this device");
    await ctx.close();
  }
  // ---- a notification's link (/?open=<id>) opens that applicant's file; phones reach Notifications from More
  {
    const { ctx, page } = await open(browser, { url: "/?open=a2" }); await wait(page, 800);
    if (!/Marcus Bell/.test(await page.locator("#dName").textContent().catch(() => "")) || /open=/.test(await page.evaluate(() => location.search))) fail("?open= didn't open the file"); else ok("tapping a notification opens that applicant's file");
    await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, { w: 430, h: 844 }); await wait(page, 700);
    await page.evaluate(() => [...document.querySelectorAll("#mnav button")].find(b => /More/.test(b.textContent))?.click()); await wait(page, 400);
    const nb = page.locator("#modal [data-notif]");
    if (!(await nb.count())) fail("More sheet has no Notifications"); else { await nb.click(); await wait(page, 500);
      if (!/Notifications/.test(await page.locator("#modal h3").textContent())) fail("More → Notifications didn't open"); else ok("phones open Notifications from the More menu"); }
    await ctx.close();
  }
  // ---- Team messaging: channels (owner creates, picks members) and applicant conversations (owner adds squad members)
  {
    const now = Date.now();
    const { ctx, page } = await open(browser, { seed: [["portal/a2/messages/m1", { text: "When is my interview?", from: "applicant", by: "marcus.bell@example.com", name: "Marcus", at: now - 6e5 }]] }); await wait(page, 700);
    if (!/1/.test(await page.locator("#msgsBtn .navbadge").textContent().catch(() => ""))) fail("no unread badge on Messages"); else ok("unread applicant messages show on the Messages button");
    await page.locator("#msgsBtn").click(); await wait(page, 400);
    if (!(await page.locator(".cv").count()) || !/Marcus Bell/.test(await page.locator("#cvRows").textContent())) fail("Messages screen: " + (await page.locator("#detail").textContent()).slice(0, 200)); else ok("Messages opens as a full screen with applicant conversations");
    // new channel with Casey (admin) in it
    await page.locator("[data-chnew]").click(); await wait(page, 300);
    await page.locator("#chName").fill("#interview-team");
    await page.locator('.cv-pick input[value="admin@pvrs.org"]').check();
    await page.locator('[data-chcolor="onb"]').click();
    await page.locator("#chSave").click(); await wait(page, 600);
    const ch = await page.evaluate(() => [...window.__mock.docs.entries()].find(([k, v]) => /^channels\/[^/]+$/.test(k) && v.name === "interview-team"));
    if (!ch || ch[1].members.join() !== "dkota@pvrs.org,admin@pvrs.org" || ch[1].color !== "onb" || ch[1].names["admin@pvrs.org"] !== "Casey Admin") fail("channel saved: " + JSON.stringify(ch)); else ok("owner creates a channel and picks its members");
    await page.locator("#cvText").fill("Who can take Marcus's interview Thursday?"); await page.locator("#cvText").press("Enter"); await wait(page, 500);
    const post = await page.evaluate(id => [...window.__mock.docs.entries()].filter(([k]) => k.startsWith(`channels/${id}/posts/`)).map(([, v]) => v), ch[0].split("/")[1]);
    if (post.length !== 1 || post[0].by !== "dkota@pvrs.org" || !/Thursday/.test(post[0].text)) fail("channel post: " + JSON.stringify(post)); else ok("Enter sends a message to the channel");
    if (!/Who can take Marcus/.test(await page.locator("#cvMsgs").textContent())) fail("post not shown"); else ok("the message shows in the channel");
    await page.screenshot({ path: path.join(OUT, "40-messages-channel.png") });
    // applicant conversation: open, mark read, add Casey, reply
    await page.locator('[data-chat="a:a2"]').click(); await wait(page, 500);
    if (!/When is my interview/.test(await page.locator("#cvMsgs").textContent())) fail("applicant thread not shown"); else ok("applicant conversation opens in Messages");
    const rd = await page.evaluate(() => window.__mock.docs.get("chatReads/dkota@pvrs.org"));
    if (!rd || !rd["a:a2"]) fail("not marked read: " + JSON.stringify(rd)); else ok("opening a conversation marks it read for you");
    await page.locator("[data-cvedit]").click(); await wait(page, 300);
    await page.locator('.cv-pick input[value="admin@pvrs.org"]').check(); await page.locator("#cvSave").click(); await wait(page, 500);
    const cv = await page.evaluate(() => window.__mock.docs.get("convos/a2"));
    if (!cv || cv.members.join() !== "admin@pvrs.org") fail("convo members: " + JSON.stringify(cv)); else ok("owner adds a squad member to an applicant's conversation");
    await page.locator('#cvMsgs').waitFor(); await page.locator("#cvText").fill("Thursday at 7 works!"); await page.locator("[data-chsend]").click(); await wait(page, 500);
    const rep = await page.evaluate(() => [...window.__mock.docs.entries()].filter(([k]) => k.startsWith("portal/a2/messages/")).map(([, v]) => v).find(m => m.from === "staff"));
    if (!rep || rep.by !== "dkota@pvrs.org" || rep.text !== "Thursday at 7 works!") fail("reply: " + JSON.stringify(rep)); else ok("replying from Messages reaches the applicant's portal");
    await page.screenshot({ path: path.join(OUT, "41-messages-applicant.png") });
    const seed = await page.evaluate(() => [...window.__mock.docs.entries()].filter(([k]) => /^(channels|convos|portal\/a2\/messages)\//.test(k)));
    await ctx.close();
    // Casey (admin): sees only what she's in, and can reply to Marcus
    { const { ctx, page } = await open(browser, { user: { email: "admin@pvrs.org", displayName: "Casey" }, seed }); await wait(page, 800);
      await page.locator("#msgsBtn").click(); await wait(page, 500);
      const rows = await page.locator("#cvRows").textContent();
      if (!/interview-team/.test(rows) || !/Marcus Bell/.test(rows) || /Georgia/.test(rows)) fail("admin's list: " + rows); else ok("an admin sees only the channels and conversations she's in");
      await page.locator('[data-chat="a:a2"]').click(); await wait(page, 400);
      if (!(await page.locator("#cvText").count())) fail("admin in convo can't reply"); else { await page.locator("#cvText").fill("Hi Marcus, I'm Casey."); await page.locator("#cvText").press("Enter"); await wait(page, 500);
        const m = await page.evaluate(() => [...window.__mock.docs.values()].find(v => v.text === "Hi Marcus, I'm Casey."));
        if (!m || m.from !== "staff" || m.by !== "admin@pvrs.org" || m.name !== "Casey") fail("admin reply: " + JSON.stringify(m)); else ok("a squad member added to a conversation can reply"); }
      await ctx.close(); }
    // Alex (member, in nothing): told how to get added
    { const { ctx, page } = await open(browser, { user: { email: "alex@pvrs.org", displayName: "Alex" }, seed }); await wait(page, 800);
      if (await page.locator("#msgsBtn").isHidden()) fail("members have no Messages"); else { await page.locator("#msgsBtn").click(); await wait(page, 400);
        if (!/not in any channels/.test(await page.locator("#cvRows").textContent())) fail("member list: " + await page.locator("#cvRows").textContent()); else ok("a member who isn't in anything sees how to get added"); }
      await ctx.close(); }
    // phone: list → conversation → back; and a notification link opens the channel
    { const { ctx, page } = await open(browser, { w: 390, h: 844, seed }); await wait(page, 800);
      await page.locator('#mnav [data-m="msgs"]').click(); await wait(page, 400);
      if (!(await page.locator(".cv-list").isVisible()) || await page.locator(".cv-thread").isVisible()) fail("phone: list first"); else ok("phone: Messages shows the conversation list first");
      await page.locator('[data-chat="a:a2"]').click(); await wait(page, 400);
      if (await page.locator(".cv-list").isVisible() || !(await page.locator("#cvText").isVisible())) fail("phone: thread"); else ok("phone: tapping a conversation opens it full screen");
      await page.screenshot({ path: path.join(OUT, "42-messages-phone.png") });
      await page.locator("[data-chback]").click(); await wait(page, 300);
      if (!(await page.locator(".cv-list").isVisible())) fail("phone: back"); else ok("phone: back returns to the list");
      await ctx.close(); }
    { const cid = seed.find(([k]) => /^channels\/[^/]+$/.test(k))[0].split("/")[1];
      const { ctx, page } = await open(browser, { url: "/?chat=c:" + cid, seed }); await wait(page, 900);
      if (!/interview-team/.test(await page.locator(".cv-th").textContent().catch(() => ""))) fail("?chat= link"); else ok("a chat notification opens that channel");
      await ctx.close(); }
    // the applicant sees who replied
    { const { ctx, page } = await open(browser, { w: 430, h: 844, user: { email: "marcus.bell@example.com", displayName: "Marcus" }, seed }); await wait(page, 900);
      const t = await page.locator("#portal").textContent();
      if (!/Dkota · PVRS Membership/.test(t) || /interview-team/.test(t)) fail("portal labels: " + t.replace(/\s+/g, " ").slice(0, 900)); else ok("applicants see the replier's first name with PVRS Membership, never squad channels");
      await ctx.close(); }
  }
  // ---- Interviewer role: only assigned applicants; members see none
  {
    const { ctx, page } = await open(browser, { seed: [["staff/ivy@pvrs.org", { role: "interviewer", name: "Ivy Interviewer" }]] }); await wait(page, 700);
    await page.locator("#settingsBtn").click(); await wait(page, 500);
    if (await page.locator("#teamList").count() || !(await page.locator("#sTeam").count())) fail("Team is still inside Settings"); else ok("Settings no longer holds the team list; it points to Team");
    await page.locator("#sTeam").click(); await wait(page, 400);
    if (!/What each role can do/.test(await page.locator("#modal").textContent()) || !(await page.locator("#teamList").count())) fail("Team menu didn't open"); else ok("Team is its own menu with the roles explained");
    const seg = page.locator('[data-rolesel="alex@pvrs.org"]');
    if (!(await seg.count())) fail("Team has no role picker"); else { await seg.selectOption("interviewer"); await wait(page, 400);
      if ((await page.evaluate(() => window.__mock.docs.get("staff/alex@pvrs.org").role)) !== "interviewer") fail("role not saved"); else ok("Settings → Team offers Member, Interviewer, Admin"); }
    await page.setViewportSize({ width: 390, height: 844 }); await wait(page, 300);
    { const box = await seg.boundingBox(); if (!box || box.height < 44 || box.width < 150 || box.x < 0 || box.x + box.width > 390) fail("role picker too small on a phone: " + JSON.stringify(box)); else ok("the role picker is a large dropdown on phones");
      await page.screenshot({ path: path.join(OUT, "58-team-phone.png") }); }
    await page.setViewportSize({ width: 1440, height: 900 }); await wait(page, 300);
    await page.keyboard.press("Escape"); await wait(page, 300);
    await pickApplicant(page, "Georgia Thurmond");
    await page.locator('.tabdock [data-tab="iv"]').click(); await wait(page, 300);
    if (!/Nobody assigned yet/.test(await page.locator("#ivAssign").textContent())) fail("assign box: " + await page.locator("#ivAssign").textContent()); else ok("Interview tab shows who's assigned");
    await page.locator('[data-act="assigniv"]').click(); await wait(page, 300);
    const opts = await page.locator(".cv-pick input").evaluateAll(xs => xs.map(x => x.value));
    if (opts.includes("dkota@pvrs.org") || !opts.includes("ivy@pvrs.org") || !opts.includes("admin@pvrs.org")) fail("assign options: " + opts); else ok("only interviewers and admins can be assigned");
    await page.locator('.cv-pick input[value="ivy@pvrs.org"]').check(); await page.locator("#ivaSave").click(); await wait(page, 600);
    const a1 = await page.evaluate(() => window.__mock.docs.get("applicants/a1")), cv = await page.evaluate(() => window.__mock.docs.get("convos/a1"));
    if ((a1.interviewers || []).join() !== "ivy@pvrs.org") fail("assignment: " + JSON.stringify(a1.interviewers)); else ok("assigning saves the interviewer on the file");
    if (!cv || !cv.members.includes("ivy@pvrs.org")) fail("convo not updated: " + JSON.stringify(cv)); else ok("assigning also adds them to the applicant's conversation");
    if (!/Ivy Interviewer/.test(await page.locator("#ivAssign").textContent())) fail("assigned name not shown"); else ok("the assigned interviewer shows on the Interview tab");
    await page.screenshot({ path: path.join(OUT, "50-assign-interviewer.png") });
    const seed = await page.evaluate(() => [...window.__mock.docs.entries()].filter(([k]) => /^(staff\/ivy|convos\/)/.test(k)));
    const ivs = (await page.evaluate(() => window.__mock.docs.get("applicants/a1"))).interviewers;
    // unassign removes them from the conversation too
    await page.locator('[data-act="assigniv"]').click(); await wait(page, 300);
    await page.locator('.cv-pick input[value="ivy@pvrs.org"]').uncheck(); await page.locator("#ivaSave").click(); await wait(page, 600);
    if (await page.evaluate(() => (window.__mock.docs.get("convos/a1")?.members || []).includes("ivy@pvrs.org"))) fail("unassign left them in the conversation"); else ok("unassigning takes them out of the conversation");
    await ctx.close();
    // Ivy, assigned to Georgia only
    { const { ctx, page } = await open(browser, { user: { email: "ivy@pvrs.org", displayName: "Ivy" }, seed }); await wait(page, 500);
      await page.evaluate(v => { window.__mock.docs.get("applicants/a1").interviewers = v; window.__mock.emit(); }, ivs); await wait(page, 500);
      const names = await page.locator("#list .arow").allTextContents();
      if (names.length !== 1 || !/Georgia/.test(names[0])) fail("interviewer's list: " + names); else ok("an interviewer sees only the applicants assigned to them");
      await pickApplicant(page, "Georgia Thurmond");
      const tabs = await page.locator(".tabdock [data-tab]").evaluateAll(b => b.map(x => x.dataset.tab));
      if (tabs.join() !== "app,iv") fail("interviewer tabs: " + tabs); else ok("an interviewer gets only the Application and Interview tabs");
      if (!/Interviewer/.test(await page.locator("#conn").textContent())) fail("role label"); else ok("the sidebar shows the Interviewer role");
      await page.screenshot({ path: path.join(OUT, "51-interviewer-view.png") });
      await ctx.close(); }
    // Alex, a member: no applicants, Messages opens
    { const { ctx, page } = await open(browser, { user: { email: "alex@pvrs.org", displayName: "Alex" } }); await wait(page, 900);
      if (await page.locator("#list .arow").count() || !/Messages only/.test(await page.locator("#list").textContent())) fail("member list: " + await page.locator("#list").textContent()); else ok("members see no applicant files");
      if (!(await page.locator(".cv").count())) fail("member didn't land on Messages"); else ok("members land on Messages");
      await ctx.close(); }
  }
  // ---- Interview coordinator: sees every file, runs scheduling (times, booking, who interviews, booking switch, messages)
  {
    const CORY = { email: "cory@pvrs.org", displayName: "Cory Reed" };
    const { ctx, page } = await open(browser, { user: CORY, seed: [["staff/cory@pvrs.org", { role: "coordinator", name: "Cory Reed" }], ["staff/ivy@pvrs.org", { role: "interviewer", name: "Ivy Lane" }]] }); await wait(page, 900);
    if (!/Interview coordinator/.test(await page.locator("#conn").textContent())) fail("coordinator label: " + await page.locator("#conn").textContent()); else ok("the sidebar shows the Interview coordinator role");
    if ((await page.locator("#list .arow, #ovRoster .arow").count()) < 2) fail("coordinator can't see every file"); else ok("a coordinator sees every applicant");
    if (!(await page.locator("#settingsBtn").isHidden()) || !(await page.locator("#teamBtn").isHidden()) || !(await page.locator("#newBtn").isHidden())) fail("coordinator got Settings / Team / New applicant"); else ok("Settings and New applicant stay with the owner");
    const todo = await page.locator(".ovcard.todo").textContent();
    if (!/Interviews to do/.test(todo) || !/Post interview times|Add more interview times/.test(todo)) fail("coordinator to do: " + todo.slice(0, 300)); else ok("the coordinator's To do is the interview work");
    // post a time, hosted by Ivy
    await page.locator('.todo [data-todoact="slots"]').click(); await wait(page, 300);
    if (!(await page.locator("#slHost").count())) fail("coordinator can't pick the interviewer for a time"); else { await page.locator("#slHost").selectOption("ivy@pvrs.org"); ok("a coordinator posts times for any interviewer"); }
    await page.locator("#slotForm button[type=submit]").click(); await wait(page, 500);
    const sl = await page.evaluate(() => [...window.__mock.docs.entries()].filter(([k, v]) => k.startsWith("slots/") && v.host === "ivy@pvrs.org").map(([k]) => k.slice(6)));
    if (sl.length !== 1) fail("coordinator slot: " + sl); else ok("the time is saved under that interviewer");
    await page.locator("#modal [data-x]").click(); await wait(page, 300);
    // Marcus: open booking, book him, assign, message
    await pickApplicant(page, "Marcus Bell");
    const tabs = await page.locator(".tabdock [data-tab]").evaluateAll(b => b.map(x => x.dataset.tab));
    if (!tabs.includes("checks") || !tabs.includes("board")) fail("coordinator tabs: " + tabs); else ok("a coordinator can open every tab");
    if (!(await page.locator('#f-name, [data-k="name"]').first().isDisabled())) fail("coordinator can edit the name"); else ok("the rest of the file stays view only");
    await page.locator('.seg[data-k="portal.bookingOpen"] button[data-v="yes"]').click(); await wait(page, 1200);
    const bo = await page.evaluate(() => [window.__mock.docs.get("applicants/a2/private/main").portal.bookingOpen, window.__mock.docs.get("portal/a2").bookingOpen, window.__mock.docs.get("portal/a2").email]);
    if (bo[0] !== "yes" || bo[1] !== true || bo[2] !== "marcus.bell@example.com") fail("open booking: " + JSON.stringify(bo)); else ok("a coordinator opens booking and the applicant's portal follows");
    if (!/pick a time/i.test(await page.locator("#emSubject").inputValue().catch(() => ""))) fail("opening booking didn't offer the interview email"); else ok("opening booking offers the interview email");
    await page.locator("#emCancel").click(); await wait(page, 300);
    await page.locator('.tabdock [data-tab="iv"]').click(); await wait(page, 300);
    if (await page.locator('[data-k="sched.contacted"]').first().isDisabled()) fail("scheduling dates locked for the coordinator"); else ok("a coordinator fills in the scheduling dates");
    await page.locator('#bookedActs [data-act="book"]').click(); await wait(page, 300);
    await page.locator(`[data-bk="${sl[0]}"]`).click(); await wait(page, 600);
    const bk = await page.evaluate(id => [window.__mock.docs.get("slots/" + id).bookedBy, window.__mock.docs.get("portal/a2").interview?.slotId], sl[0]);
    if (bk[0] !== "a2" || bk[1] !== sl[0]) fail("coordinator booking: " + JSON.stringify(bk)); else ok("a coordinator books an applicant into a time");
    await page.locator('[data-act="assigniv"]').click(); await wait(page, 300);
    await page.locator('.cv-pick input[value="ivy@pvrs.org"]').check(); await page.locator("#ivaSave").click(); await wait(page, 600);
    const asg = await page.evaluate(() => [window.__mock.docs.get("applicants/a2").interviewers, window.__mock.docs.get("convos/a2")?.members]);
    if ((asg[0] || []).join() !== "ivy@pvrs.org" || !(asg[1] || []).includes("ivy@pvrs.org")) fail("coordinator assign: " + JSON.stringify(asg)); else ok("a coordinator assigns interviewers");
    await page.locator('.tabdock [data-tab="msgs"]').click(); await wait(page, 300);
    await page.locator("#replyText").fill("Hi Marcus, you're booked."); await page.locator("#replyMail").uncheck(); await page.locator("[data-reply]").click(); await wait(page, 500);
    const rp = await page.evaluate(() => [...window.__mock.docs.entries()].filter(([k]) => k.startsWith("portal/a2/messages/")).map(([, v]) => v).find(m => m.by === "cory@pvrs.org"));
    if (!rp || rp.from !== "staff" || rp.name !== "Cory") fail("coordinator reply: " + JSON.stringify(rp)); else ok("a coordinator replies to applicants under their own first name");
    await page.locator('[data-act="email"]').first().click(); await wait(page, 300);
    if (!/pick a time/i.test(await page.locator("#emSubject").inputValue().catch(() => ""))) fail("coordinator email isn't the interview email"); else ok("the coordinator's Email button opens the interview email");
    await page.screenshot({ path: path.join(OUT, "52-coordinator.png") });
    await ctx.close();
  }
  // ---- Progress: five labelled phases, and the Interview phase says outright whether a time is set
  {
    const d = n => localDay(Date.now() - n * 864e5), ref = { returned: d(3) };
    const seed = [["applicants/p1", { name: "Pat Waiting", email: "pat@example.com", type: "Regular", app: { received: d(20), complete: "yes" }, updatedAt: Date.now() }],
      ["applicants/p1/private/main", { mvr: { completed: d(10) }, dl: { date: d(9), valid: "yes" }, refs: { r1: { name: "A", ...ref }, r2: { name: "B", ...ref }, r3: { name: "C", ...ref } }, portal: { invited: d(15) } }],
      ["portal/p1", { email: "pat@example.com", name: "Pat Waiting", firstName: "Pat", steps: [], docs: [], refs: [], bookingOpen: false }],
      ["slots/ps1", { start: Date.now() + 4 * 864e5, duration: 30, location: "Station", bookedBy: null }]];
    const { ctx, page } = await open(browser, { seed }); await wait(page, 900);
    const row = await page.evaluate(() => [...document.querySelectorAll(".arow")].find(r => r.textContent.includes("Pat Waiting"))?.textContent || "");
    if (!/Interview not scheduled/.test(row) || !/Interview isn't scheduled yet/.test(row) || /Next: Interview scheduled/.test(row)) fail("list row status: " + row.replace(/\s+/g, " ")); else ok("the list says the interview isn't scheduled, not just Interview");
    if (!/1 not scheduled yet/.test(await page.locator('.stg[data-filter="int"]').textContent())) fail("Interview tile doesn't count unscheduled"); else ok("the Interview tile counts who still needs a time");
    await pickApplicant(page, "Pat Waiting");
    const ph = await page.locator("#dProg .ph").evaluateAll(l => l.map(x => x.className.replace("ph", "").trim() + ":" + x.textContent.replace(/\s+/g, " ").trim()));
    if (ph.length !== 5 || !/^done:Screening ?Done/.test(ph[0]) || !/^cur:Interview ?0 of 2/.test(ph[1]) || /done|cur/.test(ph[2])) fail("phases: " + ph.join(" | ")); else ok("the header shows five labelled phases with the current one marked");
    const st = (await page.locator("#dProg .t").textContent()).replace(/\s+/g, " ");
    if (!/Interview isn't scheduled yet/.test(st) || !/Open interview booking\. Pat can then pick a time/.test(st) || !/Schedule it/.test(st) || !/5 of 14 steps/.test(st)) fail("status line: " + st); else ok("one sentence says where they stand and what to do");
    await page.screenshot({ path: path.join(OUT, "54-progress-not-scheduled.png") });
    const pd = await page.evaluate(() => window.__mock.docs.get("portal/p1").steps.find(x => x.label === "Interview"));
    if (pd?.state !== "now" || pd.short !== "not scheduled yet" || !/Not scheduled yet/.test(pd.detail)) fail("portal interview step: " + JSON.stringify(pd)); else ok("the applicant's portal also says not scheduled yet");
    await page.locator('#dProg [data-act="nextgo"]').click(); await wait(page, 500);
    await page.locator('[data-bk="ps1"]').click(); await wait(page, 900);
    const st2 = (await page.locator("#dProg .t").textContent()).replace(/\s+/g, " "), ph2 = await page.locator("#dProg .ph.cur").textContent();
    if (!/Interview booked for /.test(st2) || !/1 of 2/.test(ph2) || !/Interview booked/.test(await page.locator("#dSub .pill").textContent())) fail("after booking: " + st2 + " | " + ph2); else ok("booking a time flips it to Interview booked with the date");
    await page.screenshot({ path: path.join(OUT, "55-progress-booked.png") });
    await ctx.close();
    { const { ctx, page } = await open(browser, { seed, w: 390, h: 844 }); await wait(page, 900);
      await pickApplicant(page, "Pat Waiting");
      if (!(await page.locator("#dProg .t").isVisible()) || (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1))) fail("phone progress hidden or too wide"); else ok("phones show the phases and the status sentence");
      await page.screenshot({ path: path.join(OUT, "56-progress-phone.png") });
      await ctx.close(); }
  }
  // ---- Nov 11 batch: My paperwork, coordinator sync + no-show, brief, impressions, reports, portal extras
  {
    const d = n => localDay(Date.now() - n * 864e5), ref = { returned: d(3) }, past = Date.now() - 3 * 36e5;
    const seed = [["applicants/q1", { name: "Quinn Late", email: "quinn@example.com", type: "Regular", app: { received: d(20), complete: "yes" }, iv: { about: "To help my neighbors" }, interviewers: ["ivy@pvrs.org"], updatedAt: Date.now() - 20 * 864e5, stage: "screen" }],
      ["applicants/q1/private/main", { mvr: { completed: d(10) }, dl: { date: d(9), valid: "yes" }, refs: { r1: { name: "A", ...ref }, r2: { name: "B", ...ref }, r3: { name: "C", ...ref } }, portal: { invited: d(15), bookingOpen: "no" }, secUpdatedAt: Date.now() - 20 * 864e5 }],
      ["portal/q1", { email: "quinn@example.com", name: "Quinn Late", firstName: "Quinn", steps: [], docs: [{ key: "d1", label: "CPR card", received: false }, { key: "d2", label: "EMT certification card", received: false }], refs: [], bookingOpen: false, bring: "A photo ID.", interview: { slotId: "qs1", start: Date.now() + 5 * 36e5, duration: 30, location: "Station" } }],
      ["portalEmails/quinn@example.com", { id: "q1" }],
      ["slots/qs1", { start: past, duration: 30, location: "Station", bookedBy: "q1" }],
      ["staff/cory@pvrs.org", { role: "coordinator", name: "Cory Reed" }], ["staff/ivy@pvrs.org", { role: "interviewer", name: "Ivy Lane" }],
      ["staff/mel@pvrs.org", { role: "member", name: "Mel Member" }],
      ["portal/m9", { email: "mel@pvrs.org", name: "Mel Member", firstName: "Mel", steps: [], docs: [], refs: [], bookingOpen: false, orientation: { total: 2, done: 1, items: [{ key: "copy_of_driver_s_license", label: "Copy of driver's license", date: "", cert: true }] } }]];
    // the coordinator: stage and portal steps follow their desk, and No-show reopens booking
    { const { ctx, page } = await open(browser, { user: { email: "cory@pvrs.org", displayName: "Cory Reed" }, seed }); await wait(page, 3600);
      const sy = await page.evaluate(() => [window.__mock.docs.get("applicants/q1").stage, (window.__mock.docs.get("portal/q1").steps || []).length]);
      if (sy[0] !== "int" || sy[1] < 5) fail("coordinator desk didn't refresh stage/steps: " + JSON.stringify(sy)); else ok("the coordinator's desk keeps the stage and the applicant's steps current");
      await pickApplicant(page, "Quinn Late"); await page.locator('.tabdock [data-tab="iv"]').click(); await wait(page, 300);
      await page.locator('#bookedActs [data-act="noshow"]').click(); await wait(page, 1500);
      const ns = await page.evaluate(() => { const m = window.__mock.docs; return [m.get("slots/qs1").bookedBy, m.get("applicants/q1").sched?.noShow, m.get("applicants/q1/private/main").portal.bookingOpen, m.get("portal/q1").bookingOpen, document.querySelector("#emSubject")?.value || ""]; });
      if (ns[0] !== null || !ns[1] || ns[2] !== "yes" || ns[3] !== true || !/new time/.test(ns[4])) fail("no-show: " + JSON.stringify(ns)); else ok("No-show frees the time, reopens booking and drafts the follow-up");
      await ctx.close(); }
    // an interviewer: brief and a private impression
    { const { ctx, page } = await open(browser, { user: { email: "ivy@pvrs.org", displayName: "Ivy Lane" }, seed }); await wait(page, 900);
      await pickApplicant(page, "Quinn Late"); await page.locator('.tabdock [data-tab="iv"]').click(); await wait(page, 300);
      await page.locator('[data-act="brief"]').click(); await wait(page, 300);
      const br = await page.locator("#modal .brief").textContent();
      if (!/quinn@example\.com/.test(br) || !/To help my neighbors/.test(br) || !/Ivy|You/.test(br)) fail("brief: " + br.replace(/\s+/g, " ").slice(0, 300)); else ok("the applicant brief shows who they are and what's already on file");
      await page.locator("#modal [data-x]").click(); await wait(page, 200);
      await page.locator("#impText").fill("Strong candidate, a little quiet."); await wait(page, 1200);
      const im = await page.evaluate(() => window.__mock.docs.get("applicants/q1/impressions/ivy@pvrs.org"));
      if (im?.text !== "Strong candidate, a little quiet." || im.by !== "ivy@pvrs.org") fail("impression: " + JSON.stringify(im)); else ok("an interviewer saves a private impression under their own name");
      await ctx.close(); }
    // the owner: sees the impression, and Reports lists the stalled file
    { const { ctx, page } = await open(browser, { seed: [...seed, ["applicants/q1/impressions/ivy@pvrs.org", { text: "Strong candidate, a little quiet.", by: "ivy@pvrs.org", name: "Ivy Lane", at: Date.now() }]] }); await wait(page, 900);
      await page.locator('[data-cmd="reports"]').click(); await wait(page, 300);
      const rp = (await page.locator("#modal .rptwrap").textContent()).replace(/\s+/g, " ");
      if (!/How long it takes/.test(rp) || !/Quinn Late/.test(rp) || !/20 days/.test(rp) || !/Onboard/.test(rp)) fail("reports: " + rp.slice(0, 400)); else ok("Reports shows timings, who is stalled and who has waited longest");
      await page.screenshot({ path: path.join(OUT, "59-reports.png") });
      await page.locator("#modal [data-rpopen]").first().click(); await wait(page, 400);
      await page.locator('.tabdock [data-tab="iv"]').click(); await wait(page, 300);
      if (!/Strong candidate/.test(await page.locator("#impBox").textContent()) || !/Ivy Lane/.test(await page.locator("#impBox").textContent())) fail("owner can't see impressions"); else ok("the owner reads each interviewer's impression");
      if (!/Orientation board/.test(await page.locator("#orientBtn").textContent()) || !/Onboard/.test(await page.locator("#chips .navh2").textContent()) || !/Onboard\b/.test(await page.locator("#dProg .ph").nth(3).textContent())) fail("naming not consistent"); else ok("Onboard is the phase, list and tab; Orientation board is the checklist tool");
      await ctx.close(); }
    // a squad member who still owes paperwork
    { const { ctx, page } = await open(browser, { user: { email: "mel@pvrs.org", displayName: "Mel" }, seed }); await wait(page, 900);
      if (await page.locator("#paperBtn").isHidden()) fail("member has no My paperwork"); else ok("a squad member with orientation paperwork left gets My paperwork");
      await ctx.close(); }
    { const { ctx, page } = await open(browser, { url: "/?paperwork=1", user: { email: "mel@pvrs.org", displayName: "Mel" }, seed }); await wait(page, 900);
      const t = await page.locator("#portal").textContent().catch(() => "");
      if (!/Back to the desk/.test(t) || !/Copy of driver's license/.test(t) || !(await page.locator('[data-upload^="onb:copy_of_driver"]').count())) fail("member paperwork page: " + t.replace(/\s+/g, " ").slice(0, 300)); else ok("My paperwork opens their orientation checklist with uploads and a way back");
      await ctx.close(); }
    // the applicant: what to bring, reschedule inside 24 hours, and what's still needed after an upload
    { const { ctx, page } = await open(browser, { user: { email: "quinn@example.com", displayName: "" }, seed: [...seed.filter(([k]) => k !== "slots/qs1"), ["slots/qs1", { start: Date.now() + 5 * 36e5, duration: 30, location: "Station", bookedBy: "q1" }]] }); await wait(page, 900);
      const iv = await page.locator("#ivCard").textContent();
      if (!/What to bring: A photo ID\./.test(iv) || !(await page.locator("[data-resched]").count())) fail("portal interview card: " + iv.replace(/\s+/g, " ").slice(0, 300)); else ok("a booked interview shows what to bring and a reschedule button inside 24 hours");
      await page.locator("[data-resched]").click(); await wait(page, 500);
      const m = await page.evaluate(() => [...window.__mock.docs.entries()].filter(([k]) => k.startsWith("portal/q1/messages/")).map(([, v]) => v));
      if (!m.some(x => x.from === "applicant" && /need to reschedule my interview/.test(x.text))) fail("reschedule message: " + JSON.stringify(m)); else ok("the reschedule button sends the squad a message");
      await page.locator('#docCard [data-upload="d1"]').evaluate(b => { const i = document.querySelector('input[type="file"]'); i.click = () => {}; b.click(); });
      await page.locator('input[type="file"]').setInputFiles({ name: "cpr.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") }); await wait(page, 2600);
      const tt = await page.locator("#toast").textContent();
      if (!/Still needed: EMT certification card/.test(tt) || /CPR card/.test(tt)) fail("after-upload note: " + tt); else ok("after an upload the portal says what's still needed");
      await ctx.close(); }
  }
  // ---- Board approved = Onboard, whatever else is true about the file (Dkota, Nov 11)
  {
    const d = n => localDay(Date.now() - n * 864e5), A = (id, name, shared, priv) => [["applicants/" + id, { name, email: id + "@example.com", app: { received: d(40) }, updatedAt: Date.now(), ...shared }], ["applicants/" + id + "/private/main", priv]];
    const allDone = { mvr: { completed: d(30) }, dl: { date: d(30), valid: "yes" }, refs: { r1: { name: "A", returned: d(20) }, r2: { name: "B", returned: d(20) }, r3: { name: "C", returned: d(20) } }, appr: { committee: "yes" },
      board: { result: "approved", date: d(10) }, bg: { sterReq: d(9), sterDone: d(5), sterResult: "clear" }, notify: { applicant: d(4), chief: d(2), tech: d(2) }, onb: { orientStarted: d(3) } };
    const seed = [...A("b1", "Bea Blank", {}, { board: { result: "approved", date: d(2) } }),                          // approved, every earlier step left blank
      ...A("b2", "Hal Hold", {}, { status: "hold", board: { result: "approved", date: d(2) } }),                      // approved, then put on hold
      ...A("b3", "Lee Legacy", {}, { bg: { sterReq: d(5) } }),                                                         // older file: no board result entered, Sterling already requested
      ...A("b4", "Fin Finished", { app: { received: d(40), complete: "yes" }, sched: { scheduled: d(25), completed: d(25) } }, allDone),   // every step done
      ...A("b5", "Wes Withdrew", {}, { status: "withdrawn", board: { result: "approved", date: d(2) } }),
      ...A("b6", "Nia NotYet", {}, { appr: { committee: "yes" } })];
    const { ctx, page } = await open(browser, { seed }); await wait(page, 900);
    const names = async () => (await page.locator(".arow").allTextContents()).join("|").replace(/\s+/g, " ");
    const apps = await names();
    if (/Bea Blank|Hal Hold|Lee Legacy|Fin Finished/.test(apps) || !/Nia NotYet/.test(apps) || !/Wes Withdrew/.test(apps)) fail("board-approved files still with applicants: " + apps.slice(0, 500)); else ok("every board-approved file leaves the applicant list; not-yet-approved and withdrawn ones stay");
    await page.locator('#chips [data-f="orient"]').click(); await wait(page, 400);
    const onb = await names();
    if (!/Bea Blank/.test(onb) || !/Hal Hold/.test(onb) || !/Lee Legacy/.test(onb) || !/Fin Finished/.test(onb) || /Nia NotYet|Wes Withdrew/.test(onb)) fail("onboard list: " + onb.slice(0, 500)); else ok("Onboard has them all: blank earlier steps, on hold, an older file with no board result, and a finished one");
    const beaRow = await page.locator(".arow", { hasText: "Bea Blank" }).textContent();
    if (!/Onboard/.test(beaRow) || /Screening/.test(beaRow)) fail("approved file still labelled with an applicant stage: " + beaRow.replace(/\s+/g, " ")); else ok("an approved file is labelled Onboard even with earlier steps blank");
    await pickApplicant(page, "Bea Blank"); await wait(page, 300);
    const box = (await page.locator("#orientBox").textContent()).replace(/\s+/g, " ");
    if (!/Status: Onboard/.test(box) || /Status: Applicant/.test(box) || !/Approved by the board/.test(box)) fail("status line: " + box); else ok("the file says Status: Onboard from the board approval on");
    if (await page.locator("#orDocsGroup").isHidden() || !(await page.locator("#orDocs [data-orup]").count())) fail("no orientation documents before orientation"); else ok("orientation documents can be uploaded as soon as they're in Onboard");
    await page.screenshot({ path: path.join(OUT, "60-status-onboard.png") });
    // approving at the board moves the file at once
    await page.locator('#chips [data-f="all"]').click(); await wait(page, 300);
    await pickApplicant(page, "Nia NotYet"); await page.locator('.tabdock [data-tab="board"]').click(); await wait(page, 300);
    await page.locator('.seg[data-k="board.result"] button[data-v="approved"]').click(); await wait(page, 900);
    await page.keyboard.press("Escape"); await wait(page, 300);
    await page.evaluate(() => document.querySelector('[data-act="back"], .backbtn')?.click()); await wait(page, 300);
    await page.locator('#chips [data-f="all"]').click(); await wait(page, 400);
    const after = await names(); await page.locator('#chips [data-f="orient"]').click(); await wait(page, 400); const after2 = await names();
    if (/Nia NotYet/.test(after) || !/Nia NotYet/.test(after2)) fail("approving didn't move the file: " + after.slice(0, 200) + " // " + after2.slice(0, 200)); else ok("saving Approved moves the file to Onboard straight away");
    if (!/1/.test(await page.locator('.stg[data-filter="act"]').textContent().catch(() => "1"))) fail("Active tile lost the finished member"); else ok("a finished member still counts on the Active tile");
    await ctx.close();
  }
  // ---- Lanes design: Start here band, the board, lane-coloured headers, sign-in steps
  {
    const d = n => localDay(Date.now() - n * 864e5), ref = { returned: d(3) };
    const seed = [["applicants/p1", { name: "Pat Waiting", email: "pat@example.com", type: "Regular", app: { received: d(20), complete: "yes" }, updatedAt: Date.now() }],
      ["applicants/p1/private/main", { mvr: { completed: d(10) }, dl: { date: d(9), valid: "yes" }, refs: { r1: { name: "A", ...ref }, r2: { name: "B", ...ref }, r3: { name: "C", ...ref } }, portal: { invited: d(15) } }],
      ["applicants/p2", { name: "Ona Board", email: "ona@example.com", app: { received: d(30) }, updatedAt: Date.now() }], ["applicants/p2/private/main", { board: { result: "approved", date: d(2) } }]];
    const { ctx, page } = await open(browser, { seed }); await wait(page, 900);
    const sh = (await page.locator(".starthere").textContent()).replace(/\s+/g, " ");
    if (!/Start here/.test(sh) || !/Start with \w+\./.test(sh) || !(await page.locator(".starthere [data-todo]").count())) fail("Start here band: " + sh.slice(0, 300)); else ok("the Overview opens with Start here and the first thing to do");
    const heads = await page.locator(".lanes .lhead").evaluateAll(l => l.map(x => x.dataset.filter + ":" + x.querySelector(".v").textContent));
    if (heads.map(h => h.split(":")[0]).join() !== "screen,int,appr,orient") fail("board columns: " + heads); else ok("the board has four lanes: Screening, Interview, Approval, Onboard");
    const intLane = (await page.locator('.lane:has([data-filter="int"])').textContent()).replace(/\s+/g, " "), onbLane = (await page.locator('.lane:has([data-filter="orient"])').textContent()).replace(/\s+/g, " ");
    if (!/Pat Waiting/.test(intLane) || !/isn't scheduled/.test(intLane) || !/Ona Board/.test(onbLane) || /Ona Board/.test(intLane)) fail("cards in the wrong lane: " + intLane.slice(0, 200) + " // " + onbLane.slice(0, 200)); else ok("each person's card sits in their lane, and a board-approved file is in Onboard");
    if (!(await page.locator('.lcard.need:has-text("Pat Waiting") .ping').count())) fail("no indicator on the card that needs action"); else ok("the card that needs you carries a live indicator");
    const fit = await page.evaluate(() => document.querySelector(".ov").scrollWidth <= document.querySelector(".ov").clientWidth + 1);
    if (!fit) fail("Overview scrolls sideways on a computer"); else ok("the board fits the screen on a computer");
    await page.screenshot({ path: path.join(OUT, "61-lanes-overview.png") });
    await page.locator('.lcard:has-text("Pat Waiting")').click(); await wait(page, 400);
    const laneC = await page.evaluate(() => [getComputedStyle(document.querySelector(".dhead")).getPropertyValue("--stage-c").trim(), getComputedStyle(document.documentElement).getPropertyValue("--s-int").trim()]);
    if (!laneC[0] || laneC[0] !== laneC[1]) fail("file header isn't in its lane colour: " + laneC); else ok("an open file's header takes its lane's colour");
    await page.screenshot({ path: path.join(OUT, "62-lanes-file.png") });
    await ctx.close();
    { const { ctx, page } = await open(browser, { seed, w: 390, h: 844 }); await wait(page, 900);
      await page.click('#mnav [data-m="ov"]'); await wait(page, 500);
      if (!(await page.locator(".starthere").isVisible()) || (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1))) fail("phone Overview: Start here hidden or page too wide"); else ok("phones get Start here and a board that swipes sideways without widening the page");
      await page.screenshot({ path: path.join(OUT, "63-lanes-phone.png") });
      await ctx.close(); }
    { const { ctx, page } = await open(browser, { url: "/signin", user: null }); await wait(page, 700);
      const steps = await page.locator(".lanesteps span b").allTextContents();
      if (steps.join() !== "Screening,Interview,Approval,Onboard") fail("sign-in lane steps: " + steps); else ok("the sign-in page shows the four lanes of the journey");
      await page.screenshot({ path: path.join(OUT, "64-lanes-signin.png") });
      await ctx.close(); }
    { const { ctx, page } = await open(browser, { user: { email: "marcus.bell@example.com", displayName: "" }, w: 390, h: 844 }); await wait(page, 900);
      if (!(await page.locator(".portal .card.phead").count())) fail("portal header has no lane colour"); else ok("the applicant portal's header is in their lane's colour");
      await page.screenshot({ path: path.join(OUT, "65-lanes-portal.png") });
      await ctx.close(); }
  }
  // ---- Lanes stage 2: a file's "your move" strip; the portal's Your move card, journey colours and bottom menu
  {
    const d = n => localDay(Date.now() - n * 864e5), ref = { returned: d(3) };
    const seed = [["applicants/p1", { name: "Pat Waiting", email: "pat@example.com", type: "Regular", app: { received: d(20), complete: "yes" }, updatedAt: Date.now() }],
      ["applicants/p1/private/main", { mvr: { completed: d(10) }, dl: { date: d(9), valid: "yes" }, refs: { r1: { name: "A", ...ref }, r2: { name: "B", ...ref }, r3: { name: "C", ...ref } }, portal: { invited: d(15) } }],
      ["portal/p1", { email: "pat@example.com", name: "Pat Waiting", firstName: "Pat", steps: [{ label: "Application received", state: "done" }, { label: "Application review", state: "done" }, { label: "References and driving record", state: "done" }, { label: "Interview", state: "now", detail: "Not scheduled yet." }, { label: "Board review", state: "todo" }], docs: [], refs: [], bookingOpen: true }],
      ["portalEmails/pat@example.com", { id: "p1" }], ["slots/ms1", { start: Date.now() + 4 * 864e5, duration: 30, location: "Station", bookedBy: null }]];
    { const { ctx, page } = await open(browser, { seed }); await wait(page, 900);
      await pickApplicant(page, "Pat Waiting");
      const mv = (await page.locator("#dProg .t.move").textContent().catch(() => "")).replace(/\s+/g, " ");
      if (!/Open interview booking/.test(mv) || !(await page.locator("#dProg .t.move .ping").count()) || !(await page.locator('#dProg .movego[data-todoact="booking"]').count())) fail("file move strip: " + mv); else ok("an open file shows its To do item as a Your move strip with the action button");
      await page.locator("#dProg .movego").click(); await wait(page, 900);
      if ((await priv(page, "p1")).portal.bookingOpen !== "yes") fail("move strip button didn't act"); else ok("the strip's button does the job from inside the file");
      await page.screenshot({ path: path.join(OUT, "66-file-move.png") });
      await ctx.close(); }
    { const { ctx, page } = await open(browser, { user: { email: "pat@example.com", displayName: "" }, seed, w: 390, h: 844 }); await wait(page, 900);
      const mc = (await page.locator("#moveCard").textContent()).replace(/\s+/g, " ");
      if (!/Your move/.test(mc) || !/Pick your interview time/.test(mc) || !(await page.locator('#moveCard [data-goto="ivCard"]').count())) fail("portal move card: " + mc); else ok("the portal opens with Your move: pick your interview time");
      const nav = await page.locator(".pnav button").allTextContents();
      if (nav.map(x => x.trim()).join() !== "My application,Documents,Messages" || !(await page.locator(".pnav").isVisible())) fail("portal bottom menu: " + nav); else ok("phones get a three-item bottom menu in the portal");
      await page.locator('.pnav [data-goto="msgCard"]').click(); await wait(page, 700);
      const inView = await page.evaluate(() => { const r = document.querySelector("#msgCard").getBoundingClientRect(); return r.top < innerHeight - 100 && r.bottom > 0; });
      if (!inView || !(await page.locator('.pnav [data-goto="msgCard"].on').count())) fail("bottom menu didn't jump to Messages"); else ok("the bottom menu jumps to each section");
      const lc = await page.evaluate(() => { const m = document.querySelectorAll(".timeline .mile"), v = e => getComputedStyle(e).getPropertyValue("--stage-c").trim(), r = getComputedStyle(document.documentElement); return [v(m[0]) === r.getPropertyValue("--s-screen").trim(), v(m[3]) === r.getPropertyValue("--s-int").trim(), v(m[4]) === r.getPropertyValue("--s-appr").trim()]; });
      if (lc.includes(false)) fail("journey steps aren't in lane colours: " + lc); else ok("the applicant's journey uses the same lane colours as the desk");
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) fail("portal wider than the phone"); else ok("the portal still fits a phone");
      await page.evaluate(() => document.querySelector("#portal").scrollTo(0, 0)); await wait(page, 300);
      await page.screenshot({ path: path.join(OUT, "67-portal-move.png") });
      await ctx.close(); }
    { const { ctx, page } = await open(browser, { user: { email: "marcus.bell@example.com", displayName: "" } }); await wait(page, 900);
      const mc = (await page.locator("#moveCard").textContent()).replace(/\s+/g, " ");
      if (!/Nothing needed from you right now/.test(mc) || await page.locator("#moveCard .ping").count()) fail("calm move card: " + mc); else ok("with nothing to do, the portal says so plainly");
      await ctx.close(); }
  }
  // ---- First-visit tour: once per person and role, with a way to see it again
  {
    const CORY = { email: "cory@pvrs.org", displayName: "Cory Reed" }, cs = [["staff/cory@pvrs.org", { role: "coordinator", name: "Cory Reed" }]];
    const { ctx, page } = await open(browser, { user: CORY, seed: cs, tour: true }); await wait(page, 1900);
    const t1 = await page.locator("#modal .tour").textContent().catch(() => "");
    if (!/Interview coordinator · 1 of 8/.test(t1) || !/You run the interviews, Cory/.test(t1)) fail("coordinator tour: " + t1.slice(0, 200)); else ok("a coordinator's first visit opens their tour");
    await page.locator("[data-tnext]").click(); await wait(page, 150);
    if (!/2 of 8/.test(await page.locator("#modal .tour").textContent()) || !(await page.locator("[data-tback]").count())) fail("tour Next/Back"); else ok("the tour steps forward and back");
    await page.screenshot({ path: path.join(OUT, "53-tour.png") });
    await page.locator("[data-tskip]").click(); await wait(page, 200);
    await page.reload(); await wait(page, 2200);
    if (await page.locator("#modal .tour").count()) fail("tour showed a second time"); else ok("the tour shows only once");
    await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k"); await page.locator("#palQ").fill("tour"); await wait(page, 150); await page.keyboard.press("Enter"); await wait(page, 400);
    if (!/1 of 8/.test(await page.locator("#modal .tour").textContent().catch(() => ""))) fail("no way to replay the tour"); else ok("the tour can be opened again from search");
    for (let n = 0; n < 7; n++) await page.locator("[data-tnext]").click();
    await wait(page, 150);
    if (!(await page.locator("[data-tnotif]").count())) fail("tour doesn't end on notifications"); else ok("the last card offers to turn on notifications");
    await ctx.close();
    // an applicant, and the same person once in orientation
    { const { ctx, page } = await open(browser, { user: { email: "marcus.bell@example.com", displayName: "" }, tour: true }); await wait(page, 1900);
      const t = await page.locator("#modal .tour").textContent().catch(() => "");
      if (!/Your applicant portal · 1 of 6/.test(t) || !/Welcome, Marcus/.test(t)) fail("applicant tour: " + t.slice(0, 200)); else ok("an applicant's first visit opens the portal tour");
      await page.locator("[data-tskip]").click(); await wait(page, 200);
      await page.locator("[data-tour]").click(); await wait(page, 300);
      if (!/1 of 6/.test(await page.locator("#modal .tour").textContent().catch(() => ""))) fail("portal How this works"); else ok("the portal has a How this works button");
      await page.locator("[data-tskip]").click(); await wait(page, 200);
      await ctx.close(); }
    { const { ctx, page } = await open(browser, { user: { email: "nina@example.com", displayName: "" }, tour: true,
        seed: [["portal/o9", { email: "nina@example.com", name: "Nina New", firstName: "Nina", steps: [], docs: [], refs: [], bookingOpen: false, orientation: { total: 2, done: 0, items: [] } }]] }); await wait(page, 1900);
      if (!/Your orientation · 1 of 6/.test(await page.locator("#modal .tour").textContent().catch(() => ""))) fail("no orientation tour for a new member"); else ok("a new member in orientation gets the orientation tour");
      await ctx.close(); }
    // the owner isn't interrupted, but can preview each tour
    { const { ctx, page } = await open(browser, { tour: true }); await wait(page, 1900);
      if (await page.locator("#modal .tour").count()) fail("owner got a tour"); else ok("the owner isn't shown a tour");
      await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k"); await page.locator("#palQ").fill("tour interviewer"); await wait(page, 150); await page.keyboard.press("Enter"); await wait(page, 400);
      if (!/Interviewer · 1 of 7/.test(await page.locator("#modal .tour").textContent().catch(() => ""))) fail("owner can't preview a tour"); else ok("the owner can preview any role's tour from search");
      await ctx.close(); }
  }
  // ---- Nov 4 batch: interviewer times + home, applicant alerts, duplicates, bulk, channel extras, search
  {
    const IVY = { email: "ivy@pvrs.org", displayName: "Ivy Lane" }, ivySeed = [["staff/ivy@pvrs.org", { role: "interviewer", name: "Ivy Lane" }]];
    // an interviewer offers times and has their own home
    { const { ctx, page } = await open(browser, { user: IVY, seed: [...ivySeed, ["slots/other", { start: Date.now() + 5 * 864e5, duration: 30, location: "X", bookedBy: null, host: "admin@pvrs.org", hostName: "Casey" }]] }); await wait(page, 700);
      if (!/My interviews/.test(await page.locator(".ov h2").textContent().catch(() => ""))) fail("no My interviews home"); else ok("interviewers land on My interviews");
      await page.locator("#slotsBtn").click(); await wait(page, 300);
      if (!/My interview times/.test(await page.locator("#modal h3").textContent())) fail("interviewer times title"); else ok("interviewers manage their own interview times");
      if (await page.locator('#slotList [data-del="other"]').count()) fail("sees someone else's time"); else ok("they don't see other people's times");
      await page.locator("#slotForm button[type=submit]").click(); await wait(page, 400);
      const mine = await page.evaluate(() => [...window.__mock.docs.entries()].filter(([k, v]) => k.startsWith("slots/") && v.host === "ivy@pvrs.org").map(([, v]) => v));
      if (mine.length !== 1 || mine[0].hostName !== "Ivy" || mine[0].bookedBy !== null) fail("slot: " + JSON.stringify(mine)); else ok("a new time is saved under the interviewer");
      await page.keyboard.press("Escape"); await wait(page, 200);
      await page.evaluate(() => { const d = window.__mock.docs, sl = [...d.entries()].find(([, v]) => v.host === "ivy@pvrs.org"); sl[1].bookedBy = "a1"; d.get("applicants/a1").interviewers = ["ivy@pvrs.org"]; window.__mock.emit(); }); await wait(page, 500);
      const hm = await page.locator(".ov").textContent();
      if (!/Georgia Thurmond/.test(hm) || !/1 interview coming up/.test(hm)) fail("home after booking: " + hm.slice(0, 200)); else ok("a booked applicant shows on My interviews");
      await page.screenshot({ path: path.join(OUT, "60-my-interviews.png") });
      await page.locator("[data-startiv]").first().click(); await wait(page, 500);
      if (!(await page.locator("#ivBar").count())) fail("Start interview didn't start"); else ok("Start interview opens interview mode");
      await ctx.close(); }
    // the portal shows who a time is with, and an applicant can turn on alerts
    { const { ctx, page } = await open(browser, { w: 430, h: 844, user: { email: "marcus.bell@example.com", displayName: "Marcus" }, seed: [["slots/h1", { start: Date.now() + 5 * 864e5, duration: 30, location: "Station", bookedBy: null, host: "ivy@pvrs.org", hostName: "Ivy" }]] }); await wait(page, 500);
      await page.evaluate(() => { const p = window.__mock.docs.get("portal/a2"); p.bookingOpen = true; window.__mock.emit(); }); await wait(page, 500);
      if (!/with Ivy/.test(await page.locator("#ivCard").textContent())) fail("slot host not shown"); else ok("applicants see who an interview time is with");
      await ctx.close(); }
    { const ctx = await browser.newContext({ viewport: { width: 430, height: 844 } });
      await ctx.addInitScript(() => { window.__MOCK_USER = { email: "marcus.bell@example.com", displayName: "Marcus" }; window.__mock = { docs: new Map(), listeners: new Set(), seq: 0, pushOk: true };
        Object.defineProperty(window, "Notification", { configurable: true, value: { permission: "default" } });
        if (navigator.serviceWorker) navigator.serviceWorker.register = async () => ({}); else Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register: async () => ({}) } }); });
      await ctx.route("**/*", route => { const u = new URL(route.request().url());
        if (u.host === "www.gstatic.com") return route.fulfill({ body: MOCK, contentType: "text/javascript" });
        if (u.host === "localhost:5999") { let f = path.join(PUB, u.pathname === "/" ? "index.html" : u.pathname); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(PUB, "index.html"); return route.fulfill({ body: fs.readFileSync(f), contentType: TYPES[path.extname(f)] || "application/octet-stream" }); }
        return route.abort(); });
      await ctx.addInitScript(() => { try { localStorage.setItem("pvrsTourOff", "1"); } catch {} });
      const page = await ctx.newPage(); await page.goto("http://localhost:5999/"); await wait(page, 900);
      if (!(await page.locator("[data-pushon]").count())) fail("no Turn on alerts in the portal: " + (await page.locator("#portal").textContent()).slice(0, 200)); else { await page.locator("[data-pushon]").click(); await wait(page, 500);
        const tk = await page.evaluate(() => [...window.__mock.docs.entries()].filter(([k]) => k.startsWith("applicantTokens/")).map(([, v]) => v));
        if (tk.length !== 1 || tk[0].appId !== "a2" || tk[0].email !== "marcus.bell@example.com") fail("applicant token: " + JSON.stringify(tk)); else ok("an applicant turns on alerts for their own device");
        await page.screenshot({ path: path.join(OUT, "64-portal-alerts.png") });
        await page.locator("[data-pushoff]").click(); await wait(page, 400);
        if (await page.evaluate(() => [...window.__mock.docs.keys()].some(k => k.startsWith("applicantTokens/")))) fail("applicant token not removed"); else ok("and can turn them off"); }
      await ctx.close(); }
    // duplicates: flagged in To do, "not the same" sticks, combining keeps everything and deletes the other
    { const now = Date.now();
      const { ctx, page } = await open(browser, { seed: [
        ["applicants/d1", { name: "Jack Gradzewicz", email: "jack@example.com", phone: "716-866-2459", app: { received: "2026-09-30" }, updatedAt: now }],
        ["applicants/d1/private/main", { notes: "Paper copy on file", refs: { r1: { name: "Duke McCauley", email: "duke@example.com" } } }],
        ["applicants/d2", { name: "Jack Gradzewicz", email: "JACK@example.com", phone: "", iv: { why: "Wants to help" }, updatedAt: now }],
        ["applicants/d2/private/main", { notes: "Applied again online", form: { submittedAt: now, person: { first: "Jack", last: "G" }, signature: { name: "Jack" } }, refs: { r1: { name: "Duke McCauley" }, r2: { name: "Aidan Osborne", email: "aidan@example.com", link: "lnkAidan" } } }],
        ["applicants/d2/records/rec1", { name: "scan.pdf", label: "Application", path: "records/d2/scan.pdf", size: 10, contentType: "application/pdf", uploadedAt: now, uploadedBy: "dkota@pvrs.org" }],
        ["refLinks/lnkAidan", { appId: "d2", slot: 2, applicant: "Jack Gradzewicz", first: "Jack", refName: "Aidan Osborne", createdAt: now, expiresAt: now + 5e9 }]] }); await wait(page, 800);
      const td = (await page.locator(".ov").textContent()).replace(/\s+/g, " ");
      if (!/Possible duplicate: Jack Gradzewicz/.test(td)) fail("no duplicate to-do: " + td.slice(0, 500)); else ok("To do flags possible duplicates");
      await page.locator('[data-todoact="dupe"]').first().click(); await wait(page, 300);
      await page.screenshot({ path: path.join(OUT, "61-duplicate.png") });
      await page.locator('[data-keep="d1"]').click(); await page.locator("#dupYes").click(); await wait(page, 1200);
      const d = await page.evaluate(() => { const m = window.__mock.docs; return { a: m.get("applicants/d1"), p: m.get("applicants/d1/private/main"), gone: !m.has("applicants/d2") && !m.has("applicants/d2/private/main"), recs: [...m.entries()].filter(([k]) => k.startsWith("applicants/d1/records/")).map(([, v]) => v.path), link: m.get("refLinks/lnkAidan") }; });
      if (!d.gone) fail("merged file not deleted"); else ok("combining deletes the other file");
      if (d.a.iv?.why !== "Wants to help" || d.p.form?.submittedAt !== now || !d.p.refs.r2 || d.p.refs.r2.name !== "Aidan Osborne" || d.p.refs.r1.email !== "duke@example.com") fail("merge lost data: " + JSON.stringify(d)); else ok("combining keeps answers, references and the online application");
      if (!/Paper copy on file/.test(d.p.notes) || !/Applied again online/.test(d.p.notes)) fail("notes: " + d.p.notes); else ok("combining keeps both sets of notes");
      if (d.recs.join() !== "records/d2/scan.pdf") fail("records: " + d.recs); else ok("combining moves uploaded records without deleting the file");
      if (!d.link || d.link.appId !== "d1") fail("ref link: " + JSON.stringify(d.link)); else ok("an unanswered reference link keeps working after combining");
      await ctx.close(); }
    { const { ctx, page } = await open(browser, { seed: [["applicants/n1", { name: "Pat Same", email: "pat1@example.com" }], ["applicants/n1/private/main", {}], ["applicants/n2", { name: "Pat Same", email: "pat2@example.com" }], ["applicants/n2/private/main", {}]] }); await wait(page, 700);
      await page.locator('[data-todoact="dupe"]').first().click(); await wait(page, 300); await page.locator("#dupNo").click(); await wait(page, 1400);
      await page.locator("#overviewBtn").click(); await wait(page, 400);
      if (/Possible duplicate/.test(await page.locator(".ov").textContent())) fail("not-a-duplicate came back"); else ok("\"Not the same person\" stays dismissed");
      await ctx.close(); }
    // bulk: pick several, assign, message, email references
    { const { ctx, page } = await open(browser, { seed: ivySeed }); await wait(page, 700);
      await page.evaluate(() => { const pv = window.__mock.docs.get("applicants/a1/private/main"); pv.refs.r1.email = "ann.lee@example.com"; delete pv.portal; window.__mock.emit(); }); await wait(page, 300);
      await page.evaluate(() => document.querySelector("#bulkBtn").click()); await wait(page, 300);
      await page.evaluate(() => document.querySelector('.arow[data-id="a1"]').click()); await wait(page, 150);
      await page.evaluate(() => document.querySelector('.arow[data-id="a2"]').click()); await wait(page, 200);
      if (!/2 selected/.test(await page.locator("#bulkBar").textContent())) fail("bulk count: " + await page.locator("#bulkBar").textContent()); else ok("the applicant list lets you tick several");
      await page.screenshot({ path: path.join(OUT, "62-bulk.png") });
      await page.locator('[data-bulk="refs"]').click(); await wait(page, 300);
      if (!/Ann Lee/.test(await page.locator("#modal").textContent())) fail("bulk refs: " + await page.locator("#modal").textContent()); else ok("Email references lists who's due across everyone ticked");
      await page.locator("#modal [data-x]").click(); await wait(page, 200);
      await page.locator('[data-bulk="msg"]').click(); await wait(page, 300);
      if (!/Skipped, not invited/.test(await page.locator("#modal").textContent()) || !/Georgia/.test(await page.locator("#modal").textContent())) fail("bulk message skip note"); else ok("bulk message says who it can't reach");
      await page.locator("#bkText").fill("Hi {first}, reminder!"); await page.locator("#bkSend").click(); await wait(page, 500);
      const sent = await page.evaluate(() => [...window.__mock.docs.entries()].filter(([k, v]) => k.includes("/messages/") && /reminder!/.test(v.text || "")).map(([k, v]) => [k.split("/")[1], v.text]));
      if (sent.length !== 1 || sent[0][0] !== "a2" || sent[0][1] !== "Hi Marcus, reminder!") fail("bulk message: " + JSON.stringify(sent)); else ok("bulk message goes privately to each, with their first name");
      await page.evaluate(() => document.querySelector("#bulkBtn").click()); await wait(page, 200);
      await page.evaluate(() => { document.querySelector('.arow[data-id="a1"]').click(); document.querySelector('.arow[data-id="a2"]').click(); }); await wait(page, 200);
      await page.locator('[data-bulk="assign"]').click(); await wait(page, 300);
      await page.locator('.cv-pick input[value="ivy@pvrs.org"]').check(); await page.locator("#bkaSave").click(); await wait(page, 700);
      const both = await page.evaluate(() => ["a1", "a2"].map(i => [(window.__mock.docs.get("applicants/" + i).interviewers || []).join(), (window.__mock.docs.get("convos/" + i)?.members || []).join()]));
      if (both.flat().some(x => x !== "ivy@pvrs.org")) fail("bulk assign: " + JSON.stringify(both)); else ok("bulk assign adds the interviewer and the conversation on every file");
      await ctx.close(); }
    // channel extras + search
    { const now = Date.now();
      const { ctx, page } = await open(browser, { seed: [["channels/c9", { name: "board", color: "appr", members: ["dkota@pvrs.org", "admin@pvrs.org"], names: { "admin@pvrs.org": "Casey Admin" }, createdAt: now }],
        ["channels/c9/posts/p1", { text: "Packet for the zebra meeting is ready", by: "admin@pvrs.org", name: "Casey Admin", at: now - 6e4 }],
        ["presence/admin@pvrs.org", { at: now, typing: "c:c9", typingAt: now + 6e4 }],
        ["portal/a2/messages/q1", { text: "Do I need a walrus permit?", from: "applicant", by: "marcus.bell@example.com", name: "Marcus", at: now - 9e4 }]] }); await wait(page, 700);
      await page.evaluate(() => { window.open = () => ({ close(){}, set location(u){ window.__opened = u; } }); window.__mock.docs.get("applicants/a1/private/main").notes = "Great with the marmot program"; window.__mock.emit(); }); await wait(page, 300);
      for (const [q, re, label] of [["walrus", /Message: Marcus Bell/, "applicant messages"], ["zebra", /#board/, "channel posts"], ["marmot", /Notes: Georgia Thurmond/, "notes"]]) {
        await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k"); await wait(page, 200); await page.locator("#palQ").fill(q); await wait(page, 200);
        if (!re.test(await page.locator("#palList").textContent())) fail(`search ${q}: ` + await page.locator("#palList").textContent()); else ok(`⌘K searches ${label}`);
        await page.keyboard.press("Escape"); await wait(page, 100); await page.keyboard.press("Escape"); await wait(page, 200); }
      await page.locator("#msgsBtn").click(); await wait(page, 300); await page.locator('[data-chat="c:c9"]').click(); await wait(page, 400);
      if (!/Casey is typing/.test(await page.locator("#cvTyping").textContent())) fail("typing: " + await page.locator("#cvTyping").textContent()); else ok("the channel shows who's typing");
      if (!(await page.locator('#cvInfo [data-online="admin@pvrs.org"].on').count())) fail("online dot"); else ok("people online get a green dot");
      await page.locator('[data-react="👍"][data-pid="p1"]').click(); await wait(page, 300);
      const rx = await page.evaluate(() => window.__mock.docs.get("channels/c9/posts/p1").reactions);
      if (rx?.["👍"]?.join() !== "dkota@pvrs.org") fail("reaction: " + JSON.stringify(rx)); else ok("a reaction is saved");
      await page.locator('.cv-react button.on[data-react="👍"]').click(); await wait(page, 300);
      if (await page.evaluate(() => ((window.__mock.docs.get("channels/c9/posts/p1").reactions || {})["👍"] || []).length)) fail("reaction not removed"); else ok("clicking again removes the reaction");
      await page.locator('[data-pinpost="p1"]').click({ force: true }); await wait(page, 300);
      if (!/zebra meeting/.test(await page.locator("#cvPin").textContent())) fail("pin bar"); else ok("owner pins a message to the top of the channel");
      await page.locator("#cvFile").setInputFiles({ name: "agenda.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF") }); await wait(page, 500);
      const fp = await page.evaluate(() => [...window.__mock.docs.values()].find(v => v.file)?.file);
      if (!fp || !/^chat\/c9\//.test(fp.path) || fp.name !== "agenda.pdf") fail("file post: " + JSON.stringify(fp)); else ok("a PDF can be posted in a channel");
      if (!(await page.locator("[data-chfile]").count())) fail("file card"); else { await page.locator("[data-chfile]").click(); await wait(page, 200); if (!(await page.evaluate(() => window.__opened))) fail("file didn't open"); else ok("clicking a posted file opens it"); }
      await page.locator("#cvFile").setInputFiles({ name: "Medical-records.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF") }); await wait(page, 300);
      if (await page.evaluate(() => [...window.__mock.docs.values()].some(v => v.file?.name === "Medical-records.pdf"))) fail("medical file was posted"); else ok("medical or Social Security files are refused in channels");
      await page.screenshot({ path: path.join(OUT, "63-channel-extras.png") });
      await ctx.close(); }
  }
  // ---- Orientation: locked until Sterling is clear, moved by hand; new members see only their dashboard
  {
    const stS = { result: "approved", date: "2026-10-20" }, pm = (bg, extra = {}) => ({ board: stS, appr: { committee: "yes" }, bg, portal: { invited: "2026-09-01" }, notify: { applicant: "2026-10-21" }, ...extra });
    const seed = [["applicants/o1", { name: "Sam Ready", email: "sam@example.com", type: "Regular", app: { received: "2026-09-01", complete: "yes" }, updatedAt: Date.now() }], ["applicants/o1/private/main", pm({ sterReq: "2026-10-21", sterDone: "2026-10-28", sterResult: "clear" })],
      ["applicants/o2", { name: "Una Waiting", email: "una@example.com", app: { received: "2026-09-01" }, updatedAt: Date.now() }], ["applicants/o2/private/main", pm({ sterReq: "2026-10-21" })],
      ["applicants/o3", { name: "Rae Review", email: "rae@example.com", app: { received: "2026-09-01" }, updatedAt: Date.now() }], ["applicants/o3/private/main", pm({ sterReq: "2026-10-21", sterDone: "2026-10-28", sterResult: "review" })],
      ["portal/o1", { email: "sam@example.com", name: "Sam Ready", firstName: "Sam", steps: [{ label: "Interview", state: "done" }], docs: [], refs: [], bookingOpen: false }], ["portalEmails/sam@example.com", { id: "o1" }],
      ["staff/ivy@pvrs.org", { role: "interviewer", name: "Ivy Lane" }], ["settings/main", { signature: "Dkota Wright", orientDays: 60 }],
      ["orientSlots/s1", { start: Date.now() + 5 * 864e5, duration: 60, location: "Station", bookedBy: null }]];
    const { ctx, page } = await open(browser, { seed }); await wait(page, 900);
    await page.evaluate(() => { window.__mock.docs.set("settings/main", { signature: "Dkota Wright", orientDays: 60 }); window.__mock.emit(); }); await wait(page, 300);
    await page.locator("#orientBtn").click(); await wait(page, 400);
    const b0 = await page.locator("#orBoard").textContent();
    if (!/Ready to move to orientation/.test(b0) || !/Sam Ready/.test(b0)) fail("board ready: " + b0.slice(0, 200)); else ok("Sterling clear shows as ready to move, not moved");
    if (!/Waiting on Sterling/.test(b0) || !/Una Waiting/.test(b0) || !/Rae Review/.test(b0) || !/needs review/.test(b0)) fail("board waiting: " + b0.slice(0, 300)); else ok("not-complete and needs-review Sterling stay locked");
    if (await page.locator(".or-grid").count()) fail("someone in orientation before being moved"); else ok("nobody enters orientation on their own");
    if (await page.locator('[data-omove="o2"],[data-omove="o3"]').count()) fail("can move before Sterling"); else ok("only Sterling-clear people can be moved");
    await page.locator('[data-omove="o1"]').click(); await wait(page, 300);
    const sheet = await page.locator("#modal").textContent(); if (!/Sam/.test(sheet)) fail("move window");
    await page.locator("#mvEmail").fill("sam@pvrs.org"); await page.locator("#mvGo").click(); await wait(page, 2200);
    const o = await page.evaluate(() => { const m = window.__mock.docs; return { pv: m.get("applicants/o1/private/main"), a: m.get("applicants/o1"), pd: m.get("portal/o1"), msg: [...m.entries()].filter(([k]) => k.startsWith("portal/o1/messages/")).map(([, v]) => v.text) }; });
    if (!o.pv.onb?.orientStarted || !o.pd.orientation || o.pd.orientation.items.length < 5 || !o.pd.orientation.due) fail("move: " + JSON.stringify([o.pv.onb, o.pd.orientation])); else ok("moving opens the orientation checklist with a due date");
    const lab = o.pd.orientation.items.map(i => i.label + (i.cert ? "+" : "")).join("|");
    if (!/^Acknowledgement of Sterling[^|+]*\|Completed application\|Copy of driver's license\+/.test(lab) || !/Record of PPD\+/.test(lab) || /Equipment request/.test(lab) || /Orientation form[^|]*\+/.test(lab)) fail("sheet items: " + lab); else ok("the checklist is PVRS's mandatory sheet, with uploads where they make sense");
    if (!o.pd.orientation.items.find(i => /^Completed application/.test(i.label)).date) fail("completed application not filled in"); else ok("the completed application is checked off automatically");
    if (o.a.email !== "sam@pvrs.org" || o.pd.email !== "sam@pvrs.org") fail("sign-in email not changed: " + JSON.stringify([o.a.email, o.pd.email])); else ok("moving can switch them to a new sign-in email");
    if (!o.msg.some(x => /moving on to orientation/.test(x))) fail("no welcome message"); else ok("moving posts a message to them");
    const others = await page.evaluate(() => [window.__mock.docs.get("portal/o2")?.orientation, window.__mock.docs.get("portal/o3")?.orientation]);
    if (others.some(Boolean)) fail("orientation opened for a locked file"); else ok("locked files get no orientation data");
    await page.locator("#orientBtn").click(); await wait(page, 400);
    if (!(await page.locator(".or-grid").count())) fail("no grid after moving"); else ok("the board shows them against every requirement");
    await page.locator('[data-ocell="o1"]').nth(2).click(); await wait(page, 400);
    if (!(await page.locator('[data-ocell="o1"]').nth(2).evaluate(b => b.classList.contains("on")))) fail("cell didn't toggle"); else ok("clicking a box marks it done");
    await page.screenshot({ path: path.join(OUT, "70-orientation-board.png") });
    await page.locator('[data-obook="o1"]').click(); await wait(page, 300); await page.locator('[data-opick="s1"]').click(); await wait(page, 500);
    const bk = await page.evaluate(() => [window.__mock.docs.get("orientSlots/s1").bookedBy, window.__mock.docs.get("portal/o1").orient?.slotId]);
    if (bk.join() !== "o1,s1") fail("owner booking: " + bk); else ok("you can book their one-on-one for them");
    // people in orientation are their own list, apart from applicants
    await page.keyboard.press("Escape"); await wait(page, 300);
    const allNames = (await page.locator(".arow").allTextContents()).join("|");
    const orBtn = page.locator('#chips [data-f="orient"]');
    if (/Sam Ready|Una Waiting|Rae Review/.test(allNames) || !/3/.test(await orBtn.textContent()) || !/Onboard/.test(await page.locator("#chips .navh2").textContent())) fail("board-approved people still listed with applicants: " + allNames.slice(0, 200)); else ok("once the board approves someone they leave the applicant list for the Onboard list");
    if (await page.locator('#chips [data-f="onb"]').count()) fail("old Onboarding stage filter still in the applicant filters"); else ok("the applicant filters no longer have an Onboarding stage");
    await orBtn.click(); await wait(page, 400);
    const orRow = (await page.locator(".arow").allTextContents()).join("|");
    if (!/Sam Ready/.test(orRow) || !/Orientation: \d+ of \d+ done/.test(orRow) || !/Una Waiting/.test(orRow) || !/Rae Review/.test(orRow)) fail("onboard list: " + orRow.replace(/\s+/g, " ").slice(0, 400)); else ok("the Onboard list has everyone the board approved: those not yet in orientation, and those in it with their progress");
    await pickApplicant(page, "Sam Ready");
    if ((await page.locator('.tabdock [data-tab][aria-selected="true"], .tabdock [data-tab].on').first().getAttribute("data-tab")) !== "onb") fail("orientation file didn't open on Onboard"); else ok("an orientation file opens on its orientation page");
    await page.locator('.tabdock [data-tab="onb"]').click(); await wait(page, 300);
    // your own upload for a checklist line: filed under orientation and checked off
    const odTxt = await page.locator("#orDocs").textContent();
    if (!/Copy of training records/.test(odTxt) || !/Other orientation paperwork/.test(odTxt) || /Completed application/.test(odTxt)) fail("orientation documents list: " + odTxt.slice(0, 300)); else ok("the Onboard tab has an Orientation documents list");
    await page.locator('[data-orup^="copy_of_driver"]').evaluate(b => { const c = HTMLInputElement.prototype.click; HTMLInputElement.prototype.click = function(){}; b.click(); HTMLInputElement.prototype.click = c; });
    await page.locator("#orPicker").setInputFiles({ name: "emt-card.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") }); await wait(page, 1500);
    const up = await page.evaluate(() => { const m = window.__mock.docs; return { recs: [...m.entries()].filter(([k]) => k.startsWith("applicants/o1/records/")).map(([, v]) => v), item: m.get("applicants/o1/private/main").onb?.items?.copy_of_driver_s_license }; });
    if (up.recs.length !== 1 || up.recs[0].label !== "Orientation: Copy of driver's license" || !up.recs[0].path.startsWith("records/o1/") || !up.item) fail("orientation upload: " + JSON.stringify(up)); else ok("uploading for a checklist line files it under orientation and checks it off");
    if (!/emt-card\.pdf/.test(await page.locator("#orDocs").textContent())) fail("uploaded file not listed"); else ok("the uploaded file shows on its line");
    await page.screenshot({ path: path.join(OUT, "57-orientation-documents.png") });
    await page.locator('.tabdock [data-tab="app"]').click(); await wait(page, 300);
    if (/emt-card\.pdf/.test(await page.locator("#recList").textContent())) fail("orientation upload mixed into application records"); else ok("orientation uploads stay out of the application's records");
    await page.locator('.tabdock [data-tab="onb"]').click(); await wait(page, 300);
    const box = await page.locator("#orientBox").textContent();
    if (!/Status: New member/.test(box) || !/One-on-one session/.test(box)) fail("onboard box: " + box); else ok("the Onboard tab shows their status and session");
    await page.locator('[data-oact="attend"]').click(); await wait(page, 1600);
    if (!(await page.evaluate(() => Object.keys(window.__mock.docs.get("applicants/o1/private/main").onb?.items || {}).some(k => k.startsWith("orientation_form"))))) fail("attended not saved"); else ok("Mark attended checks off orientation");
    // Request documents from the Onboard tab: marks the checklist items as requested and opens the email
    await page.locator('[data-oact="reqdocs"]').click(); await wait(page, 300);
    const chips = await page.locator("#odChips [data-k]").allTextContents();
    if (chips.length < 5 || chips.some(c => /Completed application|Orientation form|Insurance|Confidentiality|Emergency contact/.test(c)) || !chips.some(c => /health physical.*🔒/.test(c))) fail("request chips: " + chips.join("|")); else ok("Request documents lists every outstanding checklist document");
    await page.locator('#odChips [data-k^="verification_of_blood"]').click(); await page.locator("#odCustom").fill("Copy of AEMT card"); await page.locator("#odSave").click(); await wait(page, 2400);
    const rq = await page.evaluate(() => { const m = window.__mock.docs; return { pv: m.get("applicants/o1/private/main"), pd: m.get("portal/o1"), mail: document.querySelector("#emBody")?.value || "", subj: document.querySelector("#emSubject")?.value || "" }; });
    const reqd = rq.pd.orientation.items.filter(i => i.req).map(i => i.key);
    if (!rq.pv.onb?.requested?.copy_of_training_records_emt_cpr_etc || Object.keys(rq.pv.onb.requested).some(k => k.startsWith("verification_of_blood")) || !reqd.includes("copy_of_training_records_emt_cpr_etc") || reqd.some(k => k.startsWith("verification_of_blood"))) fail("requested: " + JSON.stringify([rq.pv.onb?.requested, reqd])); else ok("the picked items are marked requested in their dashboard");
    if (!(rq.pd.docs || []).some(d => d.label === "Copy of AEMT card")) fail("extra doc not requested: " + JSON.stringify(rq.pd.docs)); else ok("an extra document is requested alongside");
    if (!/orientation/i.test(rq.subj) || !/Copy of training records/.test(rq.mail) || !/Copy of AEMT card/.test(rq.mail) || /Blood Borne/.test(rq.mail)) fail("orientation docs email: " + rq.mail.slice(0, 300)); else ok("the orientation documents email lists what was asked for");
    await page.locator("#emCancel").click(); await wait(page, 300);
    await page.locator('[data-oact="trainers"]').click(); await wait(page, 300); await page.locator('.cv-pick input[value="ivy@pvrs.org"]').check(); await page.locator("#trSave").click(); await wait(page, 400);
    const so = await page.evaluate(() => window.__mock.docs.get("signoffs/o1"));
    if (so?.trainers?.join() !== "ivy@pvrs.org" || (so.items || []).length < 3) fail("signoff doc: " + JSON.stringify(so)); else ok("assigning a trainer creates their sign-off list");
    await page.locator('[data-oact="member"]').click(); await wait(page, 300);
    if (!/isn't finished/.test(await page.locator("#modal").textContent())) fail("no not-finished warning"); else ok("Make squad member warns when orientation isn't finished");
    await page.locator("#mmGo").click(); await wait(page, 400);
    const st = await page.evaluate(() => window.__mock.docs.get("staff/sam@pvrs.org"));
    if (st?.role !== "member") fail("staff doc: " + JSON.stringify(st)); else ok("converting gives them a Member account on their sign-in email");
    const seed2 = await page.evaluate(() => [...window.__mock.docs.entries()].filter(([k]) => /^(signoffs|orientSlots|portal\/o1$|portalEmails|applicants\/o1)/.test(k)));
    await ctx.close();
    // Ivy, the trainer: only the sign-off list
    { const { ctx, page } = await open(browser, { user: { email: "ivy@pvrs.org", displayName: "Ivy" }, seed: [...seed, ...seed2] }); await wait(page, 800);
      if (await page.locator("#trainBtn").isHidden()) fail("trainer has no Sign-offs"); else { await page.locator("#trainBtn").click(); await wait(page, 300);
        if (!/Sam Ready/.test(await page.locator("#trList").textContent())) fail("trainer list"); else { await page.locator("#trList [data-tr]").first().click(); await wait(page, 300);
          const d = await page.evaluate(() => window.__mock.docs.get("signoffs/o1").done); if (Object.values(d)[0]?.by !== "ivy@pvrs.org") fail("sign off: " + JSON.stringify(d)); else ok("a trainer signs off an item"); }
        await page.locator("#modal [data-x]").click(); await wait(page, 200); }
      if (await page.locator('#list .arow[data-id="o1"]').count()) fail("trainer can see the file"); else ok("a trainer doesn't get the applicant's file");
      await ctx.close(); }
    // the new member: only the orientation dashboard
    { const seed3 = seed2.map(([k, v]) => k === "portal/o1" ? [k, { ...v, email: "sam@example.com", checkin: "30" }] : [k, v]);
      const { ctx, page } = await open(browser, { w: 430, h: 900, user: { email: "sam@example.com", displayName: "Sam" }, seed: [...seed, ...seed3, ["library/l1", { name: "Squad handbook.pdf", path: "library/l1/h.pdf", roles: [], newMembers: true, uploadedAt: 1 }]] }); await wait(page, 1000);
      const t = await page.locator("#portal").textContent();
      if (!/New member/.test(t) || !/Your session/.test(t) || !/Checklist/.test(t)) fail("dashboard: " + t.slice(0, 300)); else ok("a new member gets the orientation dashboard");
      if (/Your application/.test(t) || await page.locator("#ivCard").count() || await page.locator("#refCard").count() || /What to expect/.test(t)) fail("application pages still showing"); else ok("the application pages are gone for them");
      if (!/required before you can be issued equipment or run calls/.test(t)) fail("no requirement note"); else ok("new members see why the checklist matters");
      const medBtn = page.locator('[data-upload^="onb:copy_of_health"]');
      if (!/🔒/.test(await medBtn.textContent().catch(() => ""))) fail("medical item isn't marked secure"); else ok("the health physical item uploads through the secure route");
      const lic = page.locator('.or-item:has([data-upload="onb:copy_of_training_records_emt_cpr_etc"])');
      if (!/Requested/.test(await lic.textContent().catch(() => "")) || !(await lic.locator(".btn.primary").count())) fail("requested item not highlighted"); else ok("requested items stand out with an Upload button");
      // a scan with no file type (some phones) still uploads, as a PDF
      await page.locator('#orientCard [data-upload="onb:copy_of_training_records_emt_cpr_etc"]').evaluate(b => { const i = document.querySelector('input[type="file"]'); i.click = () => {}; b.click(); });
      await page.locator('input[type="file"]').setInputFiles({ name: "emt card scan.PDF", mimeType: "", buffer: Buffer.from("%PDF-1.4") }); await wait(page, 800);
      const upf = await page.evaluate(() => [...window.__mock.docs.entries()].filter(([k]) => k.startsWith("portal/o1/files/")).map(([, v]) => v));
      if (!upf.some(f => f.docKey === "onb:copy_of_training_records_emt_cpr_etc" && f.contentType === "application/pdf")) fail("typeless upload: " + JSON.stringify(upf)); else ok("a file with no type still uploads against its checklist item");
      if (!/Under review/.test(await lic.textContent())) fail("no under-review badge"); else ok("an uploaded item shows as under review");
      if (!/Squad handbook/.test(t)) fail("no library doc in dashboard"); else ok("new members see documents meant for them");
      await page.locator("#orientCard").screenshot({ path: path.join(OUT, "71-orientation-dashboard.png") });
      await page.locator('[data-crate="4"]').click(); await page.locator("#ciGoing").fill("Going well"); await page.locator("[data-csend]").click(); await wait(page, 400);
      const c = await page.evaluate(() => window.__mock.docs.get("portal/o1/checkins/30"));
      if (c?.rating !== 4 || c.going !== "Going well") fail("check-in: " + JSON.stringify(c)); else ok("a new member answers their check-in");
      await ctx.close(); }
    // an applicant before the move sees no orientation
    { const { ctx, page } = await open(browser, { w: 430, h: 844, user: { email: "marcus.bell@example.com", displayName: "Marcus" } }); await wait(page, 800);
      if (await page.locator("#orientCard").count() || !(await page.locator("#ivCard").count())) fail("applicant view changed"); else ok("applicants keep their normal portal, with no orientation");
      await ctx.close(); }
    // one sign-in page
    { const { ctx, page } = await open(browser, { url: "/signin", user: null }); await wait(page, 500);
      if (!(await page.locator("#linkEmail").isVisible()) || !(await page.locator("#googleBtn").isVisible()) || await page.locator("#whoSeg").count()) fail("sign-in isn't one page"); else ok("one sign-in page for everyone");
      await page.locator("#signin").screenshot({ path: path.join(OUT, "72-signin.png") }).catch(() => {});
      await page.screenshot({ path: path.join(OUT, "72-signin.png") });
      await page.locator("#linkEmail").fill("new@example.com"); await page.locator("#linkForm button").click(); await wait(page, 400);
      if (!/spam or junk/.test(await page.locator("#linkSent").textContent())) fail("no spam note after sending"); else ok("the sent message warns about spam");
      await ctx.close(); }
  }
  // ---- Med Control is owner only: admins see no button, brief or draft chip, even when it's on
  { const { ctx, page } = await open(browser, { user: { email: "admin@pvrs.org", displayName: "Casey" } }); await wait(page, 600);
    await page.evaluate(() => { const m = window.__mock.docs; m.set("settings/main", { ...m.get("settings/main"), ai: true }); window.__mock.emit(); }); await wait(page, 400);
    if (await page.locator("#aiBtn").isVisible()) fail("admin sees Med Control"); else ok("admins never see Med Control");
    await pickApplicant(page, "Georgia Thurmond"); await page.locator('.tabdock [data-tab="board"]').click(); await wait(page, 300);
    if (await page.locator(".aibrief").count()) fail("admin sees the AI brief"); else ok("admins don't see the AI brief");
    await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k"); await wait(page, 200); await page.locator("#palQ").fill("med control"); await wait(page, 200);
    if (/Med Control/.test(await page.locator("#palList").textContent())) fail("admin finds Med Control in ⌘K"); else ok("Med Control isn't in an admin's ⌘K");
    await ctx.close(); }
  // ---- AI summary: interview, references together, and an advisory recommendation
  { const { ctx, page } = await open(browser); await wait(page, 600);
    await page.evaluate(() => { const m = window.__mock.docs; m.set("settings/main", { ...m.get("settings/main"), ai: true }); m.get("applicants/a1/private/main").ai = { brief: { at: Date.now(), summary: "Summary here.", interviewSummary: "They want to give back.", referencesSummary: "Two of three answered, both positive.", recommendation: "look_closer", recommendationReasons: ["One reference is still out"], strengths: [], followUps: [], questions: [], references: [] } }; window.__mock.emit(); }); await wait(page, 400);
    await pickApplicant(page, "Georgia Thurmond"); await page.locator('.tabdock [data-tab="board"]').click(); await wait(page, 400);
    const t = await page.locator("#aiBrief").textContent();
    if (!/Worth looking into more/.test(t) || !/They want to give back/.test(t) || !/both positive/.test(t) || !/the committee decides/.test(t)) fail("AI brief: " + t.slice(0, 300)); else ok("the brief shows the interview summary, references together and a recommendation labelled as advice");
    await page.locator(".aibrief").screenshot({ path: path.join(OUT, "73-ai-summary.png") }).catch(() => {});
    await ctx.close(); }
  // ---- Med Control (AI): hidden until switched on; chat, brief and reply drafts go through the function
  {
    const { ctx, page } = await open(browser, { seed: [["portal/a2/messages/m1", { text: "Can I join if I'm only here in the school year?", from: "applicant", by: "marcus.bell@example.com", name: "Marcus", at: Date.now() - 6e4 }]] }); await wait(page, 600);
    if (await page.locator("#aiBtn").isVisible()) fail("Med Control shown while off"); else ok("Med Control stays hidden until it's switched on");
    await page.evaluate(() => document.querySelector("#settingsBtn")?.click()); await wait(page, 300);
    await page.locator('#sAi [data-v="on"]').click(); await page.locator("#sSave").click(); await wait(page, 500);
    if (!(await page.evaluate(() => window.__mock.docs.get("settings/main").ai === true)) || !(await page.locator("#aiBtn").isVisible())) fail("Med Control switch"); else ok("Settings switches Med Control on");
    await page.evaluate(() => { window.__mock.ai = d => d.job === "chat" ? { text: "Marcus Bell is waiting on 2 references.\n\nSubject: Quick reminder\nHi there" } : { text: "x" }; });
    await page.locator("#aiBtn").click(); await wait(page, 200);
    await page.locator("#mcIn").fill("Who is waiting on references?"); await page.keyboard.press("Enter"); await wait(page, 400);
    const call = await page.evaluate(() => window.__mock.aiCalls.at(-1));
    if (call.name !== "ai-medControl" || call.data.job !== "chat" || call.data.messages.at(-1).text !== "Who is waiting on references?" || !call.data.hints.a2?.stage) fail("chat call: " + JSON.stringify(call).slice(0, 200)); else ok("chat sends the question with the desk's hints");
    if (JSON.stringify(call.data).match(/555-0188|marcus\.bell@example\.com/)) fail("chat call carried contact details"); else ok("chat sends no contact details from the browser");
    if (!/Marcus Bell is waiting/.test(await page.locator("#mcThread").textContent()) || !(await page.locator('[data-mcopen="a2"]').count()) || !(await page.locator("[data-mcmail]").count())) fail("chat answer actions"); else ok("answers link to the file and can open a drafted email");
    await page.locator('[data-mcopen="a2"]').click(); await wait(page, 400);
    if (!/Marcus Bell/.test(await page.locator("#dName").textContent())) fail("Open file from chat"); else ok("Open file jumps to the applicant");
    // reply draft
    await page.evaluate(() => { window.__mock.ai = d => d.job === "reply" ? { text: "Yes, Marcus! Associate membership is made for students." } : { text: "x" }; });
    await page.locator('.tabdock [data-tab="msgs"]').click(); await wait(page, 400);
    await page.locator("[data-aireply]").click(); await wait(page, 400);
    if (await page.locator("#replyText").inputValue() !== "Yes, Marcus! Associate membership is made for students.") fail("reply draft: " + await page.locator("#replyText").inputValue()); else ok("Draft with Med Control fills the reply box (nothing sent)");
    if (await page.evaluate(() => [...window.__mock.docs.keys()].filter(k => k.startsWith("portal/a2/messages/")).length) !== 1) fail("the draft was sent"); else ok("the draft isn't sent until you press Send");
    // brief
    await page.evaluate(() => { window.__mock.ai = d => d.job === "brief" ? { brief: { summary: "Marcus is a student applying as an Associate.", strengths: ["Available weekends"], followUps: ["One reference out"], questions: ["What draws you to EMS?"], references: [{ name: "Coach Dan Price", tone: "strong", note: "Very reliable." }], at: Date.now(), by: "dkota@pvrs.org" } } : { text: "x" }; });
    await page.locator('.tabdock [data-tab="board"]').click(); await wait(page, 300);
    await page.locator("[data-aibrief]").click(); await wait(page, 600);
    const bt = await page.locator("#aiBrief").textContent();
    if (!/Marcus is a student/.test(bt) || !/Follow up on/.test(bt) || !/Coach Dan Price/.test(bt) || !/Strong/.test(bt)) fail("brief: " + bt.slice(0, 160)); else ok("Make brief shows the summary, follow-ups and reference digest");
    if ((await page.locator("[data-aibrief]").textContent()) !== "Redo brief") fail("brief button label"); else ok("the button then offers Redo brief");
    await page.evaluate(() => { window.__mock.aiError = { code: "not-found", message: "x" }; });
    await page.locator("[data-aibrief]").click(); await wait(page, 400);
    if (!/isn't set up yet/.test(await page.locator(".toast").last().textContent().catch(() => ""))) fail("not-set-up message"); else ok("a missing function says Med Control isn't set up yet");
    await page.screenshot({ path: path.join(OUT, "19-med-brief.png") });
    await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, { user: { email: "alex@pvrs.org", displayName: "Alex" }, seed: [["settings/main", { ai: true }]] }); await wait(page, 600);
    if (await page.locator("#aiBtn").isVisible()) fail("members see Med Control"); else ok("members never see Med Control");
    await ctx.close();
  }
  // ---- Applicant portal: how to prepare for the interview
  {
    const { ctx, page } = await open(browser, { w: 430, h: 844, user: { email: "marcus.bell@example.com", displayName: "Marcus" } });
    const t = await page.locator("#ivCard .ivprep").textContent().catch(() => "");
    if (!/How to prepare/.test(t) || !/driver's license/.test(t)) fail("interview prep missing: " + t.slice(0, 80)); else ok("the portal explains how to prepare for the interview");
    await ctx.close();
  }
  // ---- Interview mode
  for (const [w, h, who] of [[1440, 900, OWNER], [390, 844, { email: "ivy@pvrs.org", displayName: "Ivy" }]]) {
    const { ctx, page } = await open(browser, { w, h, user: who, seed: [["staff/ivy@pvrs.org", { role: "interviewer", name: "Ivy Interviewer" }]] });
    await page.evaluate(() => { window.__mock.docs.get("applicants/a1").interviewers = ["ivy@pvrs.org"]; window.__mock.emit(); }); await wait(page, 400);
    await pickApplicant(page, "Georgia Thurmond");
    await page.locator('.tabdock [data-tab="iv"]').click(); await wait(page, 300);
    await page.locator('[data-act="ivmode"]').click(); await wait(page, 400);
    const vis = await page.locator("#dpanel .group:visible").count(), pos = await page.locator("#ivBar .ivpos").textContent();
    if (vis !== 1 || !/1 of \d+/.test(pos)) fail(`interview mode at ${w}: ${vis} sections visible, ${pos}`); else ok(`interview mode shows one section at a time (${w}px${who === OWNER ? "" : ", assigned interviewer"})`);
    const total = +pos.match(/of (\d+)/)[1];
    let i = 0; while (i < 3) { await page.locator('#ivBar [data-iv="next"]').click(); await wait(page, 150); i++; }
    const title = await page.locator("#ivBar .ivpos b").textContent();
    const order = []; await page.locator('#ivBar [data-iv="prev"]').click(); await page.locator('#ivBar [data-iv="prev"]').click(); await page.locator('#ivBar [data-iv="prev"]').click(); await wait(page, 150);
    for (let k = 0; k < 5; k++) { order.push(await page.locator("#ivBar .ivpos b").textContent()); await page.locator('#ivBar [data-iv="next"]').click(); await wait(page, 120); }
    if (order.slice(0, 4).join("|") !== "Scheduling|Who was at the interview|About the applicant|EMS questions") fail("interview order: " + order.join(" → ")); else ok("interview mode follows the question order");
    for (let k = 0; k < 2; k++) { await page.locator('#ivBar [data-iv="prev"]').click(); await wait(page, 100); }
    const ta = page.locator("#dpanel .group.ivcur textarea").first();
    if (await ta.count()) { await ta.fill("Grew up in Potsdam; nursing student."); await wait(page, 1200); }
    const saved = await page.evaluate(() => JSON.stringify(window.__mock.docs.get("applicants/a1").iv || {}));
    if (!/Grew up in Potsdam; nursing student/.test(saved)) fail("interview mode answer not saved (" + title + ")"); else ok("answers typed in interview mode save normally");
    // answering "Member of another organization?" adds or removes the Past experience section
    await page.evaluate(() => { const d = window.__mock.docs, a = d.get("applicants/a1"); a.iv = { ...(a.iv || {}), otherOrg: "yes" }; window.__mock.emit(); }); await wait(page, 400);
    const total2 = +(await page.locator("#ivBar .ivpos small").textContent()).match(/of (\d+)/)[1];
    await page.evaluate(() => { const d = window.__mock.docs, a = d.get("applicants/a1"); a.iv = { ...(a.iv || {}), otherOrg: "no" }; window.__mock.emit(); }); await wait(page, 400);
    const total3 = +(await page.locator("#ivBar .ivpos small").textContent()).match(/of (\d+)/)[1];
    if (total2 === total3) fail(`sections don't follow answers (${total2} vs ${total3})`); else ok("sections that don't apply are skipped as answers change");
    if (w === 1440) await page.screenshot({ path: path.join(OUT, "14-interview-mode.png") });
    else await page.screenshot({ path: path.join(OUT, "15-interview-mode-phone.png") });
    await page.keyboard.press("Escape"); await wait(page, 300);
    if (await page.locator("#app").evaluate(a => a.classList.contains("ivmode")) || await page.locator("#ivBar").count()) fail("Escape didn't leave interview mode"); else ok("Escape leaves interview mode");
    await ctx.close();
  }
  // ---- Board meeting mode (replaces Copy agenda + Print packet)
  {
    const { ctx, page } = await open(browser);
    await page.evaluate(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
    if (await page.locator("#agendaBtn").count() || await page.locator("#packetBtn").count() || await page.locator("#boardBtn").isHidden()) fail("sidebar still has agenda/packet or no Board meeting"); else ok("one Board meeting button replaces agenda + packet");
    await page.locator("#boardBtn").click(); await wait(page, 400);
    const t = await page.locator("#boardMtg").textContent();
    if (!/Georgia Thurmond/.test(t) || !/1 of 1/.test(t) || !/Committee/.test(t) || !/References/.test(t)) fail("board meeting view: " + t.slice(0, 200)); else ok("board meeting shows the queue one applicant at a time with checks");
    await page.locator('#boardMtg [data-bk="board.motion"]').fill("Pat Lee"); await page.locator('#boardMtg [data-bk="board.second"]').fill("Sam Roe");
    await page.locator('#boardMtg [data-bk="board.for"]').fill("9"); await page.locator('#boardMtg [data-bk="board.against"]').fill("0"); await page.locator('#boardMtg [data-bk="board.abstain"]').fill("1");
    await page.locator('#boardMtg [data-bres="approved"]').click(); await wait(page, 1500);
    const b = (await priv(page, "a1")).board || {};
    if (b.result !== "approved" || b.motion !== "Pat Lee" || b.for !== 9 || b.abstain !== 1 || !b.date) fail("vote not saved: " + JSON.stringify(b)); else ok("vote recorded (motion, second, tally, result, date)");
    await page.screenshot({ path: path.join(OUT, "16-board-meeting.png") });
    if (!/Georgia Thurmond/.test(await page.locator("#boardMtg").textContent())) fail("approved applicant vanished from the meeting"); else ok("the meeting list stays put while votes are recorded");
    await page.locator('#boardMtg [data-bm="packet"]').click(); await wait(page, 400);
    if (!(await page.evaluate(() => window.__printed))) fail("Print packet didn't print"); else ok("Print packet works from the meeting");
    await page.locator('#boardMtg [data-bm="email"]').click(); await wait(page, 300);
    const em = decodeURIComponent((await page.evaluate(() => (window.__clicked || []).filter(h => h.startsWith("mailto:")).pop())) || "");
    if (!/subject=PVRS Board: membership applications \(1\)/.test(em) || !/1\. Georgia Thurmond/.test(em) || !/packet is attached/.test(em)) fail("Email the board: " + em.slice(0, 160)); else ok("Email the board opens a draft with the meeting's agenda");
    await page.locator('#boardMtg [data-bm="close"]').click(); await wait(page, 300);
    if (await page.locator("#boardMtg").isVisible() || await page.locator("#app").evaluate(a => a.inert)) fail("Done didn't close the meeting"); else ok("Done closes the meeting");
    await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, { user: { email: "admin@pvrs.org", displayName: "Casey" } });
    await page.locator("#boardBtn").click(); await wait(page, 400);
    if (!(await page.locator('#boardMtg [data-bk="board.motion"]').isDisabled())) fail("admin can edit the vote"); else ok("admins see the meeting view-only");
    await ctx.close();
  }
  // ---- ⌘K: find anyone, run commands
  {
    const { ctx, page } = await open(browser);
    await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k"); await wait(page, 300);
    if (await page.locator("#palQ").count() !== 1) fail("⌘K didn't open the palette"); else ok("⌘K opens search and commands");
    await page.locator("#palQ").fill("georg"); await wait(page, 150);
    const items = await page.locator(".palitem").evaluateAll(b => b.map(x => x.textContent.replace(/\s+/g, " ").trim()));
    if (!/^GT Georgia Thurmond/.test(items[0]) || !items.some(t => /Interview mode/.test(t)) || !items.some(t => /Email reference forms/.test(t))) fail("palette items: " + JSON.stringify(items)); else ok("typing a name finds them, with quick actions");
    await page.keyboard.press("Enter"); await wait(page, 500);
    if (!/Georgia Thurmond/.test(await page.locator("#dName").textContent())) fail("Enter didn't open Georgia"); else ok("Enter opens the applicant");
    await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k"); await wait(page, 300);
    await page.locator("#palQ").fill("georgia"); await page.keyboard.press("ArrowDown"); await wait(page, 100);
    const sel = await page.locator(".palitem.on").textContent();
    await page.keyboard.press("Enter"); await wait(page, 500);
    if (!/Interview mode/.test(sel) || !(await page.locator("#app").evaluate(a => a.classList.contains("ivmode")))) fail("arrow + Enter didn't start interview mode: " + sel); else ok("arrow keys + Enter run an action (interview mode)");
    await page.keyboard.press("Escape"); await wait(page, 200); await page.keyboard.press("Escape"); await wait(page, 300);
    await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k"); await wait(page, 300);
    await page.locator("#palQ").fill("board"); await page.keyboard.press("Enter"); await wait(page, 500);
    if (await page.locator("#boardMtg").isHidden()) fail("'board' command didn't open the meeting"); else ok("commands work (board → Board meeting)");
    await ctx.close();
  }
  // ---- celebrations
  for (const reduce of [false, true]) {
    const { ctx, page } = await open(browser);
    if (reduce) await page.emulateMedia({ reducedMotion: "reduce" });
    await page.locator("#boardBtn").click(); await wait(page, 400);
    await page.locator('#boardMtg [data-bres="approved"]').click(); await wait(page, 200);
    const canvas = await page.locator("canvas.confetti").count(), msg = await page.locator("#toast").textContent();
    if (!/approved by the board/.test(msg)) fail("no approval message: " + msg);
    if (!reduce && canvas !== 1) fail("no confetti on board approval"); else if (!reduce) ok("board approval sets off confetti and a 🎉 message");
    if (reduce && canvas) fail("confetti shown despite reduced motion"); else if (reduce) ok("reduced motion: message only, no confetti");
    if (!reduce) {
      await page.screenshot({ path: path.join(OUT, "17-celebrate.png") });
      await page.locator('#boardMtg [data-bm="close"]').click(); await wait(page, 2600);
      if (await page.locator("canvas.confetti").count()) fail("confetti not cleaned up"); else ok("confetti clears itself");
      await page.locator('#chips [data-f="orient"]').click(); await wait(page, 300);
      if (!/🎉 Approved/.test(await page.locator(".arow", { hasText: "Georgia Thurmond" }).textContent())) fail("no Approved badge on the card"); else ok("approved applicant gets a 🎉 Approved badge in the list");
    }
    await ctx.close();
  }
  // ---- Overview: year at a glance
  for (const dark of [false, true]) {
    const { ctx, page } = await open(browser, { dark }); await wait(page, 500);
    const card = page.locator(".ovcard.stats");
    if (!(await card.count())) { fail("no Year at a glance card"); await ctx.close(); continue; }
    const cols = await card.locator(".bcol").count(), rows = await card.locator("table tbody tr").count();
    const kpis = await card.locator(".kpi b").allTextContents();
    if (cols !== 12 || rows !== 12 || kpis.length !== 3) fail(`stats card: ${cols} columns, ${rows} table rows, ${kpis}`); else if (!dark) ok("Year at a glance: 3 headline numbers, 12 months, screen-reader table");
    if (!dark) { const fr = await card.locator(".funnel .frow").allTextContents(), first = fr[0] || "";
      if (fr.length !== 5 || !/^Applied\s*\d+/.test(first) || !/Active member/.test(fr[4] || "")) fail("funnel: " + JSON.stringify(fr));
      else { const nums = await card.locator(".funnel .frow b").allTextContents();
        if (nums.map(Number).some((n, i, a) => i && n > a[i - 1])) fail("funnel steps grow: " + nums); else ok("Year at a glance: the funnel shows how far applicants get, never growing step to step"); } }
    const bar = card.locator(".bcol i").first();
    if (await bar.count()) { await bar.hover(); await wait(page, 150);
      const tip = await card.locator("#mtip").textContent();
      if (!/^\d+ applications?\w+ \d{4}$/.test(tip.replace(/\s+/g, " ").trim().replace(/s?([A-Z])/, "$1")) && !/application/.test(tip)) fail("tooltip: " + tip); else if (!dark) ok("hovering a month shows its count");
    }
    await card.scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(OUT, `18-stats${dark ? "-dark" : ""}.png`) });
    await ctx.close();
  }
  // ---- desktop: the applicants live in a box on the dashboard (no slide-out strip)
  {
    const { ctx, page } = await open(browser); await wait(page, 500);
    const inBox = () => page.evaluate(() => { const R = document.querySelector(".roster"); return !!R.closest("#ovRoster") && getComputedStyle(R).display !== "none"; });
    if (!(await inBox())) fail("list isn't in the dashboard box"); else ok("desktop: the applicant list is a box on the dashboard");
    if (await page.locator(".rhandle").count() || await page.locator("#pinBtn").count()) fail("slide-out strip still there"); else ok("the slide-out strip and pin are gone");
    if (await page.locator("#ovRoster .arow").count() < 3) fail("box rows"); else ok("the box lists the applicants");
    await page.locator("#ovRoster #q").fill("georgia"); await wait(page, 300);
    if (await page.locator("#ovRoster .arow").count() !== 1) fail("box search"); else ok("search works in the box");
    if (await page.evaluate(() => document.activeElement?.id) !== "q") fail("search lost focus"); else ok("search keeps your cursor");
    await page.evaluate(() => { window.__mock.docs.get("applicants/a2").updatedAt = Date.now(); window.__mock.docs.get("applicants/a2").name = "Marcus Bell Jr"; window.__mock.emit(); }); await wait(page, 400);
    if (await page.evaluate(() => document.activeElement?.id) !== "q" || !(await inBox())) fail("a live update broke the box"); else ok("live updates leave the box and your typing alone");
    await page.locator("#ovRoster #q").fill(""); await wait(page, 200);
    await page.locator("#ovRoster .arow").first().click(); await wait(page, 400);
    if (await page.locator("#ovRoster").count() || !(await page.locator("#backBtn").isVisible())) fail("file view"); else ok("opening a file gives a clear way back");
    if (!/Applicants/.test(await page.locator("#backBtn").textContent())) fail("back label"); else ok("the back button says Applicants");
    await page.locator('#chips [data-f="screen"]').click(); await wait(page, 500);
    if (!(await inBox()) || !/Screening/.test(await page.locator("#rosterTitle").textContent())) fail("sidebar filter from a file"); else ok("a sidebar filter returns to the dashboard and filters the box");
    await page.locator("#msgsBtn").click(); await wait(page, 300);
    if (!(await page.locator(".cv").count()) || !(await page.evaluate(() => !!document.querySelector(".roster")))) fail("Messages lost the list"); else ok("Messages opens without destroying the list");
    await page.locator("#overviewBtn").click(); await wait(page, 400);
    if (!(await inBox())) fail("box gone after Messages"); else ok("the box comes back on the dashboard");
    await page.screenshot({ path: path.join(OUT, "74-applicants-box.png") });
    await ctx.close();
  }
  { const { ctx, page } = await open(browser, { w: 390, h: 844 }); await wait(page, 500);
    if (await page.locator("#ovRoster .roster").count() || !(await page.locator(".roster").isVisible())) fail("phone list"); else ok("phones keep the applicant list as its own screen");
    await ctx.close(); }
  // ---- New applicant (owner)
  {
    const { ctx, page } = await open(browser);
    await page.locator("#newBtn").click(); await wait(page, 300);
    if (await page.locator("#modal").isHidden()) fail("New applicant window didn't open"); else ok("New applicant opens");
    const dupes = await page.evaluate(() => { const c = {}; document.querySelectorAll("[id]").forEach(e => { c[e.id] = (c[e.id] || 0) + 1; }); return Object.keys(c).filter(k => c[k] > 1); });
    if (dupes.length) fail("duplicate ids on the page: " + dupes.join(", ")); else ok("no duplicate ids on the page");
    await page.locator("#f-n-name").fill("Jamie Test"); await page.locator("#f-n-email").fill("jamie@example.com");
    await page.locator("#newAppForm button[type=submit]").click(); await wait(page, 600);
    const made = await page.evaluate(() => [...window.__mock.docs.entries()].filter(([k, v]) => /^applicants\/[^/]+$/.test(k) && v.name === "Jamie Test").length);
    if (made !== 1) fail("New applicant not added: " + made); else ok("Add applicant creates the applicant");
    if (!(await page.locator("#modal").isHidden()) || !/Jamie Test/.test(await page.locator("#dName").textContent())) fail("didn't close and open the new file"); else ok("window closes and opens the new applicant's file");
    if (!/^http:\/\/localhost:5999\/$/.test(page.url())) fail("page navigated away: " + page.url());
    await ctx.close();
  }
  // ---- an applicant's replacement reference is swapped in exactly once
  {
    const { ctx, page } = await open(browser);
    await page.evaluate(() => { const d = window.__mock.docs, p = d.get("applicants/a1/private/main");
      p.refs.r2 = { name: "Sam Ortiz", email: "sam@example.com", contacted: "2026-10-01", returned: "2026-10-05", replace: "2026-10-10" };
      d.set("portal/a1/refUpdates/u1", { slot: 2, name: "Dr. Lena Ruiz", relationship: "Professor", email: "lruiz@example.com", phone: "", address: "", at: Date.now(), by: "georgia@example.com" });
      window.__mock.emit(); });
    await wait(page, 1800);
    const r2 = (await priv(page, "a1")).refs.r2, u = await page.evaluate(() => window.__mock.docs.get("portal/a1/refUpdates/u1"));
    if (r2.name !== "Dr. Lena Ruiz" || r2.email !== "lruiz@example.com" || r2.returned || r2.contacted || r2.replace || r2.replacedFrom !== "Sam Ortiz") fail("replacement not applied: " + JSON.stringify(r2)); else ok("a replacement reference is swapped in (old progress cleared, history noted)");
    if (!u.appliedAt) fail("replacement not marked applied"); else ok("…and marked applied so no other desk repeats it");
    await ctx.close();
  }
  // ---- a desk working from an out-of-date copy must not redo automatic work another desk already did
  {
    const { ctx, page } = await open(browser);
    await page.evaluate(() => { const d = window.__mock.docs, now = Date.now(), p = d.get("applicants/a1/private/main");
      // already handled by another desk: Lena replaced Sam (now contacted, with a link and answers) and her answers were filed
      p.refs.r2 = { name: "Dr. Lena Ruiz", email: "lruiz@example.com", contacted: "2026-10-15", link: "lenaLinkToken1234567890", form: { label: "x", date: "2026-10-18", answers: { known: "2 yrs" } }, returned: "2026-10-18", replacedFrom: "Sam Ortiz" };
      d.set("portal/a1/refUpdates/u9", { slot: 2, name: "Dr. Lena Ruiz", email: "lruiz@example.com", relationship: "", phone: "", address: "", at: now - 864e5, by: "georgia@example.com", appliedAt: now - 8e7 });
      d.set("refLinks/lenaLinkToken1234567890", { appId: "a1", slot: 2, applicant: "Georgia Thurmond", first: "Georgia", refName: "Dr. Lena Ruiz", createdAt: now, expiresAt: now + 5e9, submittedAt: now });
      d.set("refResponses/lenaLinkToken1234567890", { v: 1, answers: { known: "2 yrs", signName: "Lena" }, submittedAt: now, hp: "", importedAt: now - 1e6 });
      window.__mock.emit(); });
    await wait(page, 800);
    const before = await page.evaluate(() => (window.__mock.writes || []).length);
    // the out-of-date copy: the same two items, but without the "done" marks
    await page.evaluate(() => {
      const stale = (path, data) => ({ id: path.split("/").pop(), ref: { path, id: path.split("/").pop(), parent: { id: path.split("/").slice(-2, -1)[0], parent: { id: path.split("/")[1] } } }, data: () => data });
      const u = stale("portal/a1/refUpdates/u9", { slot: 2, name: "Dr. Lena Ruiz", email: "lruiz@example.com", relationship: "", phone: "", address: "" });
      const r = stale("refResponses/lenaLinkToken1234567890", { v: 1, answers: { known: "2 yrs", signName: "Lena" }, submittedAt: Date.now(), hp: "" });
      window.__mock.listeners.forEach(l => {
        if (l.target.kind === "group" && l.target.name === "refUpdates") l.cb({ docs: [u] });
        if (l.target.kind === "col" && l.target.path === "refResponses") l.cb({ docs: [r] });
      });
    });
    await wait(page, 1500);
    const r2 = (await priv(page, "a1")).refs.r2, link = await page.evaluate(() => window.__mock.docs.has("refLinks/lenaLinkToken1234567890"));
    const writes = await page.evaluate(n => (window.__mock.writes || []).slice(n).filter(w => /applicants\/a1/.test(w.path)).length, before);
    if (!r2.contacted || !r2.link || !r2.form || !link) fail("stale copy wiped the new reference: " + JSON.stringify(r2)); else ok("an out-of-date desk can't redo a reference swap (progress kept)");
    if (writes) fail(`stale copy re-filed answers (${writes} writes)`); else ok("an out-of-date desk can't re-file reference answers");
    await ctx.close();
  }
  // ---- the rest of the app still loads cleanly
  for (const [url, user, sel, label] of [["/", null, "#home", "home page"], ["/apply", null, "#apply", "online application"], ["/signin", null, "#signin", "sign-in"],
    ["/", OWNER, "#app", "owner desk"], ["/", { email: "marcus.bell@example.com", displayName: "" }, "#portal", "applicant portal"], ["/", { email: "orientationpaperwork@pvrs.org", displayName: "" }, "#vault", "paperwork page"]]) {
    const { ctx, page } = await open(browser, { url, user });
    if (await page.locator(sel).isHidden()) fail(label + " didn't load"); else ok(label + " loads");
    await ctx.close();
  }
  // ---- Nov 3 batch: Go to it, interview score, stalled / mentor / anniversary to-dos, flyer, year-end report
  {
    const day = 864e5, iso = t => localDay(t);
    const ann = new Date(); ann.setFullYear(ann.getFullYear() - 1); ann.setDate(ann.getDate() + 3);
    const { ctx, page } = await open(browser, { seed: [["applicants/a9", { name: "Riley Park", email: "riley@example.com", type: "Regular", location: "Potsdam", app: { received: "2025-09-01", complete: "yes" }, updatedAt: Date.now() }],
      ["applicants/a9/private/main", { board: { result: "approved", date: iso(ann.getTime()) }, appr: { committee: "yes" } }]] }); await wait(page, 600);
    await page.evaluate(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; window.__printHTML = document.querySelector("#print")?.innerHTML || ""; }; });
    await pickApplicant(page, "Marcus Bell");   // next step: MVR completed, on the Checks tab
    await page.locator('[data-act="nextgo"]').click(); await wait(page, 600);
    const onChecks = await page.locator('.tabdock [data-tab="checks"][aria-selected="true"]').count(), foc = await page.evaluate(() => document.activeElement?.dataset?.k || "");
    if (!onChecks || foc !== "mvr.completed") fail(`Go to it: checks tab ${onChecks}, focus ${foc}`); else ok("Go to it opens the right tab and lands on the next step's field");
    await page.locator('.tabdock [data-tab="iv"]').click(); await wait(page, 300);
    for (const [k, v] of [["comm", "4"], ["motiv", "5"], ["avail", "3"]]) await page.locator(`[data-k="iv.score.${k}"] [data-v="${v}"]`).click();
    await wait(page, 700);
    const tot = (await page.locator("#ivScoreTotal").textContent()).trim(), sc = await page.evaluate(() => window.__mock.docs.get("applicants/a2").iv?.score);
    if (!/^4\.0 \/ 5 \(3 of 5 rated\)$/.test(tot) || String(sc?.comm) !== "4") fail(`interview score: ${tot} ${JSON.stringify(sc)}`); else ok("interview scores save and show their average");
    // Georgia untouched for 20 days → stalled to-do; Riley approved a year ago → mentor + anniversary to-dos
    await page.evaluate(d => { const m = window.__mock.docs, a = m.get("applicants/a1"), p = m.get("applicants/a1/private/main"); a.updatedAt = Date.now() - 20 * d; p.secUpdatedAt = Date.now() - 20 * d; window.__mock.emit(); }, day);
    await page.locator("#overviewBtn").click(); await wait(page, 500);
    const cmdAll = page.locator('[data-cmd="todoall"]'); if (await cmdAll.count()) { await cmdAll.click(); await wait(page, 300); }
    const td = (await page.locator(".todoitem").allTextContents()).map(t => t.replace(/\s+/g, " "));
    const has = re => td.some(t => re.test(t));
    if (!has(/No movement in 20 days.*Georgia Thurmond/)) fail("no stalled to-do: " + JSON.stringify(td)); else ok("To do flags applicants with no movement in 14+ days");
    if (!has(/Pair Riley with a mentor/)) fail("no mentor to-do: " + JSON.stringify(td)); else ok("To do asks to pair new members with a mentor");
    if (!has(/Riley's 1-year anniversary.*in 3 days/)) fail("no anniversary: " + JSON.stringify(td)); else ok("To do shows membership anniversaries coming up");
    await page.locator('[data-cmd="flyer"]').click(); await wait(page, 600);
    const fl = await page.evaluate(() => window.__printHTML || "");
    if (!/Join Potsdam's volunteer EMS/.test(fl) || !/<svg[^>]*aria-label="QR code"/.test(fl)) fail("flyer: " + fl.slice(0, 120)); else ok("Recruiting flyer prints with a QR code");
    await page.locator('[data-cmd="yearreport"]').click(); await wait(page, 400);
    const yr = await page.evaluate(() => window.__printHTML || "");
    if (!new RegExp(`${new Date().getFullYear()} membership report`).test(yr) || !/How far applicants got/.test(yr)) fail("year report: " + yr.slice(0, 120)); else ok("Year-end report prints the year's numbers and funnel");
    await ctx.close();
  }
  // ---- Original application: print the online form, open the paper copy, or upload one
  {
    const form = { v: 1, submittedAt: Date.now() - 864e5, person: { first: "Marcus", last: "Bell", email: "marcus.bell@example.com", phone: "315-555-0188", type: "Associate", dlState: "NY", dlNumber: "B-1", permAddr: { street: "2 Elm", city: "Potsdam", state: "NY", zip: "13676" } },
      references: [{ name: "Coach Dan Price", email: "dan@example.com" }], signature: { confirmed: true, name: "Marcus Bell" } };
    const { ctx, page } = await open(browser, { seed: [["applicants/a1/records/rp1", { name: "Georgia-paper-application.pdf", label: "Application", path: "records/a1/1-Georgia-paper-application.pdf", size: 120000, contentType: "application/pdf", uploadedAt: Date.now() - 2 * 864e5, uploadedBy: "dkota@pvrs.org" }]] });
    await wait(page, 600);
    await page.evaluate(f => { window.__mock.docs.get("applicants/a2/private/main").form = f; window.__mock.emit(); }, form); await wait(page, 300);
    await page.evaluate(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; window.__printHTML = document.querySelector("#print")?.innerHTML || ""; };
      window.open = () => { window.__opened = (window.__opened || 0) + 1; return { close(){}, set location(u){ window.__openedURL = u; } }; }; });
    await pickApplicant(page, "Marcus Bell");
    const og = (await page.locator("#formGroup").textContent()).replace(/\s+/g, " ");
    if (!/Original application/.test(og) || !/Submitted online/.test(og) || !/signed “Marcus Bell”/.test(og)) fail("online original: " + og); else ok("Application tab shows the original online application");
    await page.locator('.hacts [data-act="printapp"]').click(); await wait(page, 400);
    const ph = await page.evaluate(() => window.__printHTML || "");
    if (!/submitted online/.test(ph) || !/Coach Dan Price/.test(ph) || !/B-1/.test(ph)) fail("header Application didn't print the form: " + ph.slice(0, 120)); else ok("header Application button prints the original online form");
    if (!(await page.locator('#formGroup [data-act="uploadapp"]').count())) fail("no Upload original for an online applicant"); else ok("online applicants can also get an uploaded paper original");
    await page.screenshot({ path: path.join(OUT, "20-original-online.png") });
    await page.evaluate(h => { let el = document.querySelector("#print"); if (!el) { el = document.createElement("div"); el.id = "print"; document.body.appendChild(el); } el.innerHTML = h; document.body.classList.add("printing"); }, ph);
    await page.emulateMedia({ media: "print" }); await page.pdf({ path: path.join(OUT, "23-printed-application.pdf"), format: "Letter" }).catch(() => {});
    await page.emulateMedia({ media: "screen" }); await page.evaluate(() => { document.body.classList.remove("printing"); const el = document.querySelector("#print"); if (el) el.innerHTML = ""; });
    await pickApplicant(page, "Georgia Thurmond"); await wait(page, 300);
    const gp = (await page.locator("#formGroup").textContent()).replace(/\s+/g, " ");
    if (!/Paper copy/.test(gp) || !/Georgia-paper-application\.pdf/.test(gp)) fail("paper original: " + gp); else ok("an uploaded paper application shows as the original");
    await page.screenshot({ path: path.join(OUT, "21-original-paper.png") });
    await page.locator('.hacts [data-act="printapp"]').click(); await wait(page, 400);
    if (!(await page.evaluate(() => window.__opened)) || !/Press ⌘P/.test(await page.locator(".toast, #toast").last().textContent())) fail("paper copy didn't open"); else ok("header Application opens the paper copy to print");
    await page.evaluate(() => { window.__mock.docs.delete("applicants/a1/records/rp1"); window.__mock.emit(); }); await wait(page, 400);
    const ng = (await page.locator("#formGroup").textContent()).replace(/\s+/g, " ");
    if (!/No original on file/.test(ng) || !(await page.locator('#formGroup [data-act="uploadapp"]').count())) fail("no-original state: " + ng); else ok("files with no original offer Upload original");
    await page.screenshot({ path: path.join(OUT, "22-original-none.png") });
    await page.locator('#formGroup [data-act="uploadapp"]').click(); await wait(page, 300);
    if ((await page.locator("#recLabel").inputValue()) !== "Application") fail("upload didn't pre-pick Application"); else ok("Upload original opens the uploader set to Application");
    await page.keyboard.press("Escape"); await wait(page, 200);
    await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k"); await wait(page, 300); await page.locator("#palQ").fill("marcus"); await wait(page, 300);
    if (!/Print application/.test(await page.locator("#palList").textContent())) fail("⌘K has no Print application"); else ok("⌘K offers Print application for the person found");
    await ctx.close();
  }
  // ---- applicant portal: "Step 2 of 3" tracker and the interview-tomorrow reminder
  {
    const soon = Date.now() + 20 * 36e5;
    const { ctx, page } = await open(browser, { user: { email: "riley@example.com", displayName: "Riley" }, seed: [["portal/p9", { email: "riley@example.com", name: "Riley Park", firstName: "Riley", type: "Regular", docs: [], refs: [], bookingOpen: true,
      steps: [{ label: "Application", state: "done" }, { label: "References", state: "now" }, { label: "Interview", state: "todo" }], interview: { slotId: "s9", start: soon, duration: 30, location: "PVRS building" } }], ["portalEmails/riley@example.com", { id: "p9" }]] });
    await wait(page, 800);
    const tk = (await page.locator(".tracker").textContent().catch(() => "")).replace(/\s+/g, " "), iv = (await page.locator(".ivsoon").textContent().catch(() => "")).replace(/\s+/g, " ");
    if (!/Step 2 of 3: References/.test(tk) || !/33%/.test(tk)) fail("portal tracker: " + tk); else ok("the portal shows a Step X of Y progress bar");
    if (!/Your interview is (today|tomorrow) at/.test(iv) || !/Add to calendar/.test(iv)) fail("interview reminder: " + iv); else ok("the portal reminds applicants the day before their interview");
    await ctx.close();
  }
  // ---- Orientation forms signed on the phone, only while the chair has signing open; uploads any time (Nov 11)
  {
    const d = n => localDay(Date.now() - n * 864e5), key = l => l.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
    const oldPhys = key("Copy of health physical, record of PPD, Hep B record or refusal");
    const seed = [["applicants/s1", { name: "Sig Ner", email: "s1@example.com", app: { received: d(40), complete: "yes" }, sched: { scheduled: d(25), completed: d(25) }, updatedAt: Date.now() }],
      ["applicants/s1/private/main", { mvr: { completed: d(30) }, dl: { date: d(30), valid: "yes" }, refs: { r1: { name: "A", returned: d(20) }, r2: { name: "B", returned: d(20) }, r3: { name: "C", returned: d(20) } }, appr: { committee: "yes" },
        board: { result: "approved", date: d(10) }, bg: { sterReq: d(9), sterDone: d(5), sterResult: "clear" }, portal: { invited: d(8) }, onb: { orientStarted: d(3), items: { [oldPhys]: d(2), copy_of_driver_s_license: d(2) } } }]];
    const grab = (page, re) => page.evaluate(r => [...window.__mock.docs.entries()].filter(([k]) => new RegExp(r).test(k)), re);
    let portalDocs, lockedDocs;
    { const { ctx, page } = await open(browser, { seed }); await wait(page, 900); await pickApplicant(page, "Sig Ner"); await wait(page, 1800);
      const row = await page.locator("#signRow").textContent().catch(() => "");
      if (!/Closed/.test(row) || !(await page.locator('[data-signwin="1"]').count())) fail("sign row: " + row); else ok("the Onboard tab has an Open signing switch, closed to start");
      const pv = await priv(page, "s1"), it = pv.onb.items || {};
      if (!it.copy_of_health_physical || !it.record_of_ppd || !it.record_of_hep_b_or_signed_refusal) fail("old combined line not carried over: " + JSON.stringify(it)); else ok("dates on the old combined health line carry over to the three new lines");
      if (!Object.keys(it).some(k => /^acknowledg/.test(k))) fail("Sterling line not ticked"); else ok("the Sterling acknowledgement line is ticked from the finished check");
      const od = await page.locator("#orDocs").textContent();
      if (!/Emergency contact form/.test(od) || !/Record of PPD/.test(od) || !/Forms signed on their phone/.test(od) || !/Confidentiality Quiz/.test(od)) fail("orientation docs list: " + od.slice(0, 400)); else ok("the checklist follows the new sheet and lists the phone forms");
      await wait(page, 600); lockedDocs = await grab(page, "^(portal/s1$|portalEmails)");
      await page.locator('[data-signwin="1"]').click(); await wait(page, 700);
      const pd = await page.evaluate(() => window.__mock.docs.get("portal/s1"));
      if (!(pd.signUntil > Date.now() + 2 * 36e5) || !/Open until/.test(await page.locator("#signRow").textContent())) fail("signing didn't open: " + pd.signUntil); else ok("Open signing gives the new member a three-hour window");
      portalDocs = await grab(page, "^(portal/s1$|portalEmails)"); await ctx.close(); }
    const me = { email: "s1@example.com", displayName: "Sig" };
    { const { ctx, page } = await open(browser, { w: 390, h: 844, user: me, seed: lockedDocs }); await wait(page, 1000);
      const t = await page.locator("#orientCard").textContent().catch(() => "");
      if (!/Forms to sign/.test(t) || !/At your session/.test(t) || await page.locator("[data-formsign]").count()) fail("forms should be locked: " + t.slice(0, 300)); else ok("before the session the forms are listed but locked");
      await ctx.close(); }
    let after;
    { const { ctx, page } = await open(browser, { w: 390, h: 844, user: me, seed: portalDocs }); await wait(page, 1000);
      if (!/Sign your orientation forms/.test(await page.locator("#moveCard").textContent())) fail("no Your move for signing"); else ok("with signing open, Your move says to sign the forms");
      const ins = page.locator(".or-item", { hasText: "Insurance beneficiary" });
      if (!/Paper form/.test(await ins.textContent()) || await ins.locator("[data-upload]").count()) fail("insurance line: " + await ins.textContent()); else ok("the insurance beneficiary line is marked paper, with no upload");
      const lic = page.locator('#orientCard [data-upload="onb:copy_of_driver_s_license"]');
      if (!(await lic.count()) || !/Add file/.test(await lic.textContent())) fail("no upload on a finished line"); else ok("a line that's already checked off still takes another file");
      await lic.evaluate(b => { const i = document.querySelector('input[type="file"]'); i.click = () => {}; b.click(); });
      await page.locator('input[type="file"]').setInputFiles([{ name: "license.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from("PK") }, { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("x") }]); await wait(page, 900);
      const fl = (await grab(page, "^portal/s1/files/")).map(([, v]) => v), er = (await grab(page, "^portal/s1/uploadErrors/")).map(([, v]) => v);
      if (!fl.some(f => f.name === "license.docx")) fail("Word file refused"); else ok("a Word file uploads");
      if (!er.some(e => e.name === "notes.txt" && e.code === "wrong-type")) fail("no note for the refused file: " + JSON.stringify(er)); else ok("a refused file leaves the reason for the desk");
      // sign the confidentiality statement
      await page.locator('[data-formsign="confidentiality"]').click(); await wait(page, 400);
      if (!/may not make public/.test(await page.locator("#modal").textContent())) fail("statement wording missing"); else ok("the form shows the squad's own wording");
      await page.locator("#fmSave").click(); await wait(page, 300);
      if ((await grab(page, "^portal/s1/forms/")).length) fail("saved without a signature"); else ok("it can't be saved without a signature");
      const draw = async () => { const c = page.locator("#fmPad"); await c.scrollIntoViewIfNeeded(); const b = await c.boundingBox();
        await page.mouse.move(b.x + 30, b.y + 60); await page.mouse.down(); await page.mouse.move(b.x + 90, b.y + 30, { steps: 5 }); await page.mouse.move(b.x + 160, b.y + 90, { steps: 5 }); await page.mouse.up(); };
      await draw(); await snap(page, "72-sign-form-phone"); await page.locator("#fmSave").click(); await wait(page, 500);
      const cf = await page.evaluate(() => window.__mock.docs.get("portal/s1/forms/confidentiality"));
      if (!cf || !/^data:image\/png/.test(cf.sig || "") || cf.name !== "Sig Ner" || cf.by !== "s1@example.com") fail("signed form: " + JSON.stringify(cf).slice(0, 200)); else ok("signing with a finger saves the form with the signature");
      if (!/Signed/.test(await page.locator(".fm-list .or-item", { hasText: "Confidentiality Statement" }).textContent())) fail("not shown as signed"); else ok("the signed form shows as Signed");
      await page.locator('[data-formview="confidentiality"]').click(); await wait(page, 300);
      if (!(await page.locator("#modal .formdoc img").count()) || !(await page.locator("#fmPrint").count())) fail("no document view"); else ok("they can open the signed document and print or save it");
      await page.locator("#modal [data-x]").click(); await wait(page, 200);
      // emergency contact: required fields
      await page.locator('[data-formsign="emergency"]').click(); await wait(page, 300); await draw(); await page.locator("#fmSave").click(); await wait(page, 300);
      if (await page.evaluate(() => window.__mock.docs.has("portal/s1/forms/emergency"))) fail("emergency form saved with blanks"); else ok("the emergency contact form wants its required lines");
      for (const [k, v] of [["m_address", "1 Elm St"], ["m_city", "Potsdam"], ["m_phone", "315-555-0100"], ["p_name", "Pat Ner"], ["p_phone", "315-555-0101"]]) await page.locator(`#modal [name="${k}"]`).fill(v);
      await page.locator("#fmSave").click(); await wait(page, 500);
      const em = await page.evaluate(() => window.__mock.docs.get("portal/s1/forms/emergency"));
      if (!em || em.values.p_name !== "Pat Ner" || em.values.m_name !== "Sig Ner") fail("emergency: " + JSON.stringify(em || {}).slice(0, 200)); else ok("the emergency contact form saves what they typed");
      // Hep B declination is medical: vault only
      await page.locator('[data-formsign="hepb"]').click(); await wait(page, 300); await draw(); await page.locator("#fmSave").click(); await wait(page, 500);
      const vault = (await grab(page, "^vault/")).map(([, v]) => v), stub = (await grab(page, "^portal/s1/files/")).map(([, v]) => v).find(f => f.confidential);
      if (!vault.some(v => v.form && v.form.key === "hepb" && v.path === "") || await page.evaluate(() => window.__mock.docs.has("portal/s1/forms/hepb"))) fail("hep B not vault-only"); else ok("the Hepatitis B declination goes only to the paperwork vault");
      if (!stub || stub.name !== "Private document" || stub.docKey !== "onb:record_of_hep_b_or_signed_refusal") fail("hep B stub: " + JSON.stringify(stub)); else ok("the squad only gets a nameless private document on the Hep B line");
      if (!/Sent securely/.test(await page.locator(".fm-list .or-item", { hasText: "Hepatitis B" }).textContent())) fail("hep B row not marked sent"); else ok("their Hep B line reads Sent securely");
      after = await grab(page, "^(portal/s1|portalEmails|vault/)"); await ctx.close(); }
    { const { ctx, page } = await open(browser, { seed: [...seed, ...after] }); await wait(page, 900); await pickApplicant(page, "Sig Ner"); await wait(page, 1800);
      const od = await page.locator("#orDocs").textContent();
      if (!/needs your countersignature/.test(od) || await page.locator('[data-deskform="hepb"]').count()) fail("desk forms list: " + od.slice(-500)); else ok("the desk lists the signed forms, and no Hep B form to open");
      if (!/turned away/.test(od) || !/notes\.txt/.test(od)) fail("no upload-failure note on the desk"); else ok("the desk shows which upload was turned away and why");
      const pv = await priv(page, "s1");
      if (!pv.onb.items.confidentiality_statement || !pv.onb.items.emergency_contact_form) fail("signed lines not ticked: " + JSON.stringify(pv.onb.items)); else ok("signed forms tick their checklist lines");
      await page.locator('[data-deskform="confidentiality"]').click(); await wait(page, 300); await snap(page, "73-signed-form-desk");
      await page.locator("#sfWit").click(); await wait(page, 400);
      const cf = await page.evaluate(() => window.__mock.docs.get("portal/s1/forms/confidentiality"));
      if (!cf.witness || !cf.witness.at) fail("no countersignature"); else ok("the orientation chair can countersign");
      await ctx.close(); }
    { const { ctx, page } = await open(browser, { user: { email: "orientationpaperwork@pvrs.org", displayName: "Paperwork" }, seed: after }); await wait(page, 900);
      await page.locator("[data-vopen]").first().click().catch(() => {}); await wait(page, 300);
      if (!/decline hepatitis B vaccination/.test(await page.locator("#modal").textContent().catch(() => ""))) fail("vault can't open the signed declination"); else ok("the paperwork account can open and print the signed declination");
      await ctx.close(); }
  }
  // ---- Add someone straight to orientation, with no application
  {
    const { ctx, page } = await open(browser); await wait(page, 500);
    if (await page.locator("#orientAddBtn").isVisible()) fail("Add someone showing on the applicant list"); else ok("Add someone stays off the applicant list");
    const lane = page.locator('.lane[aria-label="Onboard"] [data-oadd]');
    if (!(await lane.count())) fail("no Add someone on the Onboard lane"); else ok("the Onboard lane has Add someone");
    await lane.click(); await wait(page, 300);
    if (!/didn't apply/i.test(await page.locator("#modal").textContent())) fail("add form copy"); else ok("the form is for someone who didn't apply");
    await page.locator("#f-n-name").fill("Casey Morgan");
    await page.locator("#f-n-phone").fill("315-555-0199");
    await page.locator("#f-n-email").fill("casey@example.com");
    await snap(page, "71-add-orientation-form");
    await page.locator("#oAddGo").click(); await wait(page, 1800);
    const added = await page.evaluate(() => {
      const m = window.__mock.docs;
      const hit = [...m.entries()].find(([k, v]) => /^applicants\/[^/]+$/.test(k) && v.name === "Casey Morgan");
      if (!hit) return null;
      const id = hit[0].split("/")[1];
      const pv = m.get(`applicants/${id}/private/main`) || {};
      const pd = m.get(`portal/${id}`);
      const msgs = [...m.entries()].filter(([k]) => k.startsWith(`portal/${id}/messages/`)).map(([, v]) => v.text || "");
      const appItem = (pd?.orientation?.items || []).find(i => /^Completed application/.test(i.label));
      return { id, direct: !!pv.onb?.direct, started: pv.onb?.orientStarted || "", received: hit[1].app?.received || "", board: pv.board?.result || "", items: pd?.orientation?.items?.length || 0, appDate: appItem?.date || "", msgs };
    });
    if (!added?.direct || !added.started) fail("direct flags: " + JSON.stringify(added)); else ok("their file is orientation-only and orientation has started");
    if (added.received || added.board) fail("application or board was filled in: " + JSON.stringify(added)); else ok("no application and no board vote were recorded");
    if (added.items < 5 || added.appDate) fail("portal checklist: " + JSON.stringify(added)); else ok("their portal is the orientation dashboard, and the application stays unchecked");
    if (!added.msgs.some(t => /orientation dashboard/i.test(t)) || added.msgs.some(t => /thank you for applying/i.test(t))) fail("welcome: " + (added.msgs[0] || "").slice(0, 180)); else ok("the welcome is about orientation");
    const box = await page.locator("#orientBox").textContent();
    if (!/no application on file/.test(box) || !/Status: New member/.test(box)) fail("status: " + (box || "").slice(0, 240)); else ok("the Onboard tab says they started here with no application");
    await snap(page, "71-add-orientation");
    await page.locator('#chips [data-f="all"]').click(); await wait(page, 400);
    if (/Casey Morgan/.test((await page.locator(".arow").allTextContents()).join("|"))) fail("Casey is on the applicant list"); else ok("they are not on the applicant list");
    await page.locator('#chips [data-f="orient"]').click(); await wait(page, 400);
    const or = (await page.locator(".arow").allTextContents()).join("|");
    if (!/Casey Morgan/.test(or) || !/Orientation/.test(or)) fail("onboard row: " + or.replace(/\s+/g, " ").slice(0, 300)); else ok("they show on the Onboard list, in orientation");
    if (await page.locator("#orientAddBtn").isHidden()) fail("Add someone hidden on Onboard"); else ok("Add someone is on the Onboard list");
    await page.locator("#orientBtn").click(); await wait(page, 400);
    const board = await page.locator("#modal").textContent();
    const waitPart = board.split("Waiting on Sterling")[1] || "";
    if (/Casey Morgan/.test(waitPart)) fail("Casey is waiting on Sterling");
    else if (!/Casey Morgan/.test(board) || !(await page.locator(".or-grid").count())) fail("Casey missing from the orientation board: " + board.slice(0, 240));
    else ok("they are on the orientation board, not waiting on Sterling");
    await page.locator("#modal [data-x]").click(); await wait(page, 200);
    await page.locator("#orientAddBtn").click(); await wait(page, 300);
    await page.locator("#oSend").uncheck();
    await page.locator("#f-n-name").fill("Pat Direct");
    await page.locator("#oAddGo").click(); await wait(page, 800);
    const pat = await page.evaluate(() => {
      const m = window.__mock.docs;
      const hit = [...m.entries()].find(([k, v]) => /^applicants\/[^/]+$/.test(k) && v.name === "Pat Direct");
      if (!hit) return null;
      const id = hit[0].split("/")[1];
      const msgs = [...m.entries()].filter(([k]) => k.startsWith(`portal/${id}/messages/`));
      return { direct: !!m.get(`applicants/${id}/private/main`)?.onb?.direct, msgs: msgs.length, email: hit[1].email || "" };
    });
    if (!pat?.direct || pat.email || pat.msgs) fail("no-email add: " + JSON.stringify(pat)); else ok("someone with no email can still be added, and no welcome is sent");
    await ctx.close();
  }
  // ---- Finishing orientation prints one packet, then the uploads can be removed
  {
    const gif = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    const seed = [
      ["applicants/pkt", { name: "Casey Packet", email: "casey.packet@example.com", phone: "315-555-0142", type: "Regular", stage: "onb", updatedAt: Date.now() }],
      ["applicants/pkt/private/main", { onb: { direct: true, orientStarted: "2026-11-01" } }],
      ["portal/pkt", { email: "casey.packet@example.com", name: "Casey Packet", orientation: { start: "2026-11-01", items: [] } }],
      ["portal/pkt/files/f1", { name: "license.png", path: "uploads/pkt/license.png", contentType: "image/png", label: "Copy of driver's license", uploadedAt: Date.now() }],
      ["applicants/pkt/records/r1", { name: "cpr.pdf", path: "records/pkt/cpr.pdf", contentType: "application/pdf", label: "Orientation: CPR card", uploadedAt: Date.now() }],
      ["applicants/pkt/records/r2", { name: "Private document", path: "", confidential: true, label: "Orientation: Copy of health physical", uploadedAt: Date.now() }],
      ["portal/pkt/forms/confidentiality", { key: "confidentiality", name: "Casey Packet", by: "casey.packet@example.com", signedAt: Date.now(), sig: gif, values: {} }],
      ["portal/pkt/checkins/30", { rating: 5, going: "The crew has been welcoming.", help: "A few more night shifts.", at: Date.now() }],
    ];
    const { ctx, page } = await open(browser, { seed }); await wait(page, 800);
    await page.evaluate(() => { window.print = () => { window.__printed = document.getElementById("print")?.innerHTML || ""; }; });
    await pickApplicant(page, "Casey Packet");
    if (!(await page.locator('[data-oact="packet"]').count())) fail("no print packet button"); else ok("the Onboard tab has Print packet");
    await page.locator('[data-oact="packet"]').click(); await wait(page, 300);
    if (!/one packet/i.test(await page.locator("#modal").textContent())) fail("packet window"); else ok("the packet window explains the print and the removal");
    await page.locator("#pkPrint").click(); await wait(page, 1500);
    const printed = await page.evaluate(() => window.__printed || "");
    if (!/Casey Packet/.test(printed) || !/Confidentiality Statement/.test(printed) || !/pk-scan/.test(printed)) fail("packet html: " + printed.replace(/\s+/g, " ").slice(0, 400)); else ok("the packet has the checklist, the signed form, and the photo");
    if (!/In this packet/.test(printed) || !/Copy of driver's license/.test(printed) || !/315-555-0142/.test(printed)) fail("cover missing"); else ok("the packet opens with a cover and a list of what's inside");
    if (!/The crew has been welcoming/.test(printed)) fail("check-in missing"); else ok("the packet includes their check-in");
    if (!/cpr\.pdf/.test(printed) || !/Not in this packet/.test(printed)) fail("pdf not listed as left out"); else ok("a file that didn't fit the packet is listed and kept");
    if (await page.locator("#pkClear").isHidden()) fail("remove button hidden"); else ok("after printing, the uploads that made it in can be removed");
    await page.locator("#pkClear").click(); await wait(page, 100);
    if (!/Confirm: remove/.test(await page.locator("#pkClear").textContent())) fail("no confirm"); else ok("removing files asks to confirm");
    await page.locator("#pkClear").click(); await wait(page, 600);
    const after = await page.evaluate(() => { const m = window.__mock; return { file: m.docs.has("portal/pkt/files/f1"), pdf: m.docs.has("applicants/pkt/records/r1"), medical: m.docs.has("applicants/pkt/records/r2"), person: m.docs.has("applicants/pkt"), deleted: m.deleted || [] }; });
    if (after.file || !after.pdf || !after.medical || !after.person || after.deleted.join() !== "uploads/pkt/license.png") fail("cleanup: " + JSON.stringify(after)); else ok("the photo is deleted, the person and the files that weren't in the packet stay");
    const noted = await page.locator("#orientBox").textContent();
    if (!/Paper packet/.test(noted) || !/1 upload removed/.test(noted)) fail("packet note: " + (noted || "").replace(/\s+/g, " ").slice(0, 240)); else ok("the file remembers that the packet was printed and the upload was removed");
    await ctx.close();
  }
  // ---- Secure documents open for the Admin role on the file (applicant stage and orientation), nobody else on the desk (Nov 14)
  {
    const d = n => localDay(Date.now() - n * 864e5);
    const seed = [["staff/admin@pvrs.org", { role: "admin", name: "Casey Admin" }], ["staff/cory@pvrs.org", { role: "coordinator", name: "Cory" }],
      ["applicants/v1", { name: "Val Vault", email: "v1@example.com", app: { received: d(5) }, updatedAt: Date.now() }], ["applicants/v1/private/main", {}],
      ["applicants/v2", { name: "Ori Entation", email: "v2@example.com", app: { received: d(40) }, updatedAt: Date.now() }], ["applicants/v2/private/main", { board: { result: "approved", date: d(5) } }],
      ["vault/x1", { appId: "v1", appName: "Val Vault", label: "Medical documentation", name: "physical.pdf", path: "confidential/v1/1-physical.pdf", size: 10, contentType: "application/pdf", uploadedAt: Date.now(), uploadedBy: "v1@example.com", from: "applicant" }],
      ["vault/x2", { appId: "v2", appName: "Ori Entation", label: "Record of PPD", name: "ppd.jpg", path: "confidential/v2/1-ppd.jpg", size: 10, contentType: "image/jpeg", uploadedAt: Date.now(), uploadedBy: "v2@example.com", from: "applicant" }]];
    const look = async user => { const { ctx, page } = await open(browser, { user, seed }); await wait(page, 900);
      await pickApplicant(page, "Val Vault"); await wait(page, 500); const app = await page.locator("#secureDocs").textContent().catch(() => "");
      await pickApplicant(page, "Ori Entation"); await wait(page, 700); const or = await page.locator("#orDocs #secureDocs").textContent().catch(() => "");
      await ctx.close(); return { app, or }; };
    const ad = await look({ email: "admin@pvrs.org", displayName: "Casey" });
    if (!/physical\.pdf/.test(ad.app)) fail("admin: no secure doc on the applicant's file: " + ad.app); else ok("an admin can open an applicant's secure documents");
    if (!/ppd\.jpg/.test(ad.or) || /physical/.test(ad.or)) fail("admin: orientation secure docs: " + ad.or); else ok("and a new member's, under Orientation documents, only their own");
    const ow = await look(OWNER), co = await look({ email: "cory@pvrs.org", displayName: "Cory" });
    if (co.app || co.or) fail("secure docs shown to the coordinator"); else ok("the coordinator still can't open secure documents");
    if (!/physical\.pdf/.test(ow.app) || !/Mark filed/.test(ow.app) || /Mark filed/.test(ad.app)) fail("owner secure docs: " + ow.app); else ok("the owner can open them and has Mark filed; admins don't");
    { const { ctx, page } = await open(browser, { seed }); await wait(page, 900); await pickApplicant(page, "Val Vault"); await wait(page, 500);
      await page.locator('[data-vaultfile="x1"]').click(); await wait(page, 500);
      const v = await page.evaluate(() => window.__mock.docs.get("vault/x1"));
      if (!v.filedAt || !/Filed ✓/.test(await page.locator("#secureDocs").textContent())) fail("mark filed didn't save"); else ok("Mark filed saves and shows Filed");
      await ctx.close(); }
  }
  // ---- Request one missing orientation document from its line, before or during orientation (Nov 14)
  {
    const d = n => localDay(Date.now() - n * 864e5);
    const seed = [["applicants/q1", { name: "Pre Orient", email: "q1@example.com", app: { received: d(40) }, updatedAt: Date.now() }], ["applicants/q1/private/main", { board: { result: "approved", date: d(5) }, portal: { invited: d(3) } }],
      ["applicants/q2", { name: "Inn Orient", email: "q2@example.com", app: { received: d(40) }, updatedAt: Date.now() }],
      ["applicants/q2/private/main", { board: { result: "approved", date: d(10) }, bg: { sterReq: d(9), sterDone: d(5), sterResult: "clear" }, portal: { invited: d(8) }, onb: { orientStarted: d(3) } }]];
    const { ctx, page } = await open(browser, { seed }); await wait(page, 900);
    await pickApplicant(page, "Pre Orient"); await wait(page, 700);
    if (await page.locator('[data-orreq^="insurance"]').count() || await page.locator('[data-orreq^="confidentiality"]').count()) fail("Request offered on a paper or signed line"); else ok("paper and sign-at-session lines have no Request button");
    await page.locator('[data-orreq^="copy_of_driver"]').click(); await wait(page, 2200);
    const q1 = await page.evaluate(() => ({ pv: window.__mock.docs.get("applicants/q1/private/main"), pd: window.__mock.docs.get("portal/q1"), mail: document.querySelector("#emBody")?.value || "" }));
    if (!Object.values(q1.pv.docs?.requested || {}).some(x => x.label === "Copy of driver's license") || !(q1.pd?.docs || []).some(x => x.label === "Copy of driver's license")) fail("pre-orientation request: " + JSON.stringify([q1.pv.docs, q1.pd?.docs])); else ok("before orientation opens, a requested line lands under Documents on their portal page");
    if (!/Copy of driver's license/.test(q1.mail) || !/any time/.test(q1.mail)) fail("request email: " + q1.mail.slice(0, 200)); else ok("the request opens the email with that document listed");
    await page.keyboard.press("Escape"); await wait(page, 300);
    await pickApplicant(page, "Inn Orient"); await wait(page, 1500);
    await page.locator('[data-orreq^="copy_of_training"]').click(); await wait(page, 2200);
    const q2 = await page.evaluate(() => ({ pv: window.__mock.docs.get("applicants/q2/private/main"), pd: window.__mock.docs.get("portal/q2") }));
    if (!q2.pv.onb?.requested?.copy_of_training_records_emt_cpr_etc || !(q2.pd?.orientation?.items || []).some(i => i.key === "copy_of_training_records_emt_cpr_etc" && i.req)) fail("in-orientation request: " + JSON.stringify(q2.pv.onb?.requested)); else ok("in orientation, a requested line shows as Requested on their checklist");
    await page.keyboard.press("Escape"); await wait(page, 300);
    if (!/Ask again/.test(await page.locator('[data-orreq^="copy_of_training"]').textContent())) fail("no Ask again"); else ok("a requested line offers Ask again");
    await ctx.close();
  }
  // ---- the flyer's QR link pre-picks "Flyer or poster" on the application
  {
    const { ctx, page } = await open(browser, { url: "/apply?src=flyer", user: null }); await wait(page, 600);
    const v = await page.locator('[data-p="heard.source"]').inputValue().catch(() => "");
    if (v !== "Flyer or poster") fail(`?src=flyer didn't pre-pick: "${v}"`); else ok("scanning the flyer pre-picks Flyer or poster on the application");
    await ctx.close();
  }
} catch (e) { errors.push("[harness] " + (e.stack || e.message)); }
await browser.close();
console.log(notes.join("\n"));
console.log(errors.length ? "\nERRORS:\n" + errors.join("\n") : `\n${notes.length} checks, no errors`);
process.exit(errors.length ? 1 : 0);
