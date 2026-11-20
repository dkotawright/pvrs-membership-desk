# Full redesign: feature inventory (checklist)

Started Nov 20, 2026 for Dkota's request: a complete visual rebuild of every page and the applicant portal, with
no lost features and no change to how anything is saved. Every line below must still exist, and work the same,
in the new design. Tick each one during review of the redesign branch.

Ground rules (Dkota): UI layer only. Same Firestore collections, fields and document shapes, same Storage paths,
same security rules, same roles and sign-in, same write logic. No migrations, no deletes.

## Public pages (signed out)
- [ ] Home `/`: hero, Apply and Sign in, "How did you hear" pre-pick from `?src=flyer`
- [ ] Online application `/apply`: multi-step form, draft saved in the browser, license state + number, 3–4 references, how-you-heard, submit → `submissions`
- [ ] Sign in `/signin`: email link, Continue with Google, email + password, create account, request access (Google / email), spam warning, welcome panel with greeting, date, Potsdam weather and alerts
- [ ] Email-link confirm screen, verify-your-email screen (polls until confirmed)
- [ ] No access / access requested / withdraw request screen
- [ ] Reference form `/ref/{code}` (no sign-in): questions, ratings, one response, draft saved
- [ ] Secure documents page for orientationpaperwork@pvrs.org: open, mark filed, delete, signed Hep B forms
- [ ] Stuck-page safety net: error box, Reset and reload after 12 s

## Desk shell
- [ ] Sidebar: New applicant, list filters (All, Board queue, Screening, Interview, Approval, Onboard → New members, Active), Overview, Interview times, Orientation board, Sign-offs, My paperwork, Documents, Board meeting, Team, Settings, Med Control, Messages, Keyboard shortcuts, signed-in person with role, password key, sign out
- [ ] Phone bottom menu: Applicants · Onboard · Overview · Messages · More (sheet with every sidebar tool, Notifications, How this works)
- [ ] ⌘K search: people, notes, interview answers, messages, channel posts, every command (Overview, Board meeting, Flyer, Year-end report, Orientation board/times, Sign-offs, Documents, Messages, Team, Settings, Med Control, Reports, Notifications, Tour, Two-step, Password, Shortcuts, Sign out, Open Checks, Print application, Email reference forms), owner tour previews
- [ ] Keyboard shortcuts (⌘K, J/K, N, 1–7, [ ], E, ?, /, Esc)
- [ ] Toasts, celebrations (confetti on board approval / Active), auto sign-out after idle, first-visit tour per role
- [ ] Push notifications window (turn on/off, lost-permission notice) and refresh
- [ ] Roles shown correctly: owner, Full access, Assistant, Admin, Interview coordinator, Interviewer, Member

## Overview (dashboard)
- [ ] Start here (top To do with its action) + After that (next three)
- [ ] Five lanes: Screening, Interview, Approval, Onboard, Active members (every person, scrolling lanes, "your move" ping, Add someone on Onboard)
- [ ] Applicants box (search, sort, Select for bulk), bulk bar: assign interviewers, message, email references
- [ ] To do card (all items with action buttons, incl. duplicates, retention, expirations, mentor, anniversaries, upload errors, access requests)
- [ ] New messages, Team access requests card
- [ ] Coming up, Applicant activity, Year at a glance (KPIs, months chart, how-heard chart, funnel), Reports, Flyer, Year-end report buttons
- [ ] Interviewer home (My interviews, start interview mode); coordinator "Interviews to do"; member lands on Messages

## Applicant file
- [ ] Header: avatar, name, stage pill, type, updated by; actions Email, Book, Request docs, Portal preview, Application print, Delete (owner); phone Actions sheet
- [ ] Progress: five phases with counts, status sentence, Go to it / your-move button, step count
- [ ] Tabs: Application, Checks, Interview, Board, Onboard, Notes, Messages (keyboard 1–7)
- [ ] Application tab: Applicant, Application, Original application (view/print/upload), Incomplete application, Applicant portal (invite/resend, booking on/off, preview), Documents (requests, uploads, approve, secure documents for admins), Squad records (upload, open, remove), duplicate note
- [ ] Checks tab: MVR, Driver's license check, License issue; References (4 slots, email/copy link, nudges, Ask for a new one, View answers, Email all reference forms)
- [ ] Interview tab: Interviewers (assign), Scheduling (book, release, no-show, .ics), Who was there, every question group (About, EMS, Past experience, Certification, Current EMTs, Uncertified, General, Non-operational, Wrap-up, Requirements, Next steps), Interview score, Committee decision, private impressions, applicant brief, interview mode
- [ ] Board tab: Med Control brief, Membership committee, Board vote, Board notes, Board packet print
- [ ] Onboard tab: Sterling, Notifications, Orientation status (Move to orientation / anyway, Move back, Make squad member, session book/change, Mark attended, record, packet), Orientation documents (per-line uploads, Approve, Request / Ask again, Undo, Open signing, Countersign, Clear, signed forms, upload errors), Trainer sign-offs, Check-ins, Duty crew, Email account, Paperwork and documents checklist, Equipment and access, Mentor, Expiration dates, Full checklist
- [ ] Notes tab: Admin notes, Status, Change history, Remove (delete file)
- [ ] Messages tab: thread, saved replies, Draft with Med Control, conversation members
- [ ] Page sign-offs (mark a tab complete), view-only notes for non-owners, save state

## Tools and windows
- [ ] Interview times (post, host, delete, booked list, add to calendar), Book for applicant
- [ ] Orientation board grid, Orientation times, Add someone straight to orientation
- [ ] Trainer sign-offs (assign trainers, trainer view)
- [ ] Documents library (upload, roles, new members, remove)
- [ ] Board meeting mode (one per screen, vote panel, Copy agenda, Email the board, Print packet)
- [ ] Messages screen: channels (create, edit, colour, members, pin, reactions, files, typing, online), applicant conversations, unread, search
- [ ] Med Control: chat, Today, Brief, Questions, Welcome email, usage, Clear; reply drafts
- [ ] Team: access requests (approve/deny), roles (Member, Interviewer, Coordinator, Admin, Assistant, Full access), add/remove, role help
- [ ] Settings: signature, emails, board emails, location, what to bring, saved replies, Med Control on/off and voice, Onboard lists, orientation deadline, trainer list, chief/tech emails, retention, idle sign-out, application link, applicant view preview, backups (full export, summary CSV, import)
- [ ] Email templates window, Request documents, Upload records, Duplicate merge, Retention review, Reports, Password, Two-step sign-in, Notifications, Shortcuts

## Applicant portal
- [ ] Header (logo, How this works, Sign out, greeting, type)
- [ ] Your move card (times on the card, uploads, reference replacement, orientation booking, calendar)
- [ ] Interview-soon banner, Your application (tracker + journey), Interview (pick/book/change/cancel/reschedule, what to bring, how to prepare), References (status, replace form), Documents (requested uploads, secure upload, other files), Messages (thread, alerts on/off), What to expect, bottom menu on phones
- [ ] New-member orientation dashboard: progress, deadline, session booking, forms to sign (signature pad, view, print), checklist with uploads and FEMA links, check-ins, documents library, My paperwork back-to-desk
- [ ] Declined applicants never see a rejection
