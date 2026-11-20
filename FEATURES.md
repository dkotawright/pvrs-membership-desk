# Feature parity

The React app in `src/` uses the same Firebase project, collections, and security rules as the previous desk. Nothing here migrates or rewrites stored data.

Roles, milestones, the silent-decline rule, reference counting, confidential labels, and which fields are private are in `src/lib/domain.ts` and covered by `npm test`. The rules files themselves are unchanged.

This rebuild includes the screens and actions below. A few tools from the old desk are not in the new UI yet; their data is untouched and the rules still protect them.

**In the new app**

- Home, sign-in (Google, email link, password, create account, forgot password, authenticator prompt, team-access request), Potsdam weather
- Seven-step application with a saved draft, honeypot, and flyer source
- Reference form with 1–5 ratings
- Pipeline board and list, KPI filters, search, grouped sidebar, phone tab bar
- Applicant file: application, checks (including the license number for admins only), interview and score, board vote, Sterling and orientation checklist, notes, messages, autosave
- Applicant portal: journey, next step, interview booking, uploads including secure medical/SSN routing, messages, orientation checklist, phone signing
- Paperwork vault
- Channels (medical and Social Security names are refused), interview times, board meeting agenda, team roles, settings
- Med Control on Groq’s free tier, with Claude optional: daily briefing, chat, applicant brief, tailored interview questions, reply and email drafts, 150-call cap, privacy filter unchanged

**Not in the new screens yet**

- The full 36-question interview script (the new Interview tab has the core answers and the 1–5 score)
- One-click reference-link email, duplicate merge, bulk actions, first-visit tour, push opt-in, printable board packet, year-end report, and the recruiting-flyer QR (the QR encoder is ported in `src/lib/qr.ts`)

| Area | Where it lives |
|---|---|
| Owner, Full access, Admin, Coordinator, Interviewer, Member, Applicant, Paperwork vault | `resolveActor`, `canSeeApplicant`, `canEditPath`, `canReadVault` |
| 14 milestones, board-approved = Onboard, silent declines | `progress`, `laneOf`, `applicantSteps` |
| Med Control | `functions/medcontrol.js`, `src/desk/MedControl.tsx` |

| Area | Where it lives |
|---|---|
| Owner, Full access, Admin, Coordinator, Interviewer, Member, Applicant, Paperwork vault | `resolveActor`, `canSeeApplicant`, `canEditPath`, `canReadVault` |
| 14 milestones, 5 phases, board-approved = Onboard, silent declines | `progress`, `boardApproved`, `inOrient`, `applicantSteps` |
| 3 of 4 references, confidential labels, secure field roots | `refStatus`, `isConfidential`, `SECURE` |
| Home, sign-in (Google, email link, password, create account, forgot password, TOTP prompt, access request) | `src/pages/Public.tsx` |
| 7-step application, honeypot, local draft, `?src=flyer` | `src/pages/ApplyPage.tsx`, `src/lib/apply.ts` |
| Reference form, 1–5 ratings, one response | `src/pages/ReferencePage.tsx` |
| Pipeline board and list, KPI filters, search ⌘K | `src/desk/DeskApp.tsx` |
| Applicant file tabs, autosave, your-move action, interview score, vote, references, Sterling, checklist | `DeskApp.tsx` file tabs |
| Applicant portal: journey, next step, slot booking, uploads, messages, orientation, signing | `src/pages/PortalPage.tsx` |
| Confidential vault | `src/pages/VaultPage.tsx` |
| Channels (medical/SSN names blocked), team roles, settings, interview times, board meeting agenda | `DeskApp.tsx` |
| Med Control: briefing, chat, brief, questions, reply, email drafts, daily cap, Groq then optional Claude | `functions/medcontrol.js`, `src/desk/MedControl.tsx`, Settings → PVRS AI preferences |
| Push service worker and PWA manifest | `static/firebase-messaging-sw.js`, `static/manifest.webmanifest` |

Workflows that still write the same documents: `submissions`, `applicants` + `private/main`, `portal` + `portalEmails`, `slots`, `refLinks` / `refResponses`, `vault`, `channels`, `staff`, `accessRequests`, `settings/main`, `aiUsage`.

`npm test` covers milestones, reference rules, silent declines, portal leaks, and role gates. `npm run test:e2e` walks home, sign-in, the application, the pipeline, a file, messages, the portal, a declined portal, an interviewer, a member, and Med Control against an in-memory store. Nothing in those tests writes to production.
