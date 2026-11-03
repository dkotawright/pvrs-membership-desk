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

async function open(browser, { url = "/", user = OWNER, w = 1440, h = 900, dark = false, seed = null, files = {} } = {}){
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: dark ? "dark" : "light" });
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
const pickApplicant = async (page, name) => { await page.evaluate(n => [...document.querySelectorAll(".arow")].find(r => r.textContent.includes(n))?.click(), name); await wait(page, 400); };

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
    if (/Dkota/.test(txt) || !/Squad member/.test(txt) || !/Continue with Google/.test(txt)) fail("sign-in wording"); else ok("sign-in wording is professional (no first names)");
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
    if (items.join() !== "list,ov,msgs,more") fail("phone menu items: " + items); else ok("phone menu: Applicants, Overview, Messages, More (no big +)");
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
    if (items !== 11 || !/0 of 11 done/.test(await page.locator("#onbCount").textContent())) fail("checklist rows: " + items); else ok("Onboard tab shows the new-member checklist");
    await pickApplicant(page, "Georgia Thurmond");
    await page.locator('.tabdock [data-tab="board"]').click(); await wait(page, 300);
    await page.locator('[data-k="board.result"] [data-v="approved"]').click(); await wait(page, 300);
    await page.locator('.tabdock [data-tab="onb"]').click(); await wait(page, 300);
    await page.locator('[data-k="onb.items.id_badge_issued"]').fill(localDay(Date.now())); await page.locator('[data-k="onb.items.id_badge_issued"]').blur(); await wait(page, 400);
    if (!/1 of 11 done/.test(await page.locator("#onbCount").textContent())) fail("checklist count: " + await page.locator("#onbCount").textContent()); else ok("checking off an item updates the count");
    await page.keyboard.press("Escape"); await wait(page, 200); await page.keyboard.press("Escape"); await wait(page, 500);
    await page.evaluate(() => document.querySelector("#overviewBtn")?.click()); await wait(page, 500);
    await page.evaluate(() => document.querySelector('[data-cmd="todoall"]')?.click()); await wait(page, 300);
    const td = await page.locator(".todo .todoitem").evaluateAll(r => r.map(x => x.textContent.replace(/\s+/g, " ").trim()));
    if (!td.some(t => /CPR \/ BLS card expires in 10 days.*Marcus Bell/.test(t))) fail("no expiry to do: " + JSON.stringify(td)); else ok("To do warns 30 days before a card expires");
    if (!td.some(t => /Finish the new-member checklist.*Georgia Thurmond.*1 of 11 done · next: Uniform and gear issued/.test(t))) fail("no checklist to do: " + JSON.stringify(td)); else ok("To do tracks the new-member checklist after approval");
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
  for (const [w, h, who] of [[1440, 900, OWNER], [390, 844, { email: "alex@pvrs.org", displayName: "Alex" }]]) {
    const { ctx, page } = await open(browser, { w, h, user: who });
    await pickApplicant(page, "Georgia Thurmond");
    await page.locator('.tabdock [data-tab="iv"]').click(); await wait(page, 300);
    await page.locator('[data-act="ivmode"]').click(); await wait(page, 400);
    const vis = await page.locator("#dpanel .group:visible").count(), pos = await page.locator("#ivBar .ivpos").textContent();
    if (vis !== 1 || !/1 of \d+/.test(pos)) fail(`interview mode at ${w}: ${vis} sections visible, ${pos}`); else ok(`interview mode shows one section at a time (${w}px${who === OWNER ? "" : ", member"})`);
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
  // ---- desktop: the applicant list tucks into a strip; filters slide it out
  {
    const { ctx, page } = await open(browser); await wait(page, 400); await page.mouse.move(900, 500); await wait(page, 900);
    const tucked = () => page.evaluate(() => getComputedStyle(document.querySelector(".roster")).transform !== "none");
    if (!(await tucked())) fail("list not tucked on the dashboard"); else ok("desktop: the applicant list tucks into a strip by default");
    await page.locator('#chips [data-f="screen"]').click(); await wait(page, 700);
    if (await tucked() || !/Screening/.test(await page.locator("#rosterTitle").textContent())) fail("filter didn't slide the list out"); else ok("choosing a filter slides the list out with the results");
    await page.mouse.click(1200, 600); await wait(page, 900);
    if (!(await tucked())) fail("list didn't tuck after clicking elsewhere"); else ok("clicking elsewhere tucks it away again");
    await page.locator(".rhandle").hover(); await wait(page, 700);
    await page.locator("#pinBtn").click(); await page.mouse.move(1200, 600); await wait(page, 900);
    if (await tucked()) fail("pinned list still tucks"); else ok("the pin keeps the list docked open");
    await ctx.close();
  }
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
