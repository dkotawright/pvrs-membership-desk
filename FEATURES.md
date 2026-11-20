# Feature parity

The React app in `src/` uses the same Firebase project, collections, and security rules. Nothing here migrates stored data.

| Workflow | Where |
|---|---|
| Eight roles and the privacy gates | `src/lib/domain.ts` |
| 14 milestones, board-approved = Onboard, silent declines | `progress`, `laneOf`, `applicantSteps` |
| Home, centered sign-in, 7-step application, reference form | `src/pages` |
| Pipeline board and list, KPI cards, ⌘K palette, icon sidebar | `src/desk/DeskApp.tsx` |
| Interview script, interview mode, impressions, no-show, calendar, scores | `src/desk/interview.tsx` |
| Reference email link, copy link, nudge, ask for a new one, view answers, email all | Checks tab |
| Duplicate detection, dismiss, and merge when neither file has portal access | `DupeBanner` |
| Bulk select: assign, message, email references | `BulkBar` |
| Orientation board, trainer sign-offs, document library, board packet print | `DeskApp.tsx` |
| Recruiting flyer with a QR code to `/apply?src=flyer` | `Flyer` on Reports |
| First-visit tour, replay from search | `Tour` |
| Notifications drawer and on-device alert opt-in | `NotifySheet` |
| Portal, secure uploads, vault, signing | `PortalPage.tsx`, `VaultPage.tsx` |
| Med Control on Groq, optional Claude, daily cap, privacy filter | `functions/medcontrol.js` |
