# PVRS Membership Desk — feature inventory

Checked items are still in this branch. Nothing in the list was removed or given a different meaning. The desk, the applicant portal, the public application, the reference form and the paperwork vault all use the same Firebase project, the same collections and the same security rules.

Paths are where the behavior lives. Roles are enforced again in `firestore.rules` and `storage.rules`.

## Public site

- [x] Home at `/` with Apply and Sign in (`public/index.html`, `public/js/main.js`)
- [x] Public application at `/apply`, including when the visitor is already signed in
- [x] Sign-in at `/signin` for applicants, new members and squad members
- [x] Reference form at `/ref/{code}`, no sign-in (`public/js/reference.js`)
- [x] Top bar: Apply and Sign in
- [x] Time-of-day greeting, date, and Potsdam weather on the sign-in page (`public/js/weather.js`, Open-Meteo and NWS alerts, cached 15 minutes). Weather hides itself if the request fails
- [x] Recruiting path on the home page: Apply, review, interview, welcome
- [x] Add to Home Screen manifest and icons (`public/manifest.webmanifest`)

## Sign-in and accounts

- [x] Email sign-in link, with the spam warning before and after send
- [x] Confirm the email when the link is opened on another device (`#confirm`)
- [x] Continue with Google
- [x] Email and password sign-in, forgot password, and create account (10+ characters)
- [x] New email accounts must confirm their address before the rules let them do anything (`#verify`)
- [x] Request team access with Google or with email. The owner approves or denies in Team
- [x] Two-step sign-in (TOTP) for staff who turn it on. The console still has to have Identity Platform TOTP enabled (`docs/two-step-sign-in.md`)
- [x] Routing: paperwork account → vault, owner and Full access → desk, other staff → desk, portal email → that person's portal, otherwise the no-access screen
- [x] Sign out, and sign-out after idle time (`settings.idleMinutes`, default 30)
- [x] If the account cannot be loaded, the page says so and offers Try again

## Roles

| Role | What they can do |
|---|---|
| Owner (`dkota@pvrs.org`) | Everything, including Settings, Team, delete, and secure documents |
| Full access (`staff.role = "full"`) | The same as the owner, including secure documents. Cannot edit the owner's own staff row, because that row is not how the owner is recognized |
| Admin | Read every file. Fill in the interview. Open secure documents. Cannot edit other fields |
| Coordinator | Read like an admin. Run interview scheduling: times, booking, who interviews, messages. Cannot edit names, checks, the board, onboarding or settings |
| Interviewer | Only applicants assigned to them. Application and Interview tabs, plus their own private impression |
| Member | No applicant files. Messages, documents they are allowed, and My paperwork if they still have an orientation page |
| Applicant | Their own portal only |
| Paperwork (`orientationpaperwork@pvrs.org`) | The confidential vault. Can delete and mark filed |

- [x] Owner email is `dkota@pvrs.org` in `public/js/config.js`, `firestore.rules` and `storage.rules`
- [x] UI hides owner-only controls for everyone else (`S.canEdit`). The rules reject the write anyway
- [x] Interviewers are assigned on the Interview tab and added to that applicant's conversation

## Desk navigation

- [x] Sidebar: New applicant, stage filters, Onboard → New members, Overview, Interview times, Orientation board, Sign-offs, My paperwork, Documents, Board meeting, Team, Settings, Med Control, Messages, Keyboard shortcuts
- [x] Phone bottom menu: Applicants, Onboard, Overview, Messages, More. More opens the tools that do not fit
- [x] Overview: Start here (the next thing to do), pipeline lanes (Screening, Interview, Approval, Onboard, Active members), the applicant list, To do, Coming up, activity, Year at a glance
- [x] On a wide window the applicant list sits beside the lanes, so the roster is on the first screen
- [x] Search the list by name or email from the first letter, by phone (3 digits), and from two letters by stage, status, membership type, place or "online"
- [x] Press Enter in search to open the first match. `/` focuses search. ⌘K or Ctrl-K opens the command palette
- [x] Command palette searches applicants, notes, interview answers and messages the desk has already loaded, and runs commands. License numbers and the rest of the online form are not in that search
- [x] Sort: stage, name, newest, longest waiting, recently updated
- [x] Keyboard: J/K, arrows in the list, N for new, 1–7 and `[` `]` for tabs, E for email, Esc, `?`
- [x] First-visit tour per role, and a replay from the palette (`public/js/tour.js`)
- [x] Skip link to search

## Applicant file

Tabs: Application, Checks (screening and references), Interview, Board, Onboard, Notes, Messages. Interviewers see Application and Interview.

- [x] Header: contact, stage, type, place, who last updated it, and the actions Email, Book, Request docs, Portal, Application (print), Delete (owner), Actions on a phone
- [x] Those actions wrap onto the next line instead of being cut off
- [x] Five phases — Screening, Interview, Approval, Onboard, Active — with done / n of m. The current phase says whether the interview is unscheduled, booked or past
- [x] Your move strip when a To do item is waiting, with that item's button, plus Go to it
- [x] Go to it opens the tab for the next unfinished step and focuses the field
- [x] Milestone checklist (14 steps) and plain-language next step
- [x] Save state: Saving, Saved, Not saved, with a retry if the write fails
- [x] Change history, append-only
- [x] Original application: view or print the online form, or open a paper copy labelled Application. Upload original is owner-only. Nothing is deleted by printing
- [x] Duplicate detection (same email, phone or full name), dismiss, and merge when neither file has portal access
- [x] Select mode for the owner: assign interviewers, message, email references

### Application

- [x] Name, phone, email, membership type (Regular, Associate, Auxiliary, Non-Operational, Driver Only, Non-Resident) and the requirement note for that type
- [x] Location: Potsdam or Other
- [x] How they heard about PVRS
- [x] Application received, initials, complete yes/no
- [x] Documents requested, uploads, mark received
- [x] Secure documents block for admins, the owner and Full access
- [x] Welcome: first invite sends portal access, a welcome message and opens the welcome email. Later clicks resend the link only
- [x] Portal preview

### Checks

- [x] Driving record (MVR) and driver's license verification, including expiration
- [x] License number from the online form, shown to admins on this tab only. Never in the portal, the board packet or a member view
- [x] Up to 4 references. 3 received is enough. A reference marked for replacement does not count
- [x] Ask for a new reference. The applicant submits one. The desk files it and clears the old link and answers
- [x] Email link / copy link. The link lasts 60 days. Email all unanswered references, one email each, from the owner's mail program
- [x] Reference answers under View answers. Applicants never see them
- [x] Nudge a reference who has not answered (about 7 days, once a week)

### Interview

- [x] Book, change, release. No-show after a booked time has passed: releases the slot, reopens booking, opens the email
- [x] Let them book, 24 hours ahead, only while booking is open
- [x] Interviewers box and private impressions (the author, the owner and admins)
- [x] Interview score, five 1–5 ratings, average on the board packet. Under 3 is flagged
- [x] Applicant brief and interview mode (questions in order)
- [x] What to bring, sent to the portal
- [x] Add to calendar (.ics)

### Board

- [x] Committee approval, then the board vote: motion, second, for, against, abstain, Approved / Tabled / Denied
- [x] Board queue filter
- [x] Board meeting mode: one applicant per screen, vote panel, copy agenda, print packet, email the board (`settings.boardEmails`). The packet PDF is attached by hand
- [x] Med Control brief on the Board tab when Med Control is on
- [x] A declined applicant is not told in the portal. The current step reads as still with the committee, booking closes, and the administrator sends the letter

### Onboard

- [x] Once the board result is Approved, the file is Onboard. Later steps also count as approved when the vote was never typed in. Not Sterling, not hold, not "finished"
- [x] Status line: Applicant → Onboard → New member → Squad member
- [x] Move to orientation only after board approval and a clear Sterling check. Move back. Make squad member (creates `staff` as member)
- [x] Sterling request and result. Orientation does not start on the applicant's own dashboard until Sterling is complete and clear
- [x] Paperwork and documents checklist (the squad's sheet, including sexual harassment prevention). Dates in `onb.items`. Undo a line the desk marked done
- [x] Equipment and access (`onb.issue`), desk only, printed on the orientation record
- [x] Request a missing document from its line, or request several. Before orientation opens, the request shows under Documents on the portal
- [x] Open signing for 3 hours. Forms: confidentiality statement, confidentiality quiz, constitution and bylaws, emergency contact, hepatitis B declination. The insurance beneficiary form stays paper
- [x] Hepatitis B declination is medical: it goes to the vault as a nameless private document
- [x] One-on-one orientation times, book, mark attended
- [x] Mentor, mentor check-in, EMT card number and expiration, CPR expiration
- [x] Notify the chief and the tech chair. 30- and 90-day check-ins
- [x] Orientation board (person × checklist) and the printable orientation record
- [x] Trainer sign-offs. A trainer sees only that list

### Notes and messages on the file

- [x] Notes (private)
- [x] The applicant conversation, saved replies with `{first}`, and an AI draft when Med Control is on

## To do, reports, celebrations

- [x] To do: welcome, reference forms, booking, stalled 14+ days, mentor pairing and check-in, expirations, anniversaries in the next 7 days, a failed upload, duplicates, retention review
- [x] Coordinator's own list: post times, open booking, email, follow up, pick interviewers, mark completed
- [x] Year at a glance: three counts, applications by month, how they heard, and the funnel (applied → references in → interviewed → board approved → active)
- [x] Reports: days between steps, in-process counts, stalled, waiting longest
- [x] Year-end report and the recruiting flyer (QR code to `/apply?src=flyer`, which pre-selects Flyer or poster)
- [x] Celebration when the owner records a board approval or an active member. Off when the system asks for reduced motion

## Messages

- [x] Channels the owner creates. Members see only channels they are in
- [x] Posts, reactions, files (PDF or image, 15 MB; medical and Social Security names are refused), a pinned note, online and typing
- [x] Applicant conversations. Applicants are never in a channel with each other. Staff replies show as the first name and "PVRS Membership"
- [x] Unread badges. Push: a channel post pings members except the author; an applicant message pings the owner and the conversation

## Team, settings, documents

- [x] Team is its own screen: access requests, roles, add a member, what each role can do
- [x] Roles: Member, Interviewer, Coordinator, Admin, Full access (Full access asks for confirmation)
- [x] Settings: signature, emails (documents, board, chief, tech), default interview location, what to bring, saved replies, checklist lines, equipment lines, trainer skills, retention years, idle minutes, Med Control on/off
- [x] Document library with roles, and a flag for new members
- [x] Import and full export. Backups are also the Firebase daily and weekly exports (`docs/restore-drill.md`)
- [x] Password and two-step from the key button
- [x] Notifications window. On a phone: More → Notifications

## Applicant portal

- [x] Only that applicant's steps. No check results, votes, notes or other people
- [x] Step tracker and the journey
- [x] Your move: replace a reference, pick an orientation time, upload a requested item, pick an interview, or a calm "nothing needed"
- [x] The three soonest interview times on that card, then the full list
- [x] Interview within two days, add to calendar, what to bring, reschedule inside 24 hours (posts a message)
- [x] Interview prep until the interview is done
- [x] Document uploads (PDF, photo or Word, 25 MB). A failed upload is recorded for the desk
- [x] Secure upload for medical and Social Security items. The desk sees "Private document" and not the file name, except admins, the owner and Full access, who can open it
- [x] Messages with the squad
- [x] After orientation starts and Sterling is clear: the orientation dashboard, forms to sign while signing is open, checklist, FEMA links on IS-100 and IS-700 when the line has no link of its own
- [x] Phone menu: My application (or Orientation), Documents, Messages
- [x] Applicant push alerts for booking, a finished step count and a document request. A decline sends nothing

## Online application

Seven steps, saved on the device until submit: about you, education, EMS experience, employment, background, references, review and sign.

- [x] Required: name, email, cell phone, date of birth, permanent address, license state and number, membership type, the agency question, the conviction question, 3 references with name, relationship, email and phone, the signature checkbox and a legal name
- [x] Optional: how they heard about PVRS. The flyer QR pre-selects Flyer or poster
- [x] Validation lists what to fix and marks the fields, including for a screen reader
- [x] A hidden honeypot. Bots that fill it look successful and write nothing
- [x] Submit creates `submissions/{id}`. The owner's desk imports it once (claimed in a transaction), tags it Online, prefills interview answers, and stores the license and the full form on the private record
- [x] Review shows the license as the last four digits

## Reference form

- [x] One response per link, before it expires. Ratings 1–5 and the written questions from the squad's form
- [x] The desk files the answers on that reference and marks it received

## Vault

- [x] `public/js/vault.js` for the paperwork account: open, mark filed, delete
- [x] Signed hepatitis B declinations open as the form
- [x] A Cloud Function can email the paperwork account with no attachment and no file name. It is off until a mail secret exists (`functions/index.js`)

## Med Control and notifications

- [x] Med Control (owner and Full access, and only when Settings turns it on): chat, a board brief, a reply draft. 150 calls a day. The prompt strips protected details (`functions/medcontrol.js`, `tests/medcontrol-privacy.test.cjs`)
- [x] Push to staff devices (`functions/push.js`): new application, reference answered, references complete, sign-offs, bookings, messages, uploads, access requests. A bad token is removed only when the service says the token is gone
- [x] The service worker always shows the notification, including when the app is open (`public/firebase-messaging-sw.js`)
- [x] Devices re-save their token on open and about every 6 hours
- [x] Morning reminder at 7:30 AM Eastern (`functions/morning.js`)

## Data

Shared on `applicants/{id}`: name, phone, email, type, location, `app`, `sched`, `iv`, stage, interviewers, updatedAt/By.

Private on `applicants/{id}/private/main`: MVR, license, references, Sterling, committee, board, notify, notes, status, documents, portal flags, orientation, mentor, the online form. Field roots are `SECURE` in `public/js/shared.js`.

Also: `portal/{id}` and its messages, files, forms, check-ins, reference updates and upload errors; `portalEmails`; `slots`; `orientSlots`; `staff`; `accessRequests`; `submissions`; `refLinks` and `refResponses`; `vault`; `channels` and posts; `convos`; `signoffs`; `library`; `presence`; `pushTokens`; `applicantTokens`; `chatReads`; `settings/main`; `applicants/{id}/records`, `history`, `impressions`.

Files in Storage: `uploads/`, `records/`, `confidential/`, `chat/`, `library/`. Anything else is denied.

## Improvements in this branch

- [x] Search also matches stage, status, type, place and online applications, so a common lookup does not start with a filter click
- [x] On a wide screen the roster stays beside the pipeline
- [x] File actions wrap; the phase labels are a stepper; notices sit at the bottom and do not cover the actions
- [x] Application and sign-in fields mark invalid input for assistive tech. A failed account load offers Try again
- [x] Higher-contrast type, a navy navigation rail, and 44px fields on the public forms and on phones
- [x] Skip link, visible keyboard focus, and the animated backdrop removed so it no longer sits behind the text

## Open GitHub items

Issues 1–6 are old pull requests, not bug reports. They were not merged.

- [x] #1 Isolate a test Firebase project. Not folded in. It would send localhost at a different project, and Auth for that project is unfinished. Production sign-in is unchanged. `HOSTING.md` covers previewing this repo without a second project
- [x] #2 and #3 Visual polish and the homey palette. Superseded by this design. The squad asked for a clearer professional screen, not another decorative pass
- [x] #4 Duty schedule. Not built. It needs the squad's real shifts and who may sign up, and it is a new product surface rather than a fix to membership
- [x] #5 Slack pings. Not built. The desk already pushes the same events to phones, and the Slack webhook would be a second copy of applicant names. Push stays the channel
- [x] #6 Animated sign-in wallpaper. Not brought back. It made the sign-in page harder to read

## How this was checked

`node tests/browser.test.mjs` — 451 checks, no errors. It exercises the desk, portal, application, reference form and roles against an in-memory stand-in and does not touch production. `npm run build` copies `public/` to `dist/`. Screenshots of the main screens, before and after, are on the pull request.
