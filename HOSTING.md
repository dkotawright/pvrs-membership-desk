# Hosting

The website is a React app (`src/`, built by Vite into `dist/`). **Vercel** serves that frontend. **Firebase** stays the backend: Auth, Firestore, Storage, Cloud Messaging, and Cloud Functions. Existing applicant records, staff accounts, rules, and functions are unchanged.

## Connect this repo to Vercel

1. Sign in at [vercel.com](https://vercel.com) with the GitHub account that can see this private repo.
2. **Add New → Project** and import `dkotawright/pvrs-membership-desk`.
3. Framework preset: **Vite**. Build command: `npm run build`. Output directory: `dist`. Root directory: the repo root. No environment variables are required for the site itself (the Firebase web config is public and already in `src/lib/config.ts`).
4. Deploy. Every pull request gets its own preview URL. Open that URL on a phone to click through the desk before anything reaches production.
5. For the live site, add the custom domain in **Project → Settings → Domains** (for example `membership.pvrs.org`). Point DNS at Vercel the way the domain screen shows.

`vercel.json` already sends every app route to `index.html`, leaves static files alone, and sets the same security headers the desk has used.

## One Firebase Auth step

Firebase only accepts sign-in from domains you list.

1. Open [Firebase console](https://console.firebase.google.com) → project **pvrs-membership** → **Authentication** → **Settings** → **Authorized domains**.
2. Add the Vercel domain: the production domain, and `*.vercel.app` is not a wildcard, so add each preview host you actually use, or the production domain plus the project’s `*.vercel.app` hostname shown on the first deploy (the stable `your-project.vercel.app` domain).
3. Leave `pvrs-membership.web.app` and `pvrs-membership.firebaseapp.com` in the list. Email-link sign-in still uses those.

No database migration. The same Google, email-link, and password accounts keep working.

## Firebase Hosting still works

`firebase.json` serves `dist/`. GitHub Actions builds the site, then deploys hosting, rules, and functions on `main`. A Vercel preview does not touch production data.

Med Control setup (free Groq key, optional Claude) is in `docs/med-control.md`.
