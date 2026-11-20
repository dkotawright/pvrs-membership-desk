# Feature parity

The React app in `src/` uses the same Firebase project, collections, and security rules. Nothing here migrates stored data.

| Workflow | Where |
|---|---|
| Eight roles and the privacy gates | `src/lib/domain.ts` |
| 14 milestones, board-approved = Onboard, silent declines | `progress`, `laneOf`, `applicantSteps` |
| Home, centered sign-in, 7-step application, reference form | `src/pages/Public.tsx`, `ApplyPage.tsx`, `ReferencePage.tsx` |
| Pipeline board and list, KPI cards, search, icon sidebar | `src/desk/DeskApp.tsx` |
| Full interview script, interview mode, impressions, no-show, calendar file, scores | `src/desk/interview.tsx` |
| Applicant file, checks, board vote, onboarding checklist, messages | `DeskApp.tsx` |
| Orientation board, trainer sign-offs, document library | `DeskApp.tsx` |
| Portal journey, next step, booking, uploads, secure vault routing, signing | `src/pages/PortalPage.tsx`, `VaultPage.tsx` |
| Printable board packet (no license number, score flagged under 3) | `printPacket` |
| Med Control on Groq, optional Claude, daily cap, privacy filter | `functions/medcontrol.js`, `src/desk/MedControl.tsx` |

Still thinner than the old desk, and called out so nothing is implied: one-click reference-link email, duplicate merge, bulk select, the recruiting flyer, the first-visit tour, and the push opt-in sheet. Their Firestore rules and stored fields are unchanged.
