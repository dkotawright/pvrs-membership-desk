// Checks Med Control's privacy filter: sensitive fields must never reach the AI. Run: node tests/medcontrol-privacy.test.cjs
// (needs `npm install` in functions/). No network, no API calls.
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "pvrs-test";
const { _safeApplicant } = require("../functions/medcontrol.js");
const shared = { name: "Pat Example", type: "Regular", location: "Potsdam", stage: "int", phone: "315-555-0100", email: "pat@example.com",
  app: { received: "2026-10-01" }, iv: { why: "Help people", convicted: "yesbad", convictedExplain: "SECRET-CONVICTION", panel: { m1: "A. Member" } } };
const priv = { notes: "Good fit", mvr: { completed: "2026-10-05", violations: "no" }, dl: { date: "2026-10-06", valid: "yes", number: "SECRET-DL", expires: "2029-01-01" },
  refs: { r1: { name: "Ref One", email: "SECRET-REF-EMAIL@example.com", phone: "SECRET-REF-PHONE", address: "SECRET-REF-ADDR", returned: "2026-10-08", form: { q1: "Reliable" } } },
  form: { person: { dob: "SECRET-DOB", birthplace: "SECRET-BIRTHPLACE", dlNumber: "SECRET-DL2", phone: "SECRET-PHONE", permAddr: { street: "SECRET-STREET" } },
    background: { convicted: "yes", detail: "SECRET-DETAIL" }, employment: { jobs: [{ place: "Store", supervisor: "SECRET-SUPERVISOR" }] }, education: { hs: { name: "PHS" } }, experience: { certs: ["CPR / BLS"] } } };
let fail = 0;
for (const full of [false, true]) {
  const out = JSON.stringify(_safeApplicant("a1", shared, priv, full));
  const leaks = out.match(/SECRET-[A-Z-]+|315-555/g);
  if (leaks) { fail++; console.log(`✗ full=${full} leaked: ${[...new Set(leaks)].join(", ")}`); } else console.log(`✓ full=${full}: nothing sensitive`);
  if (!out.includes("Pat Example") || !out.includes("Ref One")) { fail++; console.log("✗ lost the basics"); }
  if (full && (!out.includes("Reliable") || !out.includes("Help people") || !out.includes("PHS"))) { fail++; console.log("✗ full record missing answers"); }
}
// Filed reference forms keep their answers nested in form.answers: they must reach the brief, and only the brief.
const filed = { refs: { r1: { name: "Ref Two", email: "SECRET-E@example.com", returned: "2026-10-08", form: { date: "2026-10-08", answers: { skills: "Very dependable", ratings: { reliability: 5 }, signName: "Ref Two" } } } } };
const ff = JSON.stringify(_safeApplicant("a2", shared, filed, true)), fs0 = JSON.stringify(_safeApplicant("a2", shared, filed, false));
if (!ff.includes("Very dependable") || !ff.includes('"reliability":5')) { fail++; console.log("✗ filed reference answers don't reach the brief: " + ff); } else console.log("✓ filed reference answers reach the brief");
if (fs0.includes("Very dependable")) { fail++; console.log("✗ reference answers leaked into chat"); } else console.log("✓ reference answers stay out of chat");
if (ff.includes("SECRET-")) { fail++; console.log("✗ filed form leaked contact details"); }
const scored = JSON.stringify(_safeApplicant("a3", { ...shared, iv: { ...shared.iv, score: { comm: 4 } } }, {}, true));
if (!scored.includes('"comm":4')) { fail++; console.log("✗ committee scores missing"); } else console.log("✓ committee scores reach the brief");
// Med Control is owner only: everyone else is refused by the function itself.
(async () => {
  const { _checkCaller } = require("../functions/medcontrol.js");
  const tok = email => ({ token: { email, email_verified: true } });
  const who = await _checkCaller(tok("dkota@pvrs.org")).catch(() => null);
  if (!who || !who.owner) { fail++; console.log("✗ owner refused"); } else console.log("✓ the owner can use Med Control");
  for (const e of ["admin@pvrs.org", "ivy@pvrs.org", "x@example.com"]) { const r = await _checkCaller(tok(e)).then(() => "allowed", err => err.code);
    if (r !== "permission-denied") { fail++; console.log(`✗ ${e}: ${r}`); } else console.log(`✓ ${e} is refused`); }
  const un = await _checkCaller({ token: { email: "dkota@pvrs.org", email_verified: false } }).then(() => "allowed", err => err.code);
  if (un !== "unauthenticated") { fail++; console.log("✗ unverified owner email allowed"); } else console.log("✓ an unverified email is refused");
  process.exit(fail ? 1 : 0);
})();
