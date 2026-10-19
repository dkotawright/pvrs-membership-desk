import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { environmentForHost } from "../public/js/environment.js";

const source = (await readFile(new URL("../public/js/config.js", import.meta.url), "utf8"))
  .replace(/^import .*;\n/m, "").replaceAll("export const ", "const ");

function configFor(hostname) {
  const context = { environmentForHost, location: { hostname } };
  return vm.runInNewContext(source + "; ({ environment, firebaseConfig });", context);
}

test("only approved live domains select production", () => {
  for (const host of ["pvrs-membership.web.app", "pvrs-membership.firebaseapp.com"])
    assert.equal(configFor(host).firebaseConfig.projectId, "pvrs-membership");
});

test("test site and PR previews select the isolated test project", () => {
  for (const host of ["pvrs-membership-test.web.app", "pvrs-membership-test.firebaseapp.com", "pvrs-membership-test--pr-12-abc123.web.app"])
    assert.equal(configFor(host).firebaseConfig.projectId, "pvrs-membership-test");
});

test("local development selects a demo project", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"])
    assert.equal(configFor(host).firebaseConfig.projectId, "demo-pvrs-membership");
});

test("unknown and production preview domains cannot initialize Firebase", () => {
  for (const host of ["example.org", "pvrs-membership--pr-12-abc123.web.app", "pvrs-membership-test.web.app.example.org", "pvrs-membership-test--pr-12.web.app.example.org", ""])
    assert.throws(() => configFor(host), /no approved Firebase environment/);
});
