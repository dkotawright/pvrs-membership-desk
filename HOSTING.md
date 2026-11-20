# Hosting

The website is a React app (`src/`, built by Vite into `dist/`). **Firebase Hosting** is the only host. Firebase is also the backend: Auth, Firestore, Storage, Cloud Messaging, and Cloud Functions. Existing applicant records, staff accounts, rules, and functions are unchanged.

Live site: https://pvrs-membership.web.app

## Live deploys

Merging into `main` runs `.github/workflows/deploy.yml`. That workflow tests the app, then deploys **hosting, Firestore rules, Storage rules, and the push and Med Control functions** to the live channel. It uses the repo secret `FIREBASE_SERVICE_ACCOUNT` (the `github-deploy` service account). Setup is in `docs/auto-deploy.md`.

`firebase.json` serves `dist/` and sends app routes to `index.html`.

## Preview links on a pull request

A pull request from this same repository runs `.github/workflows/preview.yml`. It builds the app and deploys **only Hosting** to a preview channel named `pr-<number>` (for example `pr-53`). The channel expires after 7 days. The workflow comments the preview URL on the pull request.

That job never deploys rules, functions, or the live channel. A pull request from a fork is skipped, because it cannot use the deploy secret.

The preview is another copy of the website. It still talks to the live Auth, Firestore, and Storage in project `pvrs-membership`. Trying a preview with a real applicant changes the real record.

## Sign-in on a preview

Sign-in does **not** work on a preview until that preview’s exact hostname is listed under Firebase Authentication.

A preview URL looks like `https://pvrs-membership--pr-53-abcd1234.web.app`. The random ending stays the same for as long as that channel exists. A new pull request gets a new hostname.

1. Open [Firebase console](https://console.firebase.google.com) → project **pvrs-membership** → **Authentication** → **Settings** → **Authorized domains**.
2. Add the hostname only, with no `https://` and no path. Example: `pvrs-membership--pr-53-abcd1234.web.app`.
3. There is no wildcard. `*.web.app` cannot be added. Each preview host is its own line.

Leave `pvrs-membership.web.app` and `pvrs-membership.firebaseapp.com` in the list. Those are the live site. Email-link sign-in and Google sign-in both check this list.
