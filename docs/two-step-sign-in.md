# Two-step sign-in (authenticator app)

Staff can add a 6-digit code from an authenticator app on top of their password or Google sign-in: key button next to your name → **Two-step sign-in → Set up**. Applicants (email link) are not affected.

The project has to allow it first. Do this once.

## 1. Upgrade Authentication to Identity Platform (free at PVRS's size)

1. Open https://console.firebase.google.com/project/pvrs-membership/authentication/settings
2. Find **Upgrade to Firebase Authentication with Identity Platform** and click **Upgrade**. Read the screen and confirm.
   - Free for the first 50,000 monthly users with email/Google sign-in. PVRS uses a few dozen.
   - Nothing about existing accounts or sign-in changes.

## 2. Switch on authenticator-app codes (TOTP)

There's no button for this. It's a single command, run in Google's browser terminal (no install needed):

1. Open https://console.cloud.google.com/?project=pvrs-membership&cloudshell=true and wait for the terminal at the bottom to load.
2. Paste this and press Return:

```bash
curl -s -X PATCH "https://identitytoolkit.googleapis.com/admin/v2/projects/pvrs-membership/config?updateMask=mfa" -H "Authorization: Bearer $(gcloud auth print-access-token)" -H "X-Goog-User-Project: pvrs-membership" -H "Content-Type: application/json" -d '{"mfa":{"providerConfigs":[{"state":"ENABLED","totpProviderConfig":{"adjacentIntervals":5}}]}}'
```

3. It prints the project's settings. Look for `"totpProviderConfig"` with `"state": "ENABLED"`. If it says "Authorize Cloud Shell", click Authorize and paste again.

## 3. Turn it on for yourself

1. Sign in to the desk, click the key button next to your name → **Two-step sign-in → Set up → Start**.
2. In your authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, or the iPhone **Passwords** app → Codes), add an account with **Enter a setup key**, and paste the key shown. On the phone itself, tap **Open in app** instead.
3. Type the 6-digit code the app shows → **Turn on**.

From then on, every sign-in asks for the code after your password or Google.

## If you lose your phone
- If you're still signed in somewhere: key button → Two-step sign-in → **Manage → Turn off**, then set it up again on the new phone.
- If you're locked out: Firebase console → Authentication → Users → find the account → ⋮ → there's no "remove second factor" button, so ask for help: an admin can remove the factor with the Admin SDK (`auth.updateUser(uid, { multiFactor: { enrolledFactors: [] } })`).
- Tip: when you set it up, also save the setup key in your password manager. Adding that key to a new phone's app gives the same codes.
