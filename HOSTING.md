# Hosting

Production stays on **Firebase Hosting** for project `pvrs-membership` (`https://pvrs-membership.web.app`). This change does not deploy, and it does not point the live site anywhere else.

The app is a static site. Sign-in, the database, file storage and Cloud Functions stay on Firebase no matter which host serves the HTML. Moving the files does not move the data, and it does not require a data migration.

## What gets published

| Path | What it is |
|---|---|
| `public/` | The site Firebase Hosting serves today. GitHub Actions deploys this directory. There is no compile step. |
| `dist/` | A copy of `public/`, made by `npm run build`. Use it to preview, or to publish the same files to another static host. `dist/` is git-ignored. |

```bash
npm run build      # writes dist/
npm run preview    # serves dist/ at http://localhost:4173
```

Open `/` (home), `/apply`, `/signin`, and sign in. Routes such as `/apply` and `/ref/{code}` are rewritten to `index.html` by the host. The page then reads the path.

`npm test` runs the browser checks (`node tests/browser.test.mjs`). Install once with `npm install` inside `tests/`.

## Stay on Firebase Hosting (recommended)

Keep serving the site from Firebase Hosting.

- The live domains are already authorized for Firebase Auth. A new host is a new domain, and sign-in fails until that domain is added under Authentication → Settings → Authorized domains.
- Push notifications, the service worker, Storage downloads and callable functions are already tied to this project. They keep working on the current domains with no extra setup.
- One deploy publishes the site, the security rules and the functions. Splitting the HTML onto Vercel or Cloudflare means two deploys and two places for headers to drift.
- Preview channels (`firebase hosting:channel:deploy`) already give a throwaway URL on the same project.
- Cost at this squad's size is inside the Hosting free allowance. The project is on the Blaze plan because uploads need it, with a budget alert.

Deploy the way the repo already does: merge to `main` and let `.github/workflows/deploy.yml` run, or `firebase deploy --only hosting` when a manual publish is intended. Do not run a bare `firebase deploy` until the paperwork email secret exists (see `docs/auto-deploy.md`).

## If the HTML ever moves

Both configs below publish `dist/` (or `public/`, which is the same files) and send extension-less paths to `index.html`. Copy the security headers too. They match `firebase.json`: `X-Frame-Options: DENY`, `Referrer-Policy`, `X-Content-Type-Options: nosniff`, `Permissions-Policy` (no camera, microphone, location or payment), and `Cache-Control: no-cache` on HTML, CSS and JS so a phone picks up a fix on the next open.

### Vercel

`vercel.json` at the repo root sets the build to `npm run build`, the output to `dist/`, the SPA rewrite, and the headers. In the Vercel project, leave the framework preset empty. After the first deploy, add that domain to Firebase Auth authorized domains or Google sign-in and email-link sign-in will be rejected.

The rewrite skips paths that end in a file extension so `/js/main.js` and `/app.css` are files, while `/apply` and `/ref/…` load the app. If a script 404s, the rewrite is matching files: serve `dist/` as static and only rewrite the extension-less paths.

### Cloudflare Pages

Build command `npm run build`, output directory `dist`. `public/_headers` and `public/_redirects` are copied into `dist/` and Pages reads them. Same Auth domain step as Vercel.

Pages can also publish `public/` directly with no build. The headers and redirects are already in that folder.

## What not to move

Cloud Functions (`functions/`: push notifications, the morning reminder, Med Control, and the paused paperwork email) run in this Firebase project. Firestore and Storage rules deploy with Firebase, not with the static host. A static host that cannot run those deploys is only a place for the HTML, CSS and JavaScript.
