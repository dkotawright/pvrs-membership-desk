# PVRS Membership Desk: setup guide

## Safe development and previews

The CLI defaults to **pvrs-membership-test**. The `production` alias points to
**pvrs-membership**. Always name the target project explicitly when deploying.
Production publishing requires the owner's explicit approval.

The website selects its backend by hostname:

| Address | Backend |
|---|---|
| `pvrs-membership.web.app`, `pvrs-membership.firebaseapp.com` | Production |
| `pvrs-membership-test.web.app`, `pvrs-membership-test.firebaseapp.com`, test-project preview channels | Test project |
| `localhost`, `127.0.0.1`, `[::1]` | Local emulators using `demo-pvrs-membership` |
| Any other address, including production preview channels | Blocked |

Add any future custom domain deliberately to `public/js/environment.js`, with
a test for its intended backend. Do not add a fallback to production.

Run `npm test` for environment isolation checks. GitHub's Checks workflow also
checks JavaScript syntax. These checks do not yet test security rules or browser
workflows. No automatic deployment workflow or deployment credentials are included.

For local development, install the Firebase CLI and the Java runtime required by
its emulators, then run `npm run emulators`. Local Firebase services do not fall
back to the online database. Use synthetic users and records only.

Before sharing cloud previews, finish these steps in **pvrs-membership-test**:

1. Enable Firestore in production mode, Authentication providers matching the
   live app, and Storage. Storage may require billing; approve that separately.
2. Deploy the checked-in Firestore indexes and Firestore/Storage rules to the
   test project only. Do not deploy the email function or copy its SMTP secret;
   use a mail sink or separate test mailbox before testing notifications.
3. Create synthetic test accounts for owner, admin, member, applicant, and
   paperwork roles. Verify both allowed access and denied cross-applicant,
   private-record, and confidential-document access. Never import live exports.
4. Deploy a preview with an explicit test target, for example:
   `firebase hosting:channel:deploy pr-1 --project pvrs-membership-test --expires 7d`.
   Authorize its exact hostname in test Authentication for Google/email-link
   sign-in. Preview URLs are shareable; only fake data belongs here.
5. For automated PR previews later, scope a separate deployment identity to the
   test project only. Keep production credentials out of PR workflows. Do not
   run untrusted fork code with deployment secrets.

Use a feature branch and pull request for every change. Merge after checks and
review; this does not deploy. Before an approved production release, check its
diff and back up production data if it includes migrations. Deploy Hosting only
with `firebase deploy --only hosting --project pvrs-membership`; rules, indexes,
and functions need their own explicit review and approval. Rebuild/select the
production backend deliberately: do not clone a staging artifact that embeds
test-only configuration. The previous Hosting release can be restored in the
Firebase console; a Hosting rollback does not restore rules or data.

The older setup and handoff notes below describe the original installation;
the explicit project targets and approval requirements above take precedence.

The Membership Desk is a web app hosted on Firebase. It has three kinds of access:

| Who | Signs in with | Sees |
|---|---|---|
| **You** (dkota@pvrs.org, owner) | Email + password (Google as backup) | Everything, including Settings, Team, backups and import. Only you can edit. |
| **Admins** (you choose) | Email + password, Google, or an emailed sign-in link | View every tab except Settings; can only fill in the interview questionnaire |
| **Members** (you choose) | Email + password, Google, or an emailed sign-in link | View the Application and Interview tabs; can only fill in the interview questionnaire |
| **Applicants** | An emailed sign-in link | Their own portal: status, document uploads and interview booking |

Firebase's servers enforce these permissions (`firestore.rules`, `storage.rules`). Nobody can get around them by editing the page.

---

## One-time setup (about 30 minutes)

### 1. Create the Firebase project
1. Go to **console.firebase.google.com** and sign in as **dkota@pvrs.org**.
2. Click **Create a project**. Name it something like `pvrs-membership`. Turn Google Analytics **off**.
3. In the bottom-left, click **Upgrade** and choose the **Blaze (pay as you go)** plan. File uploads require it.
   - Then go to **Google Cloud Billing → Budgets & alerts** and create a **$1 budget** with email alerts.
   - At PVRS's volume this should cost $0. The free allowance includes 5 GB of file storage, 50,000 database reads a day and 10 GB of hosting.

### 2. Turn on sign-in
1. **Build → Authentication → Get started.**
2. Open the **Sign-in method** tab.
3. Click **Email/Password**. Turn on **Email/Password**, **and also turn on "Email link (passwordless sign-in)"**, then save.
4. Click **Add new provider → Google**, enable it, set the support email to dkota@pvrs.org, then save.
5. Go to **Project settings** (the gear icon) → **General** and set **Public-facing name** to `Potsdam Volunteer Rescue Squad`. This name appears on the sign-in emails.

### 3. Create the database and file storage
1. **Build → Firestore Database → Create database.** Pick **Production mode** and location **nam5 (United States)**.
2. **Build → Storage → Get started.** Pick **Production mode** and the same location.

### 4. Connect this code to your project
1. **Project settings → General → Your apps.** Click the **web icon `</>`**, name it `PVRS Desk`, and click **Register app**.
2. Copy the `firebaseConfig` values it shows into **`public/js/config.js`**, replacing the `PASTE-…` / `YOUR-PROJECT-ID` placeholders.

### 5. Deploy from your computer
You need **Node.js**. Download the LTS version from nodejs.org and install it. Then open **Terminal** (Mac) or **Command Prompt** (Windows):

```bash
npm install -g firebase-tools
firebase login                    # sign in as dkota@pvrs.org
cd path/to/pvrs-membership-desk   # this folder
                                  # (project is already set to pvrs-membership)
firebase deploy --only hosting --project pvrs-membership # only after production approval
```

On the first deploy, Firebase asks whether Storage rules can read Firestore. Answer **Y**. Uploads depend on it.

When it finishes, it prints your web address, for example **https://pvrs-membership.web.app**. That address is the app.

### 6. First sign-in and moving your data over
1. Open the web address and click **Sign in with Google** as dkota@pvrs.org.
2. Open **Settings**, then **Backups → Import records** and choose **`migration/artifact-export.json`**. This brings over Georgia Thurmond's record from the Claude version.
3. Fill in your **email signature** and **default interview location**, then click **Save**.
4. Under **Team**, add each member's email. Use their pvrs.org address if they have one. Everyone starts as a **Member**; switch someone to **Admin** if they should see screening, the board and onboarding.

### 7. Test it before real applicants use it
1. Click **New** and add yourself as a test applicant, using a **personal** email (not dkota@pvrs.org).
2. Click **Send invite**, open the sign-in email on your phone, and check what an applicant sees.
3. Post a couple of times under **Interview times**, turn on **Let them book an interview**, and book one from your phone.
4. Request a document and upload a photo from your phone.
5. Delete the test applicant when you're done (**Notes → Delete**).

---

## Day-to-day

- **New application:** click **New**, then fill in the checklist as it comes in.
- **Portal access:** on the Application tab, click **Send invite**. Firebase emails them a sign-in link. A personal welcome email also opens for you to copy or send from Mail if you want.
- **Documents:** click **Request documents** and pick from the list or type your own. They show up in the applicant's portal with Upload buttons. Uploaded files appear on their file, and you click a file to open it. Click **Mark received** when it checks out.
- **Interviews:** add times under **Interview times** (for example 3 back-to-back 30-minute slots starting at 6:00 PM). Turn on **Let them book an interview** for an applicant, and they can book, change or cancel up to 24 hours before. You can also book or release a time for them from the Interview tab, with no 24-hour limit.
- **Board:** applicants the committee approved show up under the **Board queue** filter. **Copy board agenda** gives you a ready-to-paste list.
- **Status:** the applicant's portal updates automatically whenever you update their file. No status emails needed.
- **Backups:** once a month, go to **Settings → Full export** and save the file to the PVRS Google Drive.

## What applicants never see
MVR results, license details, reference answers, Sterling results, board votes, admin notes, and other applicants. Their portal only shows general steps ("Background and driving checks: in progress"), their own requested documents, and open interview times.

---

## Changing things

| Change | Where |
|---|---|
| Owner email | `public/js/config.js`, `firestore.rules` and `storage.rules` (all three), then `firebase deploy` |
| Logo | Replace `public/img/logo.png`, then `firebase deploy --only hosting` |
| Custom address (e.g. members.pvrs.org) | **Hosting → Add custom domain**. Then add the domain under **Authentication → Settings → Authorized domains** |
| Interview questions / checklist | `public/js/desk.js` (`tabHTML`) and `public/js/shared.js` (`MILESTONES`) |

## Handing it off
The project lives under dkota@pvrs.org. To hand the Desk to the next membership chair, add them as an **Owner** under **Project settings → Users and permissions**. Then change the owner email in the three files above and redeploy.

## Checking the security rules (optional)
In the Firebase console go to **Firestore → Rules → Rules Playground**. Simulate a **get** on `/applicants/ANY-ID/private/main` as an authenticated user with a non-staff email. It should be **denied**.

## Files
```
public/index.html        app shell
public/app.css           look and feel
public/js/config.js      your Firebase keys, owner email
public/js/main.js        sign-in and routing (owner / admin / member / applicant)
public/js/desk.js        the Membership Desk
public/js/portal.js      the applicant portal
public/js/shared.js      checklist, stages, applicant status steps
firestore.rules          who can read and write what
storage.rules            who can upload and open files
migration/               your record from the Claude version
```
