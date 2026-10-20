# PVRS Membership Desk: handoff notes for Claude

Read this first. It's the full context from the original build conversation (Oct 16, 2026).

## Who / what
- Owner: **Dkota Wright** (dkota@pvrs.org), NYS/NREMT EMT-B. He runs membership interviews and onboarding for **Potsdam Volunteer Rescue Squad (PVRS)**, Potsdam NY.
- He prefers short, direct, step-by-step instructions, one step at a time. He's on a **Mac**, not a developer; explain commands plainly.
- The app replaces PVRS's paper/Google Form process: Application Checklist (2015), Background Check sheet, and the Google Form "PVRS Interview Form" (36 questions).

## Architecture (static site, no build step)
- Firebase project ID: **pvrs-membership** (on the **Blaze** plan, $1 budget alert). Project is owned by Dkota's *personal* Google account for now; plan is to add dkota@pvrs.org as Owner later.
- Hosting: Firebase Hosting (`public/`). SDK v10.12.2 loaded from gstatic CDN as ES modules; no npm/bundler.
- Auth: staff sign in with email + password (set in-app via the key button next to their name, which links a password credential to their account; Google stays as a backup). Applicants use the email link. Passwords are never stored in code. Owner hardcoded as `dkota@pvrs.org` in `public/js/config.js`, `firestore.rules`, `storage.rules`.
- Team access requests: anyone can sign in with Google (Staff tab → "Request access") and file `accessRequests/{email}` (pending). The owner approves (creates `staff/{email}`) or denies in Settings → Team; the requester's page opens the desk once approved.
- Roles: **only the owner (dkota@pvrs.org) edits anything.** `staff/{email}` admins can view every tab and members the Application + Interview tabs, but both can only fill in the interview questionnaire (`iv.*`), `sched.completed`/`completedInit` and the Interview page sign-off (`signoff.iv`). Enforced in firestore.rules (`interviewOnly()`), storage.rules and in the UI (`S.canEdit`, `canEditPath`). Only the owner's client writes portal docs and mirrors `stage`. Applicants see their own portal only (matched by `portal/{id}.email`).

## Files
- `public/js/main.js`: sign-in and routing (owner → admin desk; staff doc → desk; portal match → applicant portal; else "No application found").
- `public/js/desk.js`: the staff Desk (roster, tabs: Application, Screening, Interview, Board, Onboard, Notes; interview slots manager; document requests; portal invite/sync; settings, team, exports, import, owner-only).
- `public/js/portal.js`: applicant portal (status timeline, document uploads to Storage, interview booking via batch writes) + `portalHTML()` reused for the admin preview.
- `public/js/shared.js`: helpers, `MILESTONES` (14-step checklist), `STAGES`, `applicantSteps()` (6 applicant-safe steps), `SECURE` field roots.
- `firestore.rules` / `storage.rules`: all access control. Keep the owner email in sync across the 3 files.
- `migration/artifact-export.json`: 1 real record (Georgia Thurmond) from the earlier Claude-artifact version; import via Settings → Import records.

## Data model
- `applicants/{id}`: shared fields (name, phone, email, type, location, app.*, sched.*, iv.* interview answers, stage mirror, updatedAt/By).
- `applicants/{id}/private/main`: admin-only (mvr, dl, refs, bg [Sterling], appr, board, notify [incl. probation], notes, status, docs.requested, portal.invited/bookingOpen).
- `portal/{id}`: what the applicant sees (email lowercase, name, firstName, type, steps[], docs[], bookingOpen, interview{slotId,start,duration,location}). Written by admin clients (`syncPortal`); applicant may only change `interview`.
- `applicants/{id}/records/{recordId}` + Storage `records/{id}/…`: staff-only records the owner uploads (PDF/image ≤25 MB, labelled). Admins (e.g. the squad administrator) can open/print; members and applicants cannot see them.
- `portal/{id}/files/{fileId}` + Storage `uploads/{id}/…`: applicant uploads (PDF/image ≤15 MB).
- `portalEmails/{email}` → {id}: kept in sync with `portal` docs by the owner's desk; lets rules recognise invited applicants. `slots` are readable only by staff and invited applicants.
- `slots/{id}`: interview times {start ms, duration, location, bookedBy}. Applicants book/cancel ≥24 h ahead only if `bookingOpen`.
- `settings/main`: signature, docsEmail, defaultLocation. `staff/{email}`: role, name.

## PVRS process decisions (from Dkota)
- Background check is **Sterling Volunteers only** (no separate NYS registry step), and it is run **only after board approval** (milestone after "Board approval"; fields on the Onboard tab; not in the board packet).
- Applications go to the board only once references and all other prerequisites are complete. References: names + received status are shown to the applicant; reference contact is email (no phone numbers collected).
- Driver's license check is a required step. The online application requires the license state + number (no "no license" option) and 3–4 references (Dkota is authorized to run the check); it lives only in the private record (`private/main.form.person.dlNumber`), shown on the Screening tab to admins. Never in the portal, board packet or member views.
- Probation is handled by the general membership, not this app (probation tracking removed Oct 18).
- Board: committee approval → board vote (motion/second/for/against/abstain, Approved/Tabled/Denied); "Board queue" filter + copy agenda.
- Location is Potsdam or Other (free text). Membership types: Regular, Associate, Auxiliary, Non-Operational, Driver Only, Non-Resident.
- Contact/documents email: membership@pvrs.org. Signature:
  Dkota Wright, NREMT / NYS EMT-B / Potsdam Volunteer Rescue Squad / dkota@pvrs.org
- Online application: public form at `/apply` (link for the squad website); `/` is a public home with Apply / Sign in; `/signin` is sign-in. Submissions go to `submissions` (anyone may create, strict rules; owner-only read) and the owner's desk auto-imports each into an applicant (tagged Online, interview answers prefilled, references + full form in the private record).
- Applicants must never see a rejection: when declined (status declined, committee no, or board denied) the portal's current step reads "with the membership committee… you'll receive a letter", booking closes, nothing else changes. The administrator sends letters.
- Messages: `portal/{id}/messages` (applicant ↔ squad). Applicants write as themselves; only the owner replies; admins can read; members can't.
- Applicants must never see check results, board votes, notes, or other applicants.
- Confidential paperwork (Oct 18): anything medical or Social Security (`isConfidential(label)` in shared.js) goes to Storage `confidential/{appId}/…` + Firestore `vault/{id}`, readable ONLY by **orientationpaperwork@pvrs.org** (not the owner, not admins). Applicants upload via requested medical/SS items or the "Send medical or Social Security paperwork" button; the owner can upload (Upload records → Medical documentation / Social Security card) but can't open them afterwards. The desk only gets a nameless "Private document" placeholder (`confidential: true`, empty path). That account signs in (Google) and lands on `public/js/vault.js` (open, mark filed, delete). Email `PAPERWORK_EMAIL` must match config.js, both rules files and functions/index.js.
- Replacing a reference: owner clicks "Ask for a new one" on the References tab (`refs.rN.replace` = date). The portal gets `refReplace: [N]` and a form; the applicant writes `portal/{id}/refUpdates` (rules only allow slots in refReplace). The owner's desk applies it to `refs.rN` (clears dates/initials, sets `replacedFrom`/`replacedAt`) and marks it `appliedAt`. A reference marked for replacement doesn't count as received.
- Reference forms (Oct 19): References tab → "Email link" / "Copy link" makes `refLinks/{token}` (24-char random code, 60-day expiry; anyone with the exact code can `get` it, nobody can list) and stores `refs.rN.link/linkAt/linkExp`. The reference opens `/ref/{token}` (`public/js/reference.js`, no sign-in), sees "Reference for <applicant>" with the squad's reference-check questions (wording from Dkota's Google Form, personalised with the applicant's first name), and sends ONE response to `refResponses/{token}` (strict rules; owner-only read). The owner's desk files it in `refs.rN.form` (private), marks the reference received, and shows "View answers" (admins can view/print; applicants never see answers). Replacing a reference clears its link and answers.
- References: applicants list up to 4; **3 received is enough** (`REFS_NEEDED`/`refStatus()` in shared.js drive the milestone, desk summary, board note/packet and portal; extra unanswered refs show "Not needed" in the portal once 3 are in).
- Sign-in page (Oct 19): welcome panel beside the card — time-of-day greeting, date, Potsdam weather (`public/js/weather.js`: Open-Meteo, no key; NWS active alerts; cached 15 min in sessionStorage; hides itself on failure). Wording: "Squad member" / "Applicant" tabs, "Continue with Google", no first names ("the membership coordinator").
- Email notice: `functions/index.js` (`notifyPaperwork`, Firestore trigger on `vault/{id}`) emails orientationpaperwork@pvrs.org via smtp.gmail.com with no attachment and no file name. Needs secret `SMTP_PASSWORD` (a Google app password for orientationpaperwork@pvrs.org) set by Dkota in Terminal: `firebase functions:secrets:set SMTP_PASSWORD`. Deploy functions separately: `firebase deploy --only functions` (don't run a bare `firebase deploy` until the secret exists).

## Setup status (as of Oct 16, 2026, evening)
- [x] Firebase project created (pvrs-membership), web app registered, config in `public/js/config.js`, `.firebaserc` set.
- [x] Blaze plan enabled.
- [x] Authentication: Email/Password + Email link + Google enabled; public-facing name set.
- [x] Firestore (nam5, production) and Storage (US-EAST1, production) created.
- [x] **Deployed** Oct 16, 2026 (firebase-tools 15.34.0 in ~/.npm-global; logged in as dkota@pvrs.org). Redeploy: `firebase deploy` from this folder.
- [x] **Mac redesign deployed Oct 18, 2026.** Sidebar + list + file layout, overview dashboard, keyboard shortcuts (⌘K, J/K, N, 1–6, [ ], E, ?), sort, header quick actions, modal focus/inert handling, PIN-listener leak fixed, `sched.completed` now counts as scheduled. Deploy with `firebase deploy` once Dkota OKs it.
- [x] Version history: local git repo (Oct 18). `migration/` is git-ignored because it holds real applicant data. Pushed to a PRIVATE GitHub repo: https://github.com/dkotawright/pvrs-membership-desk (origin, branch main; gh CLI at ~/.local/bin/gh, logged in as dkotawright). Push after each commit with `git push`.
- [x] Firestore backups: daily (14-day retention, created Oct 18) + weekly Sunday (98-day retention, pre-existing).
- [x] **Oct 18 feature batch + liquid-glass look: deployed Oct 18**: change history (applicants/{id}/history, append-only, admin-read), auto sign-out (settings.idleMinutes, default 30, shared across tabs), .ics calendar files (staff + applicant portal; interview.bookedAt), printable board packet, admin activity feed (collectionGroup files), Add to Dock manifest/icons, no-cache HTML.
- [x] Oct 18 (later): password sign-in, owner-only editing (rules deployed), page sign-offs, references tab, tuck-away list, compact tab bar: all deployed. Dkota still needs to set his password via the key button.
- [x] Oct 18 (evening): access requests, staff records, messaging, hidden declines, sign-in redesign, interview-times lockdown: deployed. After deploy the owner must open the desk once so portalEmails backfills for already-invited applicants.
- [x] Oct 18 (night): online application + home page, license number, probation removed, confidential paperwork vault, owner-only header Delete: deployed (hosting, firestore + storage rules). NOT yet deployed: functions (waiting on Dkota to set SMTP_PASSWORD).
- [x] Oct 19: reference forms (/ref/{code}) + fade-in flicker fix: deployed (hosting + firestore rules).
- [ ] Email alerts for uploads/bookings: the function + SMTP setup now exists for confidential paperwork; other alerts not built.
- Testing: see `tests/README.md`. Tests live in the repo (`tests/`) since Oct 19 — the old scratchpad copies were wiped by macOS. `node tests/browser.test.mjs` (Playwright + `tests/mockfb.js`) and `tests/run-rules.sh` (emulators; Java in ~/.local/jdk21).
- [ ] Optional: GitHub Actions auto-deploy (repo exists) with a service-account key, so Claude can update the app on demand.
- [ ] After deploy: sign in at https://pvrs-membership.web.app as dkota@pvrs.org (Google), Settings → Import records → `migration/artifact-export.json`; set signature + default interview location; add team members.
- [ ] Test end to end with a personal email as a fake applicant (invite, upload, book), then delete it.
- [ ] Later: add dkota@pvrs.org as project Owner (Project settings → Users and permissions); get board/chief OK before real applicant data.

## Testing notes
- The UI was tested in headless Chromium against an in-memory Firebase mock (owner, applicant, member, unknown-user flows all passed). Rules were not run in the emulator, so verify with the console Rules Playground or `firebase emulators:start` if you change them.
