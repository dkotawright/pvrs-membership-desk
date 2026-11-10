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
- Roles: **only the owner (dkota@pvrs.org) edits anything.** `staff/{email}` admins can view every tab and interviewers the Application + Interview tabs of applicants assigned to them (members: no files since Nov 3; see Interviewer role), but they can only fill in the interview questionnaire (`iv.*`), `sched.completed`/`completedInit` and the Interview page sign-off (`signoff.iv`). Enforced in firestore.rules (`interviewOnly()`), storage.rules and in the UI (`S.canEdit`, `canEditPath`). Only the owner's client writes portal docs and mirrors `stage`. Applicants see their own portal only (matched by `portal/{id}.email`).

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
- Orientation never starts before Sterling is complete and clear (Dkota, Nov 4).
- Applicants must never see check results, board votes, notes, or other applicants.
- Confidential paperwork (Oct 18): anything medical or Social Security (`isConfidential(label)` in shared.js) goes to Storage `confidential/{appId}/…` + Firestore `vault/{id}`, readable ONLY by **orientationpaperwork@pvrs.org** (not the owner, not admins). Applicants upload via requested medical/SS items or the "Secure document upload" button (renamed Oct 19, deployed); the owner can upload (Upload records → Medical documentation / Social Security card) but can't open them afterwards. The desk only gets a nameless "Private document" placeholder (`confidential: true`, empty path). That account signs in (Google) and lands on `public/js/vault.js` (open, mark filed, delete). Email `PAPERWORK_EMAIL` must match config.js, both rules files and functions/index.js.
- Replacing a reference: owner clicks "Ask for a new one" on the References tab (`refs.rN.replace` = date). The portal gets `refReplace: [N]` and a form; the applicant writes `portal/{id}/refUpdates` (rules only allow slots in refReplace). The owner's desk applies it to `refs.rN` (clears dates/initials, sets `replacedFrom`/`replacedAt`) and marks it `appliedAt`. A reference marked for replacement doesn't count as received.
- Reference forms (Oct 19): References tab → "Email link" / "Copy link" makes `refLinks/{token}` (24-char random code, 60-day expiry; anyone with the exact code can `get` it, nobody can list) and stores `refs.rN.link/linkAt/linkExp`. The reference opens `/ref/{token}` (`public/js/reference.js`, no sign-in), sees "Reference for <applicant>" with the squad's reference-check questions (wording from Dkota's Google Form, personalised with the applicant's first name), and sends ONE response to `refResponses/{token}` (strict rules; owner-only read). The owner's desk files it in `refs.rN.form` (private), marks the reference received, and shows "View answers" (admins can view/print; applicants never see answers). Replacing a reference clears its link and answers.
- "Email all reference forms" (References tab, owner only, Oct 21): a window listing each reference who hasn't answered, with one Open email button per person (each email carries that reference's own private link; app passwords are blocked on pvrs.org, so no server-side sending).
- References: applicants list up to 4; **3 received is enough** (`REFS_NEEDED`/`refStatus()` in shared.js drive the milestone, desk summary, board note/packet and portal; extra unanswered refs show "Not needed" in the portal once 3 are in).
- Sign-in page (Oct 19): welcome panel beside the card — time-of-day greeting, date, Potsdam weather (`public/js/weather.js`: Open-Meteo, no key; NWS active alerts; cached 15 min in sessionStorage; hides itself on failure). Wording (tabs removed Nov 4; one sign-in for everyone): "Continue with Google", no first names ("the membership coordinator").
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

## Clean & calm redesign: rejected (Nov 2)
A flat grey/white/navy restyle (PR #10) went live and was reverted the same evening: Dkota found it plain, boring, boxy, ugly colours. Next design must be picked from mockups BEFORE any code changes. The Friendly Modern look is back. The test local-date fix from that branch stays.

## Aurora look + funnel + Email the board (Nov 3)
- **Aurora** (Dkota approved from screenshots): last section of app.css on top of Friendly Modern. Colour-glow background (`--au-*`), navy gradient sidebar (`--side-a/b`), frosted cards (`--frost*`, `--soft`), gradient stage tiles (`--g-*`), gradient headline, coral gradient primary buttons. Public pages (sign-in/home/apply) use the same glow and a navy gradient welcome card; `.ems-bg` hidden.
- **Funnel** in Year at a glance (`funnelHTML`, `statsData().funnel`): this year's applications reaching Applied → References in → Interviewed → Board approved → Active (milestones 0/4/6/8/all), plus declined/withdrew counts.
- **Email the board** (Board meeting toolbar, `emailBoard`): mailto to `settings.boardEmails` (Settings → Emails) with the meeting's agenda (`agendaText(list)`); the packet PDF is attached by hand (Print packet → Save as PDF) until server email exists.
- Dkota's wish list still open: Med Control (needs the IAM grant), Slack/email alerts (Slack webhook or pvrs.org email service), text reminders (Twilio, needs his OK on cost), duty schedule (needs who/which shifts).

## Nov 3 batch (features that needed nothing from Dkota)
- **Go to it**: button next to "Next: …" in the file header (`goNextStep`, `STEP_FIELD`) opens the step's tab and focuses its field (step 5 opens booking). Also a To do action (`nextgo`).
- **Interview score**: Interview tab group, `iv.score.{comm,motiv,avail,team,fit}` 1–5 (`IV_SCORE`, `ivScore`, `ivScoreText`); average in Board meeting mode and the board packet (flagged under 3).
- **To do**: "No movement in N days" (14+ days since `lastTouched`, not while waiting for the board); "Pair X with a mentor" / "Mentor check-in" (Onboard tab: `onb.mentor`, `onb.mentorSince`, `onb.mentorCheck`, `onb.mentorNotes`; monthly); membership anniversaries in the next 7 days.
- **Portal**: "Step X of Y" tracker above the timeline (`trackerHTML`) and an interview-within-2-days banner with Add to calendar (`ivSoonHTML`).
- **Recruiting flyer** (`printFlyer`, Year at a glance button / ⌘K): QR code from `public/js/qr.js` (own encoder, byte mode, level M, v1–6; verified with OpenCV) linking to `/apply?src=flyer`, which pre-picks "Flyer or poster".
- **Year-end report** (`printYearReport`): KPIs, funnel, months, sources, printable.
- Tests: 174 browser checks.

## Print the original application (Nov 3, branch feature/print-application, not yet in a PR)
- Application tab group **Original application** (`renderOriginal`, called from `renderRecords`) replaces the old hidden "Online application" row and shows for every file (admins): online form → View / Print; records labelled "Application" → "Paper copy · Open to print"; neither → "No original on file". Owner-only **Upload original** button on the group header for every file (online applicants can have a paper copy too; `openUploadRecords(id, "Application")` pre-picks the label).
- File header **Application** button (`data-act="printapp"`, also in the phone Actions sheet) and ⌘K "Print application" → `printOriginal(id)`: prints the online form, else opens the newest paper copy in a new tab (opened during the click so Safari allows it; ⌘P there). Nothing is ever deleted; this only reads the stored `private/main.form` and records.
- Tests: 181 browser checks.

## Progress display (Nov 10; Dkota: "a guy on Interview but it isn't scheduled" was confusing)
- File header `#dProg`: the 14 unlabeled dashes are replaced by five labelled phases (`PHASES` in shared.js: Screening 0–4, Interview 5–6, Approval 7–8, Onboarding 9–13, then Active) with Done / "n of m", plus one sentence from `statusOf(a, p)` → {pill, head, sub} and the Go button ("Schedule it" at step 5). Clicking a phase opens its first unfinished step (`data-step`).
- `statusOf` spells out the Interview phase: "Interview isn't scheduled yet" (step 5) / "Interview booked for …" / "Interview was …" (past, not marked). The list pill and line and the header pill use it; the Overview Interview tile shows "N not scheduled yet".
- `progress().next` is now an instruction (`NEXT_STEP`), not the milestone name ("Next: Interview scheduled" read as already scheduled). Milestone names are unchanged in the full checklist.
- Portal: the Interview step says "Not scheduled yet…" and the tracker reads "Step 4 of 7: Interview (not scheduled yet)" (`steps[].short`).
- Pushed to the branch; waiting for Dkota's OK on the look before merging (screenshots tests/shots/54–56).
- Tests: 328 browser.

## Notifications fix + first-visit tour (Nov 10)
- **Why alerts died after ~2 days on the Home Screen app**: the Firebase service worker shows nothing when the app is open in front (it hands the push to the page), and iOS switches push off for an app that receives pushes without showing a notification. Also nothing ever re-saved a device's registration, and the server deletes a registration the first time a send fails, so one hiccup was permanent.
- `public/firebase-messaging-sw.js` is now plain (NO Firebase code, no importScripts): its own `push` handler ALWAYS calls `showNotification`, then posts `{type:"pvrs-push"}` to open windows (desk toasts it). Don't put the Firebase messaging library back in the worker.
- `refreshPush()` (desk) and the same block in portal.js: on every open, and every 6 h while open, a device that had alerts on gets its current token and saves it again (swaps the old doc). If the phone revoked permission, the local "on" is cleared and the Notifications window opens saying they stopped (`pushLost`).
- Server no longer deletes tokens on `invalid-argument` (only not-registered / invalid-registration-token).
- After this deploy each device that lost alerts has to turn them on once more (Notifications → Turn on). If an iPhone won't offer it, remove the Home Screen app and add it again.
- **Tour** `public/js/tour.js` (`TOURS`, `showTour`, `maybeTour`, `tourSeen`): short cards per role: coordinator, admin, interviewer, member, applicant, newmember (orientation). Auto-shows once per person + role per device (localStorage `pvrsTour:<email>:<role>`; the owner is never interrupted). Replay: ⌘K "Show the tour", phone More → "How this works", portal "How this works" button. Owner previews any role's tour from ⌘K ("Tour: what … is shown"). Tests switch it off with localStorage `pvrsTourOff` (open() option `tour: true` turns it on). Update the cards when a role's abilities change.
- Tests: 321 browser, 35 push.

## Interview coordinator role (Nov 10; Dkota's choices: sees everything view-only + all four powers)
- For Dkota's assistant, who takes over interviews. `staff/{email}.role = "coordinator"` (Settings → Team seg: Member / Interviewer / Coordinator / Admin; `ROLE_LABEL`). Reads like an admin (`S.admin` true, `isAdmin()` in both rules files includes it); `S.coord` = is the coordinator, `S.sched` = owner or coordinator (may schedule). `S.canEdit` stays owner-only.
- May: post/delete any interview time and pick its host, book/change/release an applicant's time (`openBook`, `bookFor`), edit `sched.*`, flip `portal.bookingOpen` (private doc: rule allows only that key; `coordBooking` updates just `bookingOpen` on the portal page because only the owner's desk rewrites the whole page), assign interviewers + conversation members (`saveInterviewers`, `convos`), read and reply in every applicant conversation (`watchMessages`, `canSeeApp/canReplyApp`), send the interview email (Email button opens it directly). Rules: `isCoord()`, `coordOnly()`. Nothing else: no names, checks, board, onboard, notes, settings, team, deletes.
- Owner-only buttons are hidden for non-owners except `SCHED_OK` (book/release/email) for the coordinator.
- Overview: "Interviews to do" (`coordItems`, `COORD_ACTS`): post times when fewer open times than people waiting, open booking, email that times are open, follow up after 5 days, pick interviewers, mark completed. Each has its action button.
- Push: coordinators get bookings/cancellations (`bookingCrew`), applicant messages, and every interview in the morning list (`buildMorning({coordinators})`).
- Tests: 311 browser, 32 push, 23 new rules tests (pass in the emulator; the 4 storage failures in cloud containers are the container's Java proxy options, they pass in CI).

## Orientation document requests (Nov 9)
- Dkota reported a new member who couldn't upload through the orientation dashboard; cause not confirmed (no access to production from the session). Hardened the likely ones: every checklist item now gets an Upload button except the application and the orientation form (`NOT_CERT_RE`; the old `CERT_RE` keyword guess hid the button for renamed items); files with no type (some phones/scanners) get one from the file ending (`typeOf`, portal.js); failed uploads say why (`uploadWhy`).
- Onboard tab → Orientation box → **Request documents** (`openOrientDocs`, `orientDocItems`): outstanding checklist items as chips (all pre-picked) + "Something else". Sets `onb.requested.<key>` = date (portal item gets `req: true`, shown as "Requested" with a primary Upload button), extras go to `docs.requested`, then opens the email (`TEMPLATES.orientdocs`). Push: "Document needed" when the requested count rises (`portalChanged`).
- A person already made a Squad member lands on the desk (Messages), not the dashboard, so they can't upload there. Open question for Dkota.
- Tests: 296 browser, 31 push.

## Status model + orientation (Nov 4, Dkota's rules)
- **One sign-in for everyone** (`#signin`): email link, Google, password. `startFor` already routes by status: owner → staff doc → portal. Spam/junk warning on the page, after sending, and in the move-to-orientation email.
- **Status moves are manual**: Applicant → New member (`openMoveToOrientation`, sets `onb.orientStarted`) ONLY after board approved AND Sterling complete with result clear (`orientReady`); no override. New member → Squad member (`openMakeMember`, creates `staff/{email}` role member, `onb.memberSince`), warns if unfinished. "Move back" undoes the first move. Milestone 11 is now "Moved to orientation"; the separate "orientation chair notified" step is gone because Dkota is the chair.
- **New-member view**: `portalHTML` with `pd.orientation` shows only the orientation dashboard, messages and documents (`orientHTML`); application timeline, interview, references and What to expect are hidden.
- **One-on-one scheduling**: `orientSlots/{id}`; `portal.orient` {slotId,start,...}; `openOrientTimes`, `openOrientBook`, `markAttended`. No group sessions.
- **Checklist = PVRS's real sheet** (photo from Dkota, Nov 4): `DEFAULT_ONB`, 11 mandatory items "required prior to issuing any equipment and/or the ability to run calls". `OLD_ONB` (my starter) auto-migrates. Item 5 is medical: `isConfidential` routes uploads to the vault. Handwritten additions: EMT card # (`onb.emtCard`) and exp date (`onb.emtExpires`). Moving to orientation auto-checks "Completed application" when `app.complete` is yes. Mark attended ticks the Orientation form item.
- **Dashboard**: desktop applicant list is a box (`#ovRoster`) on Overview; `parkRoster`/`placeRoster` move the same `.roster` element in and out of #detail. Slide-out strip and pin removed Nov 4. Phones unchanged.
- **Board** `openOrientBoard` (grid by person × checklist). Deadline `settings.orientDays`, counted from the move. Checklist lines may carry a link: `Label | https://…`. Certificate uploads: portal docKey `onb:<key>`, Approve on Onboard tab; medical/SS names route to the vault.
- **Trainer sign-offs** `signoffs/{appId}` {name, trainers[], items[], done{}}; any role can be a trainer and sees only that list (`openSignoffs`). Starter list `DEFAULT_SKILLS`, editable in Settings; not PVRS's real list yet.
- **Check-ins** `portal/{id}/checkins/{30|90}`, `checkinDue`. **Documents** `library/{id}` + Storage `library/{id}/` with roles[] and newMembers. **Record** `printOrientRecord`. **Handoffs** `handoffMail` (`settings.chiefEmail/techEmail`).
- **AI brief** (Board tab, needs Settings → Med Control on): adds `interviewSummary`, `referencesSummary`, `recommendation` (proceed/look_closer/not_ready), `recommendationReasons`. Advisory; prompt excludes protected traits and never sees conviction explanations. Fixed: filed reference answers (`form.answers`) were being dropped by the privacy filter, so earlier briefs never saw them.

## Nov 4 batch (Dkota: everything from the suggestion list except letters; PVRS keeps sending those itself)
- **Morning reminders**: `functions/morning.js` (`buildMorning`, pure) + `push.morning` (`onSchedule` 7:30 AM ET): owner counts, each interviewer's interviews, applicants day-before. First function needing Cloud Scheduler: if github-deploy lacks permission, the deploy log says so.
- **Interviewer availability**: `slots/{id}` gains `host`, `hostName`. Admins/interviewers add and delete their own unbooked times (`canHostSlots`, `canHost()` rule); owner can pick a host. Booking a hosted time assigns them via `setHost` in `interviewBooking` (`hostFromBooking` marks it so cancelling only removes auto-assignments). Portal shows "with Casey".
- **My interviews**: `renderMyInterviews`, the interviewer's Overview; `[data-startiv]` starts interview mode.
- **Applicant alerts**: `applicantTokens/{token}` {appId,email,device,at}; portal `pushState/pushOn/pushOff`, `sendApplicant`, `portalChanged` (booking opens, a step done count rises, a new doc request). Never decisions; a decline sends nothing (tested).
- **Duplicates**: `dupesOf`/`dupeWhy` (same email, phone, or full name); To do pri 0, note on the Application tab, `openDupe`. `mergeFiles` writes the kept file first, then deletes the other (`deleteApplicant(.., {keepRecordFiles})`). Blocked when both files have portal access. `notDupes.{id}` dismisses; `otherForms[]` keeps a second online application; records rule now accepts any `records/.*` path.
- **Bulk**: owner, `#bulkBtn`/`#bulkBar`, `S.bulk`: assign (`saveInterviewers`), message (private per applicant, `{first}`), email references.
- **Channel extras** (channels only, not applicant conversations): reactions (`posts.reactions`), files (`posts.file`, Storage `chat/{cid}/`, ≤15 MB, `isConfidential` names refused), pinned note (`channels.pin`, owner), online dots + typing (`presence/{email}`, 60 s heartbeat, staff only).
- **Search**: `searchAll` in ⌘K covers notes, interview answers, applicant messages, channel posts; only data that desk already loaded, never the online form. Messages search matches text too.
- Tests: 248 browser, 26 push, 116 rules.

## Interviewer role (Nov 3, night; Dkota's choices)
- Roles now: owner · **admin** (every file, view only + interview) · **interviewer** (only applicants assigned to them: Application + Interview tabs, fill in the interview) · **member** (NO applicant files; Messages only, lands on Messages, `body.member-user`). Settings → Team seg Member/Interviewer/Admin (`ROLE_LABEL`, `roleLabel`).
- Assignment: `applicants/{id}.interviewers = [emails]` (shared doc), owner-only via Interview tab "Interviewers" box → Assign (`renderInterviewers`, `openAssignInterviewers`; picker lists interviewers + admins). Saving also adds/removes them in `convos/{id}` (Dkota: yes). Box has class `noiv` so interview mode skips it.
- Desk loads applicants per role: admin/owner all; interviewer `where("interviewers","array-contains",me)`; member none.
- Rules: `assignedTo(data)`; applicants read `isAdmin() || assignedTo(resource.data)`, update interviewOnly for admins/assigned; history create same; pushTokens create any staff. Members lost interview access (tests updated).
- Push: `interviewBooking` → owner + admins + that applicant's interviewers (`bookingCrew`); "Interview assigned" to newly added interviewers (in `pageCompleteShared`). Notifications available to every role.
- Tests: 216 browser, 16 push, 93 rules.

## Team messaging (Nov 3, evening; Dkota picked from mockups)
- Messages is a full screen in #detail (`openChat`/`paintChat`/`closeChat`, `S.chatOn`, `.app.chatopen` on phones; `C` state in desk.js). Sidebar #msgsBtn (now shown to ALL staff), phone mnav Messages, ⌘K, Overview "New messages" all open it. Links `/?chat=c:<cid>` or `a:<appId>` (`openFromLink`).
- **Channels** `channels/{cid}` {name, color, members[], names{}, createdAt/By, updatedAt} + `channels/{cid}/posts` {text ≤4000, by, name, at}. Owner-only create/edit/delete (`openChannelEditor`); members see only channels they're in (array-contains query; rule checks `resource.data.members`).
- **Applicant conversations** stay in `portal/{id}/messages`. `convos/{appId}` {members[], names{}} = squad members the owner added (`openConvoEditor`); they read + reply (rules `inConvo`). Applicants are never in groups with each other (Dkota's rule). Collection-group messages read is now OWNER ONLY (admins used to read all; now only conversations they're added to). Portal shows staff replies as "<first name> · PVRS Membership".
- Unread per person: `chatReads/{email}` {key: ms} (own doc only). Owner's old `readAt` still counts until a marker exists.
- Push (functions/push.js): `channelPost` (members minus author, "X posted in #name", no text), `applicantMessage` (owner + convo members, staff replies skip the author). `send({to, skip, chat})`.
- Tests: 204 browser checks, 15 push checks, 77 rules tests (all pass on a Mac; Java can be fetched from Adoptium into the scratchpad when ~/.local/jdk21 is missing).

## Deploy fixes (Nov 3, later)
- Dkota granted **Service Account User** to github-deploy on the appspot account: the ActAs error is gone.
- `notifyPaperwork` (functions/index.js) switched OFF (`PAPERWORK_EMAIL_ON = false`): the CLI refused to deploy any function while the unset SMTP_PASSWORD secret was declared. Dkota then also granted Service Account User on the **compute** default account (1066878367633-compute@…); first fully green deploy. Slack was dropped for desk push notifications (see Oct 31 batch → Push notifications). Old PR #5 (Slack) is obsolete.

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
- **Push notifications** (brought back Nov 3 instead of Slack, Dkota's pick): `public/firebase-messaging-sw.js` (compat SDK, config duplicated), desk lazy-loads firebase-messaging only in `openNotifications`; `pushTokens/{token}` {email, device, at} (rules); `functions/push.js` (exported as group `push`; deploy `firebase deploy --only functions:push`). Owner gets all events (new application, reference answered, references complete, page sign-offs via `signoff.*`/`pagesign.*` `.done` transitions, bookings, messages, uploads, access requests), admins get bookings. Links open `/?open=<id>` (`openFromLink`). Phones: More → Notifications (`[data-notif]`). Server tests: `tests/push.test.cjs` (fake Admin SDK). Needs `VAPID_KEY` in config.js (docs/notifications.md).
- **Auto-deploy**: `.github/workflows/deploy.yml` (browser + privacy tests gate deploy of hosting + firestore:rules + storage + functions:push + functions:ai; rules tests informational). Needs repo secret FIREBASE_SERVICE_ACCOUNT and Secret Manager ANTHROPIC_API_KEY, all set up in the browser (docs/auto-deploy.md). Nov 1: Dkota works only through cloud sessions; there is NO local copy on his computer (POTVOL-PC4), so deploys go through GitHub Actions, not Terminal.
- **Restore drill**: docs/restore-drill.md (Cloud Shell, restore into temp db `restore-drill`, check, delete).
- Known: 2 storage rules tests (confidential upload) fail in the emulator, pre-existing on abb445f too; suggested as a separate task.
- Tests: 153 browser checks; rules 49 pass / 2 known fails. In cloud containers run browser tests with `PW_CHROME=/opt/pw-browsers/chromium`.
- Dkota said (Oct 31) the design "is good but throws me off" — wants fun but professional, plus more features and AI. Pending his pick of direction.

## Oct 31 (later): Friendly Modern look + Med Control AI (merged to main Nov 1)
- **Look:** Dkota picked mockup "C · Friendly Modern" (design canvas https://claude.ai/artifact/8aocYnGxuELmb4sR2eQj8B). Implemented as the last layer of app.css (token overrides + navy greeting banner `.ovhead`, pastel `.stg` tiles, tinted `.av`). Plus Jakarta Sans from Google Fonts (index.html). Sign-in/home/apply (`.gate`) keep the dark EMS backdrop for now. Light + dark both done.
- **Med Control** = the AI's name (Dkota's pick; EMS "medical control"). `functions/medcontrol.js` callable `ai-medControl` (export group `ai`; deploy `firebase deploy --only functions:ai`; secret ANTHROPIC_API_KEY). Jobs: chat (claude-haiku-5-5, effort low, roster in a cached system block + desk hints), brief (claude-sonnet-5-5, json_schema output, `fallbacks: "default"`; saved to private/main.ai.brief, owner only), reply (claude-haiku-5-5). OWNER ONLY since Nov 4 (Dkota, to prevent spamming; `checkCaller` and `aiOn`); 150 calls/day (`aiUsage/{email}_{day}`, no client rule = no client access). `safeApplicant()` is the privacy filter; `tests/medcontrol-privacy.test.cjs` guards it.
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
