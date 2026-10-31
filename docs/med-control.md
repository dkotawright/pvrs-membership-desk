# Med Control (the desk's AI assistant)

Med Control is Claude, built into the desk for the owner and admins (never members or applicants):

- **Chat** (sidebar → Med Control, or ⌘K "Med Control"): ask about applicants, deadlines and the board; ask for email drafts. Answers link to the applicant's file.
- **Brief** (Board tab → Make brief, owner only): a one-page summary, strengths, things to follow up on, interview questions and a reference digest. Admins can read it.
- **Draft a reply** (Messages tab → Draft with Med Control): writes an answer to the applicant's latest message into the reply box. Nothing is sent until you press Send.

## What it can and can't see
The server function (`functions/medcontrol.js`) loads the records and filters them **before** anything goes to the AI.

| Sent to the AI | Never sent |
|---|---|
| Names, membership type, stage, dates | Driver's license numbers |
| Interview answers (yes/no only on convictions) | Date and place of birth |
| Reference names, relationships and their answers | Addresses, phone numbers, emails |
| Check results (MVR yes/no, Sterling clear/review), board votes | Conviction explanations |
| Education, certifications, work history (no supervisor contacts) | Uploaded files and confidential paperwork |
| Admin notes | Reference contact details |

`tests/medcontrol-privacy.test.cjs` checks this filter (run `node tests/medcontrol-privacy.test.cjs`).

Anthropic doesn't train its models on data sent through the paid API by default. Still, **get the board/chief's OK before turning it on**, since applicant information leaves PVRS's systems.

## Cost
Claude Haiku 5.5 for chat and reply drafts, Claude Sonnet 5.5 for briefs. Roughly **$1–3 a month** at PVRS's volume. Each person is capped at 150 requests a day.

## One-time setup (owner)

1. **Board OK.** Get it in writing (meeting minutes are fine).
2. **Anthropic account.** Go to https://console.anthropic.com and sign up with dkota@pvrs.org.
   - **Billing:** add a payment method and $10 of credit.
   - **Limits:** set a monthly spend limit of $10 so it can never surprise you.
3. **API key.** In the console, open **API keys → Create key**. Name it `pvrs-med-control`, then copy it.
4. **Store the key as a secret.** In Terminal, from the project folder, run this and paste the key when it asks:

```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
```

5. **Deploy the function:**

```bash
firebase deploy --only functions:ai
```

6. **Switch it on.** In the desk, go to **Settings → Med Control → On → Save**. The Med Control button appears in the sidebar for you and admins.

## Turning it off
Settings → Med Control → Off hides it everywhere right away. To cut access completely, delete the key in the Anthropic console.

## If something goes wrong
- *"Med Control isn't set up yet"*: the function isn't deployed (step 5).
- *"API key isn't working"*: re-run step 4 with a fresh key, then step 5.
- *"Daily limit is used up"*: wait until midnight, or raise `DAILY_LIMIT` in `functions/medcontrol.js`.
