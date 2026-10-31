# Push notifications

Alerts on your phone or computer when:

| Event | Owner | Admins |
|---|---|---|
| New online application | ✓ | |
| Applicant sends a message | ✓ | |
| Interview booked or cancelled | ✓ | ✓ |
| A reference answers | ✓ | |
| Applicant uploads a document | ✓ | |

Alerts say who and what ("Jane Doe sent a message"), never the message itself or anything private.

## One-time setup (owner)

1. **Get the Web Push key.** Firebase console → ⚙ Project settings → **Cloud Messaging** tab → *Web configuration* → **Web Push certificates** → **Generate key pair**. Copy the long key it shows.
2. **Put it in the app.** Paste it into `public/js/config.js` as `VAPID_KEY = "…"` (or send it to Claude to do it). It's a public key, safe to commit.
3. **Deploy** from the project folder in Terminal:

```bash
firebase deploy --only hosting,firestore:rules,functions:push
```

`functions:push` deploys only the notification functions, so it works even though the paperwork email (SMTP) isn't set up.

## Turning them on (each person, each device)

- **Mac / PC:** in the desk, key button next to your name → **Notifications → Turn on**, and click **Allow** when the browser asks.
- **iPhone / iPad (iOS 16.4+):** open the desk in Safari → Share → **Add to Home Screen**. Open **PVRS Desk** from the Home Screen, sign in, then key button → Notifications → Turn on → Allow.
- Turn off: same place → **Turn off on this device**.

Also in ⌘K: type "notifications".
