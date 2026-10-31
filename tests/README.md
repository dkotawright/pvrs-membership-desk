# Tests

Not part of the website (only `public/` is deployed). Uses made-up test data only.

- `npm install` (in this folder, once)
- Browser tests: `node tests/browser.test.mjs` from the project folder. Uses `tests/mockfb.js`, an in-memory stand-in for Firebase, so nothing touches the real database. Screenshots land in `tests/shots/`.
- Security-rule tests: `tests/run-rules.sh`. Runs `rules.test.mjs` in the Firebase emulators; needs Java (a copy lives in `~/.local/jdk21`). If only the Storage upload tests fail with `storage/unauthorized`, check for an `HTTPS_PROXY` setting: firebase-tools sends the Storage emulator's Firestore lookups through it (ignoring `NO_PROXY`), so they fail behind a proxy. The rules themselves are fine.
- Live check of the public pages (read-only, submits nothing): `node tests/live-smoke.mjs`.
