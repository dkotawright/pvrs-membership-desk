# Med Control

Med Control is the desk's assistant for the owner and anyone with Full access. It drafts and finds. It never sends, edits a file, or approves anyone.

It runs on **Groq's free tier** by default (no credit card, OpenAI-compatible API, Zero Data Retention available). **Claude is optional** if `ANTHROPIC_API_KEY` is also set. Groq is used whenever its key is present.

| Job | What you get | Model |
|---|---|---|
| Daily briefing | What needs you today, with links into each file | Fast (`openai/gpt-oss-20b`) |
| Chat | Questions about the roster, agendas, email drafts | Fast |
| Applicant brief | One page for the committee, saved on the private record | Deep (`openai/gpt-oss-120b`) |
| Interview questions | Questions tailored to that person's membership type and background | Deep |
| Reply / email draft | Welcome, reference nudge, interview invite, no-show, check-in, or a portal reply. You review it, then you send it | Fast |

If a model hits Groq's rate limit, the function tries the other free model once. Override the ids with `GROQ_FAST_MODEL` and `GROQ_DEEP_MODEL` if Groq renames them.

Each person is capped at **150 calls a day** (`aiUsage/{email}_{day}`). The usage check itself does not count.

## What the model is allowed to see

`safeApplicant` in `functions/medcontrol.js` builds the record **before** any request leaves PVRS. `tests/medcontrol-privacy.test.cjs` guards it.

Sent: names, membership type, stage, dates, interview answers (yes/no only on convictions), reference names and their answers, check results, board votes, education, certifications, work history without supervisor contacts, admin notes.

Never sent: driver's license numbers, date or place of birth, addresses, phone numbers, emails, conviction explanations, reference contact details, uploaded files, confidential vault items.

## Two-minute Groq setup

1. Create a free account at [console.groq.com](https://console.groq.com). No credit card.
2. Open **Settings → Data controls** and turn on **Zero Data Retention**.
3. **API keys → Create API key**. Copy it.
4. From this folder:

```bash
firebase functions:secrets:set GROQ_API_KEY
```

5. Deploy the function. If the Claude secret is not set, tell the deploy to bind Groq only:

```bash
MEDCONTROL_SECRETS=groq firebase deploy --only functions:ai
```

GitHub Actions checks which of `GROQ_API_KEY` and `ANTHROPIC_API_KEY` exist and binds only those, so a missing Claude key does not fail the deploy.

6. In the desk, **Settings → PVRS AI preferences → Med Control on**. The button in the top bar (and ⌘J) opens the assistant. The same screen shows today's count, `n / 150`, and which provider answered.

## Optional Claude

If you already have an Anthropic key:

```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
MEDCONTROL_SECRETS=groq,anthropic firebase deploy --only functions:ai
```

Groq still wins when both keys are present. Claude is the fallback only when `GROQ_API_KEY` is empty.

## Turning it off

Settings → Med Control off hides the assistant. Delete the key in the Groq console to cut it off completely.

## If something goes wrong

- *"isn't set up yet"*: the function is deployed but neither key is on the running service. Set `GROQ_API_KEY` and deploy again.
- *"API key isn't working"*: create a new Groq key and set the secret again.
- *"Daily limit is used up"*: it resets at midnight Eastern. The cap is `DAILY_LIMIT` in `functions/medcontrol.js`.
