# Calendar feed

A private link that Apple Calendar or Google Calendar checks for booked interview and orientation times.

- **Turn it on:** Desk → Settings → Calendar feed → **Make a link**, then **Copy link** or **Subscribe on this device**.
  - Apple Calendar: File → New Calendar Subscription → paste.
  - Google Calendar: Other calendars → **+** → From URL → paste.
- **What it shows:** "Interview: G.T." or "Orientation: G.T.", with the time and place. Initials only: no names, emails, phone numbers, results or notes.
- **Who can see it:** anyone who has the link. If it gets shared by mistake, use **Make a new link** (the old one stops working right away) or **Turn off**.
- **Cost:** free on the current plan (a few requests an hour).

## If the deploy log says the feed failed

The deploy step "Deploy calendar feed" may fail the first time with a permission error about making the function public (`setIamPolicy` / `run.services.setIamPolicy`). The rest of the site is already live when this happens. To fix it once:

1. Google Cloud console → IAM → find `github-deploy@pvrs-membership.iam.gserviceaccount.com` → Edit.
2. Add the role **Cloud Run Admin**, then Save.
3. GitHub → Actions → "Test and deploy" → Run workflow.

Until then, Settings shows a link that answers "not found".
