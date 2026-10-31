# Auto-deploy from GitHub

After this one-time setup, every change merged into `main` on GitHub is tested and goes live by itself: website, Firestore rules and Storage rules. No Terminal needed. If the tests fail, nothing deploys.

Watch it run: https://github.com/dkotawright/pvrs-membership-desk/actions

## One-time setup (about 10 minutes)

### 1. Make a deploy key in Google Cloud
1. Open https://console.cloud.google.com/iam-admin/serviceaccounts?project=pvrs-membership
2. **+ Create service account**. Name: `github-deploy`. Click **Create and continue**.
3. Add these roles, one at a time (type each name in the role box):
   - **Firebase Hosting Admin**
   - **Firebase Rules Admin**
   - **Service Usage Consumer**
   - **API Keys Viewer**
4. **Continue → Done**.
5. Click the new `github-deploy` account → **Keys** tab → **Add key → Create new key → JSON → Create**. A `.json` file downloads.

### 2. Give the key to GitHub
1. Open https://github.com/dkotawright/pvrs-membership-desk/settings/secrets/actions
2. **New repository secret**. Name: `FIREBASE_SERVICE_ACCOUNT`. Value: open the downloaded `.json` file in TextEdit, select all, copy, paste.
3. **Add secret**, then **delete the downloaded `.json` file** from your Mac (and empty the Trash). GitHub keeps the only copy it needs.

### 3. Try it
GitHub → **Actions** → **Test and deploy** → **Run workflow**. Green check = live.

## What it doesn't deploy
Cloud Functions (notifications, paperwork email). Deploy those by hand when they change:

```bash
firebase deploy --only functions:push
```

## If you need to stop it
GitHub → Actions → Test and deploy → ⋯ → **Disable workflow**. To revoke access completely, delete the `github-deploy` service account's key in Google Cloud.
