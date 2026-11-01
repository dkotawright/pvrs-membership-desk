# Auto-deploy from GitHub (no computer setup needed)

After this one-time setup, every change merged into `main` on GitHub is tested and goes live by itself: the website, Firestore and Storage rules, notifications and Med Control. If the tests fail, nothing deploys. Everything below happens in a web browser.

Watch it run: https://github.com/dkotawright/pvrs-membership-desk/actions

Sign in to Google with the account that owns the Firebase project (your personal Google account, the one you use for the Firebase console).

## 1. Make a deploy account in Google Cloud
1. Open https://console.cloud.google.com/iam-admin/serviceaccounts?project=pvrs-membership
2. Click **+ Create service account**. Name: `github-deploy`. Click **Create and continue**.
3. Add these roles. Click **+ Add another role** for each one and type its name in the box:
   - **Firebase Admin**
   - **Cloud Functions Admin**
   - **Service Account User**
   - **Secret Manager Admin**
   - **Service Usage Admin**
   - **Cloud Build Editor**
   - **Artifact Registry Administrator**
4. Click **Continue → Done**.

## 2. Make its key
1. In the list, click **github-deploy** → **Keys** tab → **Add key → Create new key → JSON → Create**.
2. A `.json` file downloads. Keep this tab open for the next step.

## 3. Give the key to GitHub
1. Open https://github.com/dkotawright/pvrs-membership-desk/settings/secrets/actions
2. Click **New repository secret**. Name: `FIREBASE_SERVICE_ACCOUNT`.
3. Open the downloaded `.json` file (double-click opens it in TextEdit), select all (⌘A), copy (⌘C), and paste it into **Secret**. Click **Add secret**.
4. **Delete the downloaded `.json` file** and empty the Trash. GitHub now has the only copy it needs.

## 4. Store the Med Control key
1. Open https://console.cloud.google.com/security/secret-manager?project=pvrs-membership. If it asks to enable the Secret Manager API, click **Enable**.
2. Click **+ Create secret**. Name: `ANTHROPIC_API_KEY` (exactly like that).
3. **Secret value**: paste your Anthropic API key. Click **Create secret**.

Never paste the key into a chat or an email.

## 5. Go live
Merge the pull request with the changes into `main` (GitHub app → Pull requests → open it → **Merge**). GitHub runs the tests and deploys. The first deploy of the server functions takes about 5–10 minutes.

## What it doesn't deploy
The paperwork email function (`notifyPaperwork`) waits until an email password exists (see CLAUDE.md, Server-side email).

## If you need to stop it
GitHub → Actions → Test and deploy → ⋯ → **Disable workflow**. To revoke access completely, delete the `github-deploy` key in Google Cloud (IAM → Service accounts → github-deploy → Keys).
