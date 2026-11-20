# Security review (November 2026)

The GitHub repo is public. The app stores applicant names, contact details, driver's license numbers, reference answers, interview notes and confidential medical paperwork. Access is enforced in `firestore.rules` and `storage.rules`, not in the page. This review found no committed private key. It did not change who can read or write production data. One comment in the rules was corrected so it matches the rules.

## What was checked

- Tracked files for service-account JSON, private keys, `.env` files, SMTP passwords, Slack webhooks and API secrets.
- `public/js/config.js` (Firebase web config and the VAPID key).
- `firestore.rules` and `storage.rules`, including the public paths (`submissions` create, `refLinks` get).
- `functions/` for secrets declared in code (`SMTP_PASSWORD` is not declared while the paperwork email is off; `ANTHROPIC_API_KEY` is a Cloud Secret, not a file).
- `.gitignore` (now also ignores `.env`, PEM files and service-account JSON names).

## Not a leaked secret

`public/js/config.js` contains a Firebase **web API key** and a **VAPID** public key. Both are meant to ship in the browser. They identify the project. They do not bypass the security rules. The risk on a public repo is quota abuse and phishing pages that reuse the key, not a direct download of applicant files.

No `firebase-adminsdk` JSON, no `.env`, and no Anthropic, Slack or SMTP secret is in the tree.

## Rules, as they stand

These are intentional. They were not loosened or tightened, because tightening a public read would lock out reference links that are already in the field, and loosening anything would expose applicant data.

- Online applications (`submissions`) can be created without an account. The shape is strict: license number required, 3–4 references, a signed statement, a honeypot that must be empty, and a timestamp within ten minutes. Only the owner (and Full access) can read them.
- A reference link (`refLinks/{token}`) can be **read by anyone who has the exact id**. Listing is denied. The id is 18 random bytes. The document holds the applicant's name and the reference's name so the form can greet them. Answers live in `refResponses`, which only the owner can read.
- Confidential files (`vault`, Storage `confidential/`) can be opened by `orientationpaperwork@pvrs.org`, the owner, Full access, and staff whose role is exactly `admin`. The coordinator, interviewers, members and applicants cannot. Only the paperwork account can delete them. The old comment at the top of `firestore.rules` said the paperwork account was the only reader. That was wrong (it changed on 14 Nov 2026). The comment now matches the rules.
- Default for every other Storage path is deny.
- Staff with role `coordinator` can read applicant files the way an admin can, and can change scheduling fields only. That is the role as designed.
- Unverified email/password accounts fail `verified()` and cannot read the desk.

## What Dkota needs to do

These cannot be done from the repo.

1. **Make the GitHub repo private** if the squad is comfortable doing that. The code is not applicant data (`migration/` is git-ignored and is not in the repo), but a public repo shows the data model and the rules to anyone looking for a gap.
2. **Restrict the web API key.** Google Cloud → APIs & Services → Credentials → the browser key in `config.js`. Application restrictions: HTTP referrers `https://pvrs-membership.web.app/*`, `https://pvrs-membership.firebaseapp.com/*`, and any custom domain. Add a new host here before using it, or sign-in on that host breaks.
3. **Turn on Firebase App Check** (reCAPTCHA Enterprise or Cloudflare Turnstile) for Firestore, Storage and Functions, then enforce it after a week of monitoring. That blocks scripts that reuse the public key. The client does not send App Check tokens yet, so enforcing it before the client is updated will lock everyone out.
4. **Confirm `FIREBASE_SERVICE_ACCOUNT`** in GitHub Actions secrets is only in GitHub, not in a downloaded JSON still sitting in Downloads, and that its roles are the deploy roles in `docs/auto-deploy.md`. Rotate it if it was ever pasted into a chat or a ticket.
5. **Do not commit** an Admin SDK JSON, `.env`, or the Anthropic key. `.gitignore` now ignores the usual filenames. GitHub secret scanning should stay on.
6. **Paperwork email is off** (`PAPERWORK_EMAIL_ON` in `functions/index.js`) because pvrs.org cannot create a Google app password. Vault uploads do not email `orientationpaperwork@pvrs.org` until a mail provider that does not need an app password is chosen and the secret is set. Push notifications still fire for other events.
7. **Authorized domains.** Any preview URL (Firebase channel, Vercel, Cloudflare) must be added under Authentication → Settings → Authorized domains or Google and email-link sign-in will fail there. Production domains are already set.
8. **Two-step sign-in** still needs Identity Platform with TOTP enabled in the Firebase console before the in-app setup succeeds. See `docs/two-step-sign-in.md`.

No key in this repo needs to be rotated because none was committed. If a service-account JSON was ever emailed or attached to an old pull request outside the repo, rotate that key in Google Cloud → IAM → Service accounts. This review did not find one in the git tree.
