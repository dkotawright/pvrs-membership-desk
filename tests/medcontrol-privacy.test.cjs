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
process.exit(fail ? 1 : 0);
