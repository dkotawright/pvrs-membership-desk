# Tests

Not part of the website (only `public/` is deployed). Uses made-up test data only.

- `npm install` (in this folder, once)
- Browser tests: `node tests/browser.test.mjs` from the project folder. Uses `tests/mockfb.js`, an in-memory stand-in for Firebase, so nothing touches the real database. Screenshots land in `tests/shots/`.
- Security-rule tests: `tests/run-rules.sh`. Runs `rules.test.mjs` in the Firebase emulators; needs Java (a copy lives in `~/.local/jdk21`).
- Live check of the public pages (read-only, submits nothing): `node tests/live-smoke.mjs`.
- No Chromium where Playwright expects it (e.g. a cloud container)? Point at one: `PW_CHROME=/path/to/chrome node tests/browser.test.mjs` (also works for `shoot-pages.mjs` and `shoot.mjs`).
- One-off screenshot of any page against the mock: `node tests/shoot.mjs <url> <name> [width] [owner|none|email] [js to run first]`.
- GitHub Actions runs the browser tests (and the rules tests, informational) on every push to main before deploying; see `docs/auto-deploy.md`.
