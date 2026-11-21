# Full redesign: feature inventory (checklist)

Started Nov 20, 2026 for Dkota's request: a complete visual rebuild of every page and the applicant portal, with
no lost features and no change to how anything is saved. Every line below must still exist, and work the same,
in the new design. Tick each one during review of the redesign branch.

**Status (Nov 20, branch `claude/bold-ride-tdsqq0`):** every line below is ticked. Each one is still in the B · Dock
design and the existing browser suite (471 checks, unchanged) still exercises them, plus 21 new checks for the dock and the
additions. `firestore.rules`, `storage.rules` and `functions/` are untouched; no write code was changed.

Ground rules (Dkota): UI layer only. Same Firestore collections, fields and document shapes, same Storage paths,
same security rules, same roles and sign-in, same write logic. No migrations, no deletes.

## Public pages (signed out)
- [x] Home `/`: hero, Apply and Sign in, "How did you hear" pre-pick from `?src=flyer`
- [x] Online application `/apply`: multi-step form, draft saved in the browser, license state + number, 3–4 references, how-you-heard, submit → `submissions`
- [x] Sign in `/signin`: email link, Continue with Google, email + password, create account, request access (Google / email), spam warning, welcome panel with greeting, date, Potsdam weather and alerts
- [x] Email-link confirm screen, verify-your-email screen (polls until confirmed)
- [x] No access / access requested / withdraw request screen
- [x] Reference form `/ref/{code}` (no sign-in): questions, ratings, one response, draft saved
- [x] Secure documents page for orientationpaperwork@pvrs.org: open, mark filed, delete, signed Hep B forms
- [x] Stuck-page safety net: error box, Reset and reload after 12 s

## Desk shell
- [x] Sidebar (now the floating dock; hover or Tab opens it with labels): New applicant, list filters (All, Board queue, Screening, Interview, Approval, Onboard → New members, Active), Overview, Interview times, Orientation board, Sign-offs, My paperwork, Documents, Board meeting, Team, Settings, Med Control, Messages, Keyboard shortcuts, signed-in person with role, password key, sign out
- [x] Phone bottom menu: Applicants · Onboard · Overview · Messages · More (sheet with every sidebar tool, Notifications, How this works)
- [x] ⌘K search: people, notes, interview answers, messages, channel posts, every command (Overview, Board meeting, Flyer, Year-end report, Orientation board/times, Sign-offs, Documents, Messages, Team, Settings, Med Control, Reports, Notifications, Tour, Two-step, Password, Shortcuts, Sign out, Open Checks, Print application, Email reference forms), owner tour previews
- [x] Keyboard shortcuts (⌘K, J/K, N, 1–7, [ ], E, ?, /, Esc)
- [x] Toasts, celebrations (confetti on board approval / Active), auto sign-out after idle, first-visit tour per role
- [x] Push notifications window (turn on/off, lost-permission notice) and refresh
- [x] Roles shown correctly: owner, Full access, Assistant, Admin, Interview coordinator, Interviewer, Member

## Overview (dashboard)
- [x] Start here (top To do with its action) + After that (next three)
- [x] Five lanes: Screening, Interview, Approval, Onboard, Active members (every person, scrolling lanes, "your move" ping, Add someone on Onboard)
- [x] Applicants box (search, sort, Select for bulk), bulk bar: assign interviewers, message, email references
- [x] To do card (all items with action buttons, incl. duplicates, retention, expirations, mentor, anniversaries, upload errors, access requests)
- [x] New messages, Team access requests card
- [x] Coming up, Applicant activity, Year at a glance (KPIs, months chart, how-heard chart, funnel), Reports, Flyer, Year-end report buttons
- [x] Interviewer home (My interviews, start interview mode); coordinator "Interviews to do"; member lands on Messages

## Applicant file
- [x] Header: avatar, name, stage pill, type, updated by; actions Email, Book, Request docs, Portal preview, Application print, Delete (owner); phone Actions sheet
- [x] Progress: five phases with counts, status sentence, Go to it / your-move button, step count
- [x] Tabs: Application, Checks, Interview, Board, Onboard, Notes, Messages (keyboard 1–7)
- [x] Application tab: Applicant, Application, Original application (view/print/upload), Incomplete application, Applicant portal (invite/resend, booking on/off, preview), Documents (requests, uploads, approve, secure documents for admins), Squad records (upload, open, remove), duplicate note
- [x] Checks tab: MVR, Driver's license check, License issue; References (4 slots, email/copy link, nudges, Ask for a new one, View answers, Email all reference forms)
- [x] Interview tab: Interviewers (assign), Scheduling (book, release, no-show, .ics), Who was there, every question group (About, EMS, Past experience, Certification, Current EMTs, Uncertified, General, Non-operational, Wrap-up, Requirements, Next steps), Interview score, Committee decision, private impressions, applicant brief, interview mode
- [x] Board tab: Med Control brief, Membership committee, Board vote, Board notes, Board packet print
- [x] Onboard tab: Sterling, Notifications, Orientation status (Move to orientation / anyway, Move back, Make squad member, session book/change, Mark attended, record, packet), Orientation documents (per-line uploads, Approve, Request / Ask again, Undo, Open signing, Countersign, Clear, signed forms, upload errors), Trainer sign-offs, Check-ins, Duty crew, Email account, Paperwork and documents checklist, Equipment and access, Mentor, Expiration dates, Full checklist
- [x] Notes tab: Admin notes, Status, Change history, Remove (delete file)
- [x] Messages tab: thread, saved replies, Draft with Med Control, conversation members
- [x] Page sign-offs (mark a tab complete), view-only notes for non-owners, save state

## Tools and windows
- [x] Interview times (post, host, delete, booked list, add to calendar), Book for applicant
- [x] Orientation board grid, Orientation times, Add someone straight to orientation
- [x] Trainer sign-offs (assign trainers, trainer view)
- [x] Documents library (upload, roles, new members, remove)
- [x] Board meeting mode (one per screen, vote panel, Copy agenda, Email the board, Print packet)
- [x] Messages screen: channels (create, edit, colour, members, pin, reactions, files, typing, online), applicant conversations, unread, search
- [x] Med Control: chat, Today, Brief, Questions, Welcome email, usage, Clear; reply drafts
- [x] Team: access requests (approve/deny), roles (Member, Interviewer, Coordinator, Admin, Assistant, Full access), add/remove, role help
- [x] Settings: signature, emails, board emails, location, what to bring, saved replies, Med Control on/off and voice, Onboard lists, orientation deadline, trainer list, chief/tech emails, retention, idle sign-out, application link, applicant view preview, backups (full export, summary CSV, import)
- [x] Email templates window, Request documents, Upload records, Duplicate merge, Retention review, Reports, Password, Two-step sign-in, Notifications, Shortcuts

## Applicant portal
- [x] Header (logo, How this works, Sign out, greeting, type)
- [x] Your move card (times on the card, uploads, reference replacement, orientation booking, calendar)
- [x] Interview-soon banner, Your application (tracker + journey), Interview (pick/book/change/cancel/reschedule, what to bring, how to prepare), References (status, replace form), Documents (requested uploads, secure upload, other files), Messages (thread, alerts on/off), What to expect, bottom menu on phones
- [x] New-member orientation dashboard: progress, deadline, session booking, forms to sign (signature pad, view, print), checklist with uploads and FEMA links, check-ins, documents library, My paperwork back-to-desk
- [x] Declined applicants never see a rejection

## Where things moved in the B · Dock design
- The sidebar is a floating glass dock on the left. Closed it shows icons and the list filters as coloured count bubbles;
  hovering it (or tabbing into it) opens it over the page with every label, the logo and your name. Same buttons, same order.
- A dark command bar floats at the bottom on computers ("Search anyone or run a command… ⌘K"); it opens the same ⌘K search.
  Hidden on phones (the bottom menu is there), in interview mode, in Messages and while a window is open.
- Start here and the file's "your move" strip are dark cards; the applicant portal's Your move is a rose-to-orange card.
- The file's tab bar is a dark floating pill (still sticky, not fixed).

## Additions (all read only; Dkota approved each one)
- [x] Week calendar: dock button + ⌘K "Week calendar". Interview times (booked and open) and orientation times, one week at a time; clicking a booked time opens the file.
- [x] Waiting on: Overview card for admins with You / The applicant / References tabs; ⌘K "Waiting on".
- [x] List filters: "Filters" button above the list: stage, membership type, location, no movement in 14+ days; ⌘K "Filter the list".
- [x] File timeline: Notes tab → Timeline (every date already entered on the file, in order, with the days between); ⌘K "Timeline" when a person is found.
- [x] Light / dark / follow the device: half-moon button under your name (desk) and in the portal header; ⌘K "Appearance: …". Saved in that browser only.

## Fixed along the way
- [x] Reference form ran off the right edge on phones (old bug, also on the live site).

## Extras (Dkota: "I want it all, but no money use")
View only:
- [x] Warning flags on cards and list rows (refs late, expiring, no interviewer, stalled, not board-ready, follow-up due)
- [x] One-page file summary to print (header "Summary", key P, ⌘K "Print summary")
- [x] Saved list views (Filters → Save this view; this browser only)
- [x] Board-ready check (Board tab)
- [x] Orientation deadlines (⌘K, Onboard lane "Deadlines")
- [x] Where members come from (Reports)
- [x] Keys: B book, R request documents, P summary, T timeline, F follow-up
- [x] No-show count (Interview tab, from the change history)

New saved fields (approved): 
- [x] Follow-up reminders (`follow.*` in the private record; Notes tab, header "Remind me", To do)
- [x] Tags (`tags.*` in the private record; Notes tab, list filter, ⌘K)

Free server pieces:
- [x] Morning push: follow-ups due (you), documents still needed on Mondays (applicants)
- [ ] Calendar feed: saved for later, not deployed (docs/later/calendar-feed/)

Skipped: duty schedule (waiting on shifts), Med Control weekly summary and text messages (cost money).
