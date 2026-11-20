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
  // Roles come from staff/{email}; a stand-in table here so the test needs no database.
  const ROLES = { "admin@pvrs.org": "admin", "ivy@pvrs.org": "interviewer", "full@pvrs.org": "full" }, roleOf = async e => ROLES[e] || null;
  const fu = await _checkCaller(tok("full@pvrs.org"), roleOf).catch(() => null);
  if (!fu || !fu.owner) { fail++; console.log("✗ full access refused"); } else console.log("✓ Full access can use Med Control");
  for (const e of ["admin@pvrs.org", "ivy@pvrs.org", "x@example.com"]) { const r = await _checkCaller(tok(e), roleOf).then(() => "allowed", err => err.code);
    if (r !== "permission-denied") { fail++; console.log(`✗ ${e}: ${r}`); } else console.log(`✓ ${e} is refused`); }
  const un = await _checkCaller({ token: { email: "dkota@pvrs.org", email_verified: false } }).then(() => "allowed", err => err.code);
  if (un !== "unauthenticated") { fail++; console.log("✗ unverified owner email allowed"); } else console.log("✓ an unverified email is refused");
  const { _providerName, DAILY_LIMIT } = require("../functions/medcontrol.js");
  if (DAILY_LIMIT !== 150) { fail++; console.log("✗ daily cap changed: " + DAILY_LIMIT); } else console.log("✓ the daily cap is still 150");
  const prevA = process.env.ANTHROPIC_API_KEY, prevG = process.env.GROQ_API_KEY;
  process.env.ANTHROPIC_API_KEY = "present"; process.env.GROQ_API_KEY = "present";
  if (_providerName() !== "anthropic") { fail++; console.log("✗ Claude is not the default when both keys exist: " + _providerName()); } else console.log("✓ Claude is the provider when both keys exist");
  delete process.env.ANTHROPIC_API_KEY;
  if (_providerName() !== "groq") { fail++; console.log("✗ Groq is not the fallback when Claude is missing"); } else console.log("✓ Groq is used only when the Claude key is absent");
  delete process.env.GROQ_API_KEY;
  if (_providerName() !== "none") { fail++; console.log("✗ a missing key still names a provider"); } else console.log("✓ neither key means no provider");
  if (prevA === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = prevA;
  if (prevG === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = prevG;
  const src = require("fs").readFileSync(require("path").join(__dirname, "../functions/medcontrol.js"), "utf8");
  const logs = src.match(/logger\.(?:error|warn|info|log)\([^;]*\)/g) || [];
  const leaky = logs.filter(line => /\b(message|text|prompt|content|body)\b/.test(line));
  if (leaky.length) { fail++; console.log("✗ a log line can carry prompt or response text: " + leaky.join(" | ")); } else console.log("✓ logs do not take prompt or response text");
  process.exit(fail ? 1 : 0);
})();
