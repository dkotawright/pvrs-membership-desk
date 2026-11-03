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
- `public/js/desk.js`: the staff Desk (roster, tabs: Application, Checks [= Screening + References, merged Oct 21], Interview, Board, Onboard, Notes, Messages; interview slots manager; document requests; portal invite/sync; settings, team, exports, import, owner-only).
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
- Board: committee approval → board vote (motion/second/for/against/abstain, Approved/Tabled/Denied); "Board queue" filter; Board meeting mode (one applicant per screen, vote panel, Copy agenda, Print packet).
- Location is Potsdam or Other (free text). Membership types: Regular, Associate, Auxiliary, Non-Operational, Driver Only, Non-Resident.
- Contact/documents email: membership@pvrs.org. Signature:
  Dkota Wright, NREMT / NYS EMT-B / Potsdam Volunteer Rescue Squad / dkota@pvrs.org
- Online application: public form at `/apply` (link for the squad website); `/` is a public home with Apply / Sign in; `/signin` is sign-in. Submissions go to `submissions` (anyone may create, strict rules; owner-only read) and the owner's desk auto-imports each into an applicant (tagged Online, interview answers prefilled, references + full form in the private record).
- Applicants must never see a rejection: when declined (status declined, committee no, or board denied) the portal's current step reads "with the membership committee… you'll receive a letter", booking closes, nothing else changes. The administrator sends letters.
- Messages: `portal/{id}/messages` (applicant ↔ squad). Applicants write as themselves; only the owner replies; admins can read; members can't.
- Applicants must never see check results, board votes, notes, or other applicants.
- Confidential paperwork (Oct 18): anything medical or Social Security (`isConfidential(label)` in shared.js) goes to Storage `confidential/{appId}/…` + Firestore `vault/{id}`, readable ONLY by **orientationpaperwork@pvrs.org** (not the owner, not admins). Applicants upload via requested medical/SS items or the "Secure document upload" button (renamed Oct 19, deployed); the owner can upload (Upload records → Medical documentation / Social Security card) but can't open them afterwards. The desk only gets a nameless "Private document" placeholder (`confidential: true`, empty path). That account signs in (Google) and lands on `public/js/vault.js` (open, mark filed, delete). Email `PAPERWORK_EMAIL` must match config.js, both rules files and functions/index.js.
- Replacing a reference: owner clicks "Ask for a new one" on the References tab (`refs.rN.replace` = date). The portal gets `refReplace: [N]` and a form; the applicant writes `portal/{id}/refUpdates` (rules only allow slots in refReplace). The owner's desk applies it to `refs.rN` (clears dates/initials, sets `replacedFrom`/`replacedAt`) and marks it `appliedAt`. A reference marked for replacement doesn't count as received.
- Reference forms (Oct 19): References tab → "Email link" / "Copy link" makes `refLinks/{token}` (24-char random code, 60-day expiry; anyone with the exact code can `get` it, nobody can list) and stores `refs.rN.link/linkAt/linkExp`. The reference opens `/ref/{token}` (`public/js/reference.js`, no sign-in), sees "Reference for <applicant>" with the squad's reference-check questions (wording from Dkota's Google Form, personalised with the applicant's first name), and sends ONE response to `refResponses/{token}` (strict rules; owner-only read). The owner's desk files it in `refs.rN.form` (private), marks the reference received, and shows "View answers" (admins can view/print; applicants never see answers). Replacing a reference clears its link and answers.
- "Email all reference forms" (References tab, owner only, Oct 21): a window listing each reference who hasn't answered, with one Open email button per person (each email carries that reference's own private link; app passwords are blocked on pvrs.org, so no server-side sending).
- References: applicants list up to 4; **3 received is enough** (`REFS_NEEDED`/`refStatus()` in shared.js drive the milestone, desk summary, board note/packet and portal; extra unanswered refs show "Not needed" in the portal once 3 are in).
- Sign-in page (Oct 19): welcome panel beside the card — time-of-day greeting, date, Potsdam weather (`public/js/weather.js`: Open-Meteo, no key; NWS active alerts; cached 15 min in sessionStorage; hides itself on failure). Wording: "Squad member" / "Applicant" tabs, "Continue with Google", no first names ("the membership coordinator").
- Email/password accounts (Oct 19): Squad member tab → "Use email and password instead" → Create account (name, email, 10+ char password). `sendEmailVerification` → `#verify` screen polls `user.reload()` and continues once confirmed (fresh ID token) — unconfirmed accounts can't do anything (rules require email_verified). Then the normal access-request form; owner approves in Settings → Team. "Don't have access yet?" offers With Google / With email.
- Desk on phones/narrow windows (≤860px, Oct 21): the sidebar strip is replaced by a floating glass bottom menu `#mnav` (Applicants · Overview · Messages · More; New applicant lives in More since Oct 22). Items mirror the sidebar buttons' visibility (`paintMnav`), More opens a sheet that clicks the hidden sidebar buttons; Overview shows the dashboard (`.app.ovopen`); inside a file the menu slides away for the section bar.
- Sign-in page on phones: greeting → weather → Apply card → sign-in card.
- Email notice: `functions/index.js` (`notifyPaperwork`, Firestore trigger on `vault/{id}`) emails orientationpaperwork@pvrs.org via smtp.gmail.com with no attachment and no file name. Needs secret `SMTP_PASSWORD` (a Google app password for orientationpaperwork@pvrs.org) set by Dkota in Terminal: `firebase functions:secrets:set SMTP_PASSWORD`. Deploy functions separately: `firebase deploy --only functions` (don't run a bare `firebase deploy` until the secret exists).

## IN PROGRESS (Oct 21) — "do it all" batch, deploy after each feature (Dkota's instruction)
Done + deployed: phone bottom menu; (1) Checks tab = Screening + References; (2) phone Actions button in file header.
(3) Reference nudges: deployed (refNudge/remindRefLink; 7 days, once a week; refs.rN.reminded).
(4) Overview "To do": deployed (todoItems/todoCard; data-todo/data-totab/data-todoact — don't use data-tab, it switches tabs).
(5) Interview mode: deployed (enterIvMode/applyIvMode/ivSteps; `.app.ivmode`; sections in question order via style.order from stackCols).
(6+7) Board meeting mode: deployed (#boardBtn → openBoardMtg/paintBoardMtg; list fixed at open; Copy agenda + Print packet live inside it; sidebar agenda/packet buttons removed).
(8) ⌘K palette: deployed (openPalette; word-prefix matching; `/` still filters the list).
(9) Celebrations: deployed (celebrate() from edit() on board approval / stage→act, owner only; milestoneChip in roster; no confetti with reduced motion).
(10) Year at a glance (statsCard: 3 KPIs + applications/month columns, --chart token validated light #0a5fd1 / dark #3d8bfd): deployed Oct 21. ALL 10 DONE. Reviewed Oct 21: fixed tooltip overlap + overview cards squeezed at 700–760px container widths.

## Dashboard layout (Oct 22)
Overview = header (greeting + Board meeting / Search ⌘K buttons) → one stage strip (Screening, Interview, Approval [+board queue count], Onboarding, Active; each filters the list) → `.ovmain`: left To do (+ new messages, access requests), right `.ovcol.ovside` (Coming up, Applicant activity, Year at a glance). Medium panes pair the side cards under To do; phones get one compact stage row. "Waiting longest" and the separate pipeline/tiles were removed (redundant). Don't name classes `side` — `.side` is the sidebar's glass style.

Desktop applicant list (Oct 22): tucks into a thin "Applicants" strip on the left ALWAYS (not only with a file open) unless pinned (`.app:not(.pinned)` rules; pin button at the top of the list, saved per browser). Hover slides it out; choosing a filter adds `.peek` (peekList) until the pointer leaves, a click elsewhere, or 6 s.

## Welcome (Oct 31)
The first portal invite is now a one-step **Welcome** (`inviteToPortal`): portal access + sign-in link, a welcome message posted in `portal/{id}/messages` (`welcomeText`), `private/main.portal.welcomed` = date, and the welcome email (TEMPLATES.portal) opened for that applicant. To do shows "Welcome {first}" at the top as soon as an application with an email lands (any step up to scheduling), replacing the old late "Send the portal invite" item. Later clicks just resend the link (no second message). `openEmail(kind, extra, id)` now takes the applicant id (the To do button used to open the email for whichever file was selected). Not yet deployed: needs `firebase deploy --only hosting`.
Also fixed Oct 31: sign-in weather showed sunrise/sunset shifted for browsers outside Eastern time (Open-Meteo already returns Potsdam local time).

## Clean & calm redesign (Nov 2, branch redesign/clean-calm)
Dkota liked how the app works and asked for a nicer, cleaner, easier look. The three stacked style layers (flat → liquid glass → Friendly Modern) are merged: colours live only in the `:root` tokens at the top of app.css, and the "Clean & calm" section at the end holds the component styles. Light grey `--bg`, white cards with `--border` hairlines, navy `--navy-fill` for primary actions, `--red-fill` only for warnings/Delete, stage colours as dots, Inter. Public pages (sign-in, home, apply) use the same ground with a navy `--brand-card` welcome card; the animated EMS backdrop is gone. File tabs (`.tabdock`) now live inside `.dhead` under the name; on phones (≤860px) they float at the bottom, and `.detail` drops `container-type` there because a fixed bar inside a size container blanked the screen in Chromium after a tab switch.

## Status Nov 2
- The Oct 31 batch, Friendly Modern look and Med Control are merged into `main` (PRs #7, #8). The auto-deploys of both failed at the functions step: the `github-deploy` account lacks **Service Account User** on `pvrs-membership@appspot.gserviceaccount.com` (`iam.serviceAccounts.ActAs`). PR #9 deploys hosting + rules before the function so the site goes live regardless; the fix for Med Control is in docs/auto-deploy.md (Dkota grants the role in the Cloud console, then re-runs the job).
- Old open PRs #1–#6 (Oct 19–26: isolated testing, UI polish, Homey redesign, duty schedule, Slack, sign-in wallpaper) predate the Friendly Modern look and conflict with `main`. Left open, not merged, pending Dkota's decision on which features to rebuild on the current design.

## Oct 31 batch (merged to main Nov 1–2; see Status Nov 2)
Dkota asked for everything from the suggestion list except the monthly board report. Each is its own commit:
- **How did you hear about PVRS?** optional on /apply step 1 (`HEARD` in shared.js) → submission `heard{source,detail}` (rules updated) → `app.heard/heardDetail` (Application tab select) → bar chart in Year at a glance (`.hchart`).
- **Interview prep** in the portal under the Interview card (`ivPrepHTML`, portal.js), hidden once the interview is done.
- **Saved replies**: chips above the Messages reply box (`{first}` substituted); `settings.replies` edited in Settings (defaults `DEFAULT_REPLIES`).
- **New-member checklist** (Onboard tab, `onb.items.<key>` private; list = `settings.onbItems`, defaults `DEFAULT_ONB`) + **expiration dates** (`dl.expires`, `onb.cprExpires`, `onb.emtExpires`); To do warns 30 days out and tracks the checklist for a year after approval. `onb` added to SECURE.
- **Data retention**: `settings.retentionYears`; To do + review window (`openRetention`) for declined/withdrawn files untouched that long; owner ticks and confirms; nothing automatic.
- **Two-step sign-in** (TOTP): key button / ⌘K → `openTwoStep`; sign-in `askCode` in main.js for password + Google. No QR library (vendoring was declined): setup key + otpauth "Open in app" link. Project must be upgraded to Identity Platform and TOTP enabled first (docs/two-step-sign-in.md).
- **Push notifications**: built Oct 31 and REMOVED Nov 2 at Dkota's request (its test failed in GitHub's headless browser, and he chose to drop the feature for now). The code is in git history (commit 824d4cf) if it comes back.
- **Auto-deploy**: `.github/workflows/deploy.yml` (browser + privacy tests gate deploy of hosting + firestore:rules + storage + functions:ai; rules tests informational). Needs repo secret FIREBASE_SERVICE_ACCOUNT and Secret Manager ANTHROPIC_API_KEY, all set up in the browser (docs/auto-deploy.md). Nov 1: Dkota works only through cloud sessions; there is NO local copy on his computer (POTVOL-PC4), so deploys go through GitHub Actions, not Terminal.
- **Restore drill**: docs/restore-drill.md (Cloud Shell, restore into temp db `restore-drill`, check, delete).
- Known: 2 storage rules tests (confidential upload) fail in the emulator, pre-existing on abb445f too; suggested as a separate task.
- Tests: 153 browser checks; rules 49 pass / 2 known fails. In cloud containers run browser tests with `PW_CHROME=/opt/pw-browsers/chromium`.
- Dkota said (Oct 31) the design "is good but throws me off" — wants fun but professional, plus more features and AI. Pending his pick of direction.

## Oct 31 (later): Friendly Modern look + Med Control AI (merged to main Nov 1)
- **Look:** Dkota picked mockup "C · Friendly Modern" (design canvas https://claude.ai/artifact/8aocYnGxuELmb4sR2eQj8B). Implemented as the last layer of app.css (token overrides + navy greeting banner `.ovhead`, pastel `.stg` tiles, tinted `.av`). Plus Jakarta Sans from Google Fonts (index.html). Sign-in/home/apply (`.gate`) keep the dark EMS backdrop for now. Light + dark both done.
- **Med Control** = the AI's name (Dkota's pick; EMS "medical control"). `functions/medcontrol.js` callable `ai-medControl` (export group `ai`; deploy `firebase deploy --only functions:ai`; secret ANTHROPIC_API_KEY). Jobs: chat (claude-haiku-5-5, effort low, roster in a cached system block + desk hints), brief (claude-sonnet-5-5, json_schema output, `fallbacks: "default"`; saved to private/main.ai.brief, owner only), reply (claude-haiku-5-5). Owner + admins only; 150 calls/person/day (`aiUsage/{email}_{day}`, no client rule = no client access). `safeApplicant()` is the privacy filter; `tests/medcontrol-privacy.test.cjs` guards it.
- Desk: hidden unless `settings.ai === true` (Settings → Med Control). Sidebar `#aiBtn` → `openMedControl` (chat modal, answers linkify applicant names, Copy / Open in Mail for "Subject:" drafts); Board tab "Med Control brief" (`briefHTML`, `[data-aibrief]`); Messages chip `[data-aireply]` → `aiDraftReply` fills the box only. Functions SDK is lazy-imported (`FN_URL`).
- Dkota's model choice: the mix (Haiku chat/replies, Sonnet briefs), ~$1–3/mo. Setup in docs/med-control.md (needs board OK, Anthropic account, key as secret).
- Tests: 165 browser checks.

## Stability review (Oct 22)
Full check: 118 browser checks, 49 rules tests, live public pages clean, live rules == local. Fixed: replacement references and reference answers are now claimed in a transaction (`claimOnce`) before the owner's desk applies them — an out-of-date open desk could otherwise redo a swap and wipe the new reference's link/answers. Every automatic owner-desk action now claims first (submissions, refUpdates, refResponses).

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
- [x] Oct 19: 3-of-4 references + sign-in redesign (greeting, weather): deployed (hosting only; no rules changes).
- [x] Oct 19: Apply made prominent (featured card on sign-in + home, red Apply pill): deployed.
- [x] Oct 19: email/password sign-up (confirm email → request access) + phone sign-in order: deployed.
- [x] Oct 19: duplicate-import fix (online applications are claimed in a Firestore transaction, so several open desks can't import one application twice): deployed.
- [x] Oct 21: New applicant fix (duplicate form id) + Email all reference forms: deployed. Chelsea Blain's application added as a submission (from her PDF, at Dkota's request).
- [ ] Server-side email: Google app passwords are NOT available on Dkota's pvrs.org account, so functions/ (paperwork notices) can't use Gmail SMTP. Options: Workspace admin enables app passwords, or an email API (needs DNS on pvrs.org).
- [ ] Email alerts for uploads/bookings: the function + SMTP setup now exists for confidential paperwork; other alerts not built.
- Testing: see `tests/README.md`. Tests live in the repo (`tests/`) since Oct 19 — the old scratchpad copies were wiped by macOS. `node tests/browser.test.mjs` (Playwright + `tests/mockfb.js`) and `tests/run-rules.sh` (emulators; Java in ~/.local/jdk21).
- [x] GitHub Actions auto-deploy: set up Nov 1 (docs/auto-deploy.md). Functions step still needs the Service Account User grant (see Status Nov 2).
- [ ] After deploy: sign in at https://pvrs-membership.web.app as dkota@pvrs.org (Google), Settings → Import records → `migration/artifact-export.json`; set signature + default interview location; add team members.
- [ ] Test end to end with a personal email as a fake applicant (invite, upload, book), then delete it.
- [ ] Later: add dkota@pvrs.org as project Owner (Project settings → Users and permissions); get board/chief OK before real applicant data.

## Testing notes
- The UI was tested in headless Chromium against an in-memory Firebase mock (owner, applicant, member, unknown-user flows all passed). Rules were not run in the emulator, so verify with the console Rules Playground or `firebase emulators:start` if you change them.
