# PVRS Membership Desk: handoff notes for Claude

Read this first. It's the full context from the original build conversation (Oct 16, 2026).

## Who / what
- Owner: **Dkota Wright** (dkota@pvrs.org), NYS/NREMT EMT-B. He runs membership interviews and onboarding for **Potsdam Volunteer Rescue Squad (PVRS)**, Potsdam NY.
- He prefers short, direct, step-by-step instructions, one step at a time. He's on a **Mac**, not a developer; explain commands plainly.
- The app replaces PVRS's paper/Google Form process: Application Checklist (2015), Background Check sheet, and the Google Form "PVRS Interview Form" (36 questions).

## Architecture (static site, no build step)
- Firebase project ID: **pvrs-membership** (on the **Blaze** plan, $1 budget alert). Project is owned by Dkota's *personal* Google account for now; plan is to add dkota@pvrs.org as Owner later.
- Hosting: Firebase Hosting (`public/`). SDK v10.12.2 loaded from gstatic CDN as ES modules; no npm/bundler.
- Auth: Email link (passwordless) + Google. Owner hardcoded as `dkota@pvrs.org` in `public/js/config.js`, `firestore.rules`, `storage.rules`.
- Roles: owner (everything incl. Settings behind PIN 0508, hashed in config.js), `staff/{email}` docs with role `admin` (everything but Settings) or `member` (Application + Interview tabs only), applicants (own portal only, matched by `portal/{id}.email`).

## Files
- `public/js/main.js`: sign-in and routing (owner → admin desk; staff doc → desk; portal match → applicant portal; else "No application found").
- `public/js/desk.js`: the staff Desk (roster, tabs: Application, Screening, Interview, Board, Onboard, Notes; interview slots manager; document requests; portal invite/sync; settings, team, exports, import, PIN gate).
- `public/js/portal.js`: applicant portal (status timeline, document uploads to Storage, interview booking via batch writes) + `portalHTML()` reused for the admin preview.
- `public/js/shared.js`: helpers, `MILESTONES` (14-step checklist), `STAGES`, `applicantSteps()` (6 applicant-safe steps), `SECURE` field roots.
- `firestore.rules` / `storage.rules`: all access control. Keep the owner email in sync across the 3 files.
- `migration/artifact-export.json`: 1 real record (Georgia Thurmond) from the earlier Claude-artifact version; import via Settings → Import records.

## Data model
- `applicants/{id}`: shared fields (name, phone, email, type, location, app.*, sched.*, iv.* interview answers, stage mirror, updatedAt/By).
- `applicants/{id}/private/main`: admin-only (mvr, dl, refs, bg [Sterling], appr, board, notify [incl. probation], notes, status, docs.requested, portal.invited/bookingOpen).
- `portal/{id}`: what the applicant sees (email lowercase, name, firstName, type, steps[], docs[], bookingOpen, interview{slotId,start,duration,location}). Written by admin clients (`syncPortal`); applicant may only change `interview`.
- `portal/{id}/files/{fileId}` + Storage `uploads/{id}/…`: applicant uploads (PDF/image ≤15 MB).
- `slots/{id}`: interview times {start ms, duration, location, bookedBy}. Applicants book/cancel ≥24 h ahead only if `bookingOpen`.
- `settings/main`: signature, docsEmail, defaultLocation. `staff/{email}`: role, name.

## PVRS process decisions (from Dkota)
- Background check is **Sterling Volunteers only** (no separate NYS registry step).
- Driver's license check is a required step (never store the license number).
- Probation starts after board approval, is **reviewed every 3 months**, and ends when the board approves full membership.
- Board: committee approval → board vote (motion/second/for/against/abstain, Approved/Tabled/Denied); "Board queue" filter + copy agenda.
- Location is Potsdam or Other (free text). Membership types: Regular, Associate, Auxiliary, Non-Operational, Driver Only, Non-Resident.
- Contact/documents email: membership@pvrs.org. Signature:
  Dkota Wright, NREMT / NYS EMT-B / Potsdam Volunteer Rescue Squad / dkota@pvrs.org
- Applicants must never see check results, board votes, notes, or other applicants.

## Setup status (as of Oct 16, 2026, evening)
- [x] Firebase project created (pvrs-membership), web app registered, config in `public/js/config.js`, `.firebaserc` set.
- [x] Blaze plan enabled.
- [x] Authentication: Email/Password + Email link + Google enabled; public-facing name set.
- [x] Firestore (nam5, production) and Storage (US-EAST1, production) created.
- [x] **Deployed** Oct 16, 2026 (firebase-tools 15.34.0 in ~/.npm-global; logged in as dkota@pvrs.org). Redeploy: `firebase deploy` from this folder.
- [x] **Mac redesign deployed Oct 18, 2026.** Sidebar + list + file layout, overview dashboard, keyboard shortcuts (⌘K, J/K, N, 1–6, [ ], E, ?), sort, header quick actions, modal focus/inert handling, PIN-listener leak fixed, `sched.completed` now counts as scheduled. Deploy with `firebase deploy` once Dkota OKs it.
- [x] Version history: local git repo (Oct 18). `migration/` is git-ignored because it holds real applicant data. No GitHub remote yet.
- [x] Firestore backups: daily (14-day retention, created Oct 18) + weekly Sunday (98-day retention, pre-existing).
- [ ] **Oct 18 feature batch: built + tested, awaiting deploy** (`firebase deploy --only hosting,firestore:rules`): change history (applicants/{id}/history, append-only, admin-read), auto sign-out (settings.idleMinutes, default 30, shared across tabs), .ics calendar files (staff + applicant portal; interview.bookedAt), printable board packet, admin activity feed (collectionGroup files), Add to Dock manifest/icons, no-cache HTML.
- [ ] Email alerts for uploads/bookings: needs a Cloud Function + an SMTP sender (decision pending with Dkota).
- Testing: rules are tested in the emulator with @firebase/rules-unit-testing (needs a JDK; none is installed system-wide, so use a portable one). UI is tested with Playwright against an in-memory Firebase mock.
- [ ] Optional: GitHub repo `pvrs-membership-desk` (private) + GitHub Actions auto-deploy with a service-account key, so Claude can update the app on demand.
- [ ] After deploy: sign in at https://pvrs-membership.web.app as dkota@pvrs.org (Google), Settings (PIN 0508) → Import records → `migration/artifact-export.json`; set signature + default interview location; add team members.
- [ ] Test end to end with a personal email as a fake applicant (invite, upload, book), then delete it.
- [ ] Later: add dkota@pvrs.org as project Owner (Project settings → Users and permissions); get board/chief OK before real applicant data.

## Testing notes
- The UI was tested in headless Chromium against an in-memory Firebase mock (owner, applicant, member, unknown-user flows all passed). Rules were not run in the emulator, so verify with the console Rules Playground or `firebase emulators:start` if you change them.
- PIN hashing uses `crypto.subtle`, so it needs https or localhost.
