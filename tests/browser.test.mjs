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
const OWNER = { email: "dkota@pvrs.org", displayName: "Dkota Wright" };

async function open(browser, { url = "/", user = OWNER, w = 1440, h = 900, dark = false } = {}){
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: dark ? "dark" : "light" });
  await ctx.addInitScript(u => { window.__MOCK_USER = u; HTMLAnchorElement.prototype.click = function(){ (window.__clicked = window.__clicked || []).push(this.href); }; }, user);
  await ctx.route("**/*", route => {
    const u = new URL(route.request().url());
    if (u.host === "www.gstatic.com") return route.fulfill({ body: MOCK, contentType: "text/javascript" });
    if (u.host === "localhost:5999") {
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

const browser = await chromium.launch();
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
    if (items.join() !== "list,ov,new,msgs,more") fail("phone menu items: " + items); else ok("phone menu: Applicants, Overview, +, Messages, More");
    await page.click('#mnav [data-m="ov"]'); await wait(page, 500);
    if (await page.locator(".ov").isHidden() || !/Good (morning|afternoon|evening)/.test(await page.locator(".ov").textContent())) fail("phone overview not shown"); else ok("phone: Overview shows the dashboard");
    await page.click('#mnav [data-m="list"]'); await wait(page, 500);
    if (await page.locator("#app").evaluate(a => a.classList.contains("ovopen"))) fail("Applicants didn't close overview"); else ok("phone: Applicants returns to the list");
    await page.click('#mnav [data-m="more"]'); await wait(page, 300);
    const more = await page.locator("#modal").textContent();
    if (!/Interview times/.test(more) || !/Settings/.test(more) || !/Sign out/.test(more)) fail("More sheet: " + more.slice(0, 120)); else ok("phone: More has interview times, settings, sign out");
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
    const items = await page.locator("#mnav [data-m]:visible").evaluateAll(b => b.map(x => x.dataset.m));
    if (items.includes("new")) fail("admin sees + on phone: " + items); else ok("phone: only the owner gets the + button");
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
    const iso = d => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
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
  // ---- the rest of the app still loads cleanly
  for (const [url, user, sel, label] of [["/", null, "#home", "home page"], ["/apply", null, "#apply", "online application"], ["/signin", null, "#signin", "sign-in"],
    ["/", OWNER, "#app", "owner desk"], ["/", { email: "marcus.bell@example.com", displayName: "" }, "#portal", "applicant portal"], ["/", { email: "orientationpaperwork@pvrs.org", displayName: "" }, "#vault", "paperwork page"]]) {
    const { ctx, page } = await open(browser, { url, user });
    if (await page.locator(sel).isHidden()) fail(label + " didn't load"); else ok(label + " loads");
    await ctx.close();
  }
} catch (e) { errors.push("[harness] " + (e.stack || e.message)); }
await browser.close();
console.log(notes.join("\n"));
console.log(errors.length ? "\nERRORS:\n" + errors.join("\n") : `\n${notes.length} checks, no errors`);
process.exit(errors.length ? 1 : 0);
