# Backup restore drill

Backups run daily (kept 14 days) and weekly (kept 98 days). This drill proves they actually restore. It restores the latest backup into a **separate, temporary database** (`restore-drill`), so the live app is never touched. Then you check it and delete it. Do it once now and about once a year.

Cost: a few cents for the hour the copy exists.

## Steps (about 15 minutes, all in the browser)

1. Open Google's browser terminal: https://console.cloud.google.com/?project=pvrs-membership&cloudshell=true and wait for the terminal at the bottom.
2. Paste each command, one at a time, and press Return.

**See the backups:**

```bash
gcloud firestore backups list --location=nam5 --project=pvrs-membership
```

You should see several, each with a `name:` line ending in a long ID. The newest is at the top.

**Restore the newest one into a temporary database:**

```bash
BACKUP=$(gcloud firestore backups list --location=nam5 --project=pvrs-membership --format="value(name)" --sort-by=~snapshotTime --limit=1) && echo "$BACKUP" && gcloud firestore databases restore --source-backup="$BACKUP" --destination-database=restore-drill --project=pvrs-membership
```

It prints an operation ID. Restoring takes a few minutes for a database this size.

**Check that it finished:**

```bash
gcloud firestore operations list --database=restore-drill --project=pvrs-membership
```

Wait until it shows `done: true`.

3. **Look at the copy.** Open https://console.firebase.google.com/project/pvrs-membership/firestore. In the database picker at the top (it says `(default)`), choose **restore-drill**. Open `applicants` and check:
   - The number of applicants matches the desk (as of the backup's date).
   - Open one or two and check the fields look right, including `private/main`.

4. **Delete the copy** (important, it holds real applicant data):

```bash
gcloud firestore databases delete --database=restore-drill --project=pvrs-membership
```

Type `y` to confirm.

5. Write down the date you did the drill (e.g. in Settings → your notes, or here):
   - Last drill: ____

## In a real emergency
Same restore command, but restore into a new database, check it, then ask for help switching the app over (or restoring individual documents). Don't delete `(default)`.
