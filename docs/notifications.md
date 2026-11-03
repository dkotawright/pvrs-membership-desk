# Notifications

Alerts from the PVRS Membership Desk itself, on your Mac (corner of the screen) or iPhone (lock screen). Tapping one opens that applicant's file.

| Event | Owner | Admins |
|---|---|---|
| New online application | ✓ | |
| A reference check is answered | ✓ | |
| All 3 references are in | ✓ | |
| A page is marked complete (Application, Checks, Interview, Board, Onboard) | ✓ | |
| Interview booked or cancelled | ✓ | ✓ |
| Applicant sends a message or uploads a document | ✓ | |
| Someone asks for desk access | ✓ | |

Alerts say who and what ("Duke McCauley answered for Jack Gradzewicz"), never message text, reference answers, license numbers or documents.

## One-time setup (owner, in the browser)

1. Firebase console → ⚙ **Project settings** → **Cloud Messaging** tab → *Web configuration* → **Web Push certificates** → **Generate key pair**.
2. Copy the long key it shows and send it to Claude, who puts it in `public/js/config.js` as `VAPID_KEY`. It's a public key, safe to share and commit.
3. Merge the pull request. GitHub deploys the site and the `push` functions.

## Turning them on (each person, each device)

- **Mac:** in the desk, ⌘K → type "notifications" → **Turn on**, and click **Allow** when asked. (Also: key button next to your name → Notifications.)
- **iPhone / iPad (iOS 16.4+):** open https://pvrs-membership.web.app in Safari → Share → **Add to Home Screen**. Open the desk from the Home Screen, sign in, then **More → Notifications → Turn on → Allow**.
- To stop: same place → **Turn off on this device**.
