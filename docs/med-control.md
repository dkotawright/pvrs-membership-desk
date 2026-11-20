# Med Control

Med Control is the desk's assistant for the owner and anyone with Full access. It drafts and finds. It never sends, edits a file, or approves anyone.

Claude is the provider whenever `ANTHROPIC_API_KEY` is present. There is no Firestore switch. Groq answers a call only when Claude fails or is rate limited, or when the Claude key is absent.

| Job | What you get | Model |
|---|---|---|
| Daily briefing | What needs you today, with links into each file | Claude Haiku (`claude-haiku-5-5`) |
| Chat | Questions about the roster, agendas, email drafts | Claude Haiku (`claude-haiku-5-5`) |
| Applicant brief | One page for the committee, saved on the private record | Claude Sonnet (`claude-sonnet-5-5`) |
| Interview questions | Questions tailored to that person's membership type and background | Claude Sonnet (`claude-sonnet-5-5`) |
| Reply / email draft | Welcome, reference nudge, interview invite, no-show, check-in, or a portal reply. You review it, then you send it | Claude Haiku (`claude-haiku-5-5`) |

Chat text stays in the open panel only. Closing the panel, leaving the page, or Clear drops it. Nothing in the chat is written to Firestore, local storage, or the logs. The daily counter is the usage record. A saved applicant brief is the brief job, not the chat.

If Claude fails, that call is tried once on Groq (`openai/gpt-oss-20b` for fast jobs, `openai/gpt-oss-120b` for briefs and questions). A Groq rate limit still tries Groq's other free model once. Override ids with `ANTHROPIC_CHAT_MODEL`, `ANTHROPIC_BRIEF_MODEL`, `GROQ_FAST_MODEL`, and `GROQ_DEEP_MODEL` if a provider renames them.

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

## Claude is the default

Both keys are already on the project. The function uses Claude first whenever `ANTHROPIC_API_KEY` is bound. Groq is the fallback. No desk setting changes that.

```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
MEDCONTROL_SECRETS=groq,anthropic firebase deploy --only functions:ai
```

## Turning it off

Settings → Med Control off hides the assistant. Delete the key in the Groq console to cut it off completely.

## If something goes wrong

- *"isn't set up yet"*: the function is deployed but neither key is on the running service. Set `ANTHROPIC_API_KEY` and deploy again.
- *"API key isn't working"*: create a new Claude key and set the secret again. Groq still answers if Claude is down and `GROQ_API_KEY` is set.
- *"Daily limit is used up"*: it resets at midnight Eastern. The cap is `DAILY_LIMIT` in `functions/medcontrol.js`.
