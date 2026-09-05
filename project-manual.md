# Project Manual — AI Revenue Recovery Agent

Keep this open while you build. Refer back to it whenever something breaks or
you're unsure what a piece does.

---

## 1. How the whole system works (plain English)

```
Razorpay (test mode)
      │  fires a webhook when a payment fails
      ▼
Express webhook receiver  ──inserts a row──▶  events table (Supabase)
      │
      ▼
Diagnosis engine (Gemini)  ──"why did this fail, what should we do?"──▶  updates row
      │
      ▼
Guardrail layer (plain code, no AI)  ──"are we ALLOWED to act? attempts left? cooldown ok? opted out?"──▶  approves or blocks
      │
      ▼
Execution engine  ──sends nudge (simulated or real WhatsApp/email)──▶  logs to event_actions
      │
      ▼
Customer pays (or doesn't)
      │
      ▼
Recovery confirmation  ──marks recovered + amount──▶  OR after 3 tries → exhausted
      │
      ▼
React dashboard  ──reads events + metrics──▶  shows live numbers to you
```

**The one rule that matters most:** the diagnosis step (AI) decides *what's wrong
and what would help*. The guardrail step (plain code) decides *whether we're
actually allowed to act right now*. These are deliberately two separate pieces —
that's what makes the system "bounded and explainable" rather than an AI freely
messaging customers.

---

## 2. What each piece is responsible for

| Piece | File | Responsibility |
|---|---|---|
| Webhook receiver | `backend/routes/webhook.js` | Catches Razorpay events, verifies they're really from Razorpay, saves them |
| Abandonment detector | `backend/scripts/detectAbandonment.js` | Finds checkouts that silently died (no webhook fires for "nothing happened") |
| Diagnosis | `backend/services/diagnose.js` | Asks Gemini: what went wrong, what should we do |
| Guardrails | `backend/services/decide.js` | Enforces attempt limits, cooldowns, opt-outs — deterministic, no AI |
| Message writer | `backend/services/generateMessage.js` | Asks Gemini to write the actual customer text |
| Execution | `backend/services/execute.js` | "Sends" the message (simulated by default) |
| Recovery confirm | `backend/services/confirmRecovery.js` | Closes the loop when a customer actually pays |
| Orchestrator | `backend/scripts/runPipeline.js` | Runs all the above in order across pending events |
| Audit log | `backend/services/audit.js` | Records every single action taken, in order, per event |
| Read API | `backend/routes/events.js` | Feeds the dashboard |
| Dashboard | `frontend/src/components/*.jsx` | Shows you what's happening, live |

---

## 3. Where to get each credential

| Credential | Where | Free? | Needed for |
|---|---|---|---|
| `RAZORPAY_KEY_ID` / `SECRET` | Razorpay Dashboard → Settings → API Keys (switch to **Test Mode** first) | Yes | Webhook signature verification, subscription API |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay Dashboard → Settings → Webhooks → when you create the webhook | Yes | Verifying incoming webhooks are genuine |
| `SUPABASE_URL` / `SERVICE_ROLE_KEY` | supabase.com → your project → Settings → API | Yes (free tier) | Database |
| `GEMINI_API_KEY` | aistudio.google.com → Get API Key | Yes (free tier) | Diagnosis + message generation |
| ngrok authtoken | ngrok.com → dashboard | Yes | Exposing local server to Razorpay for webhook testing |
| Twilio (optional) | twilio.com → WhatsApp Sandbox | Yes (sandbox) | Only if you want real WhatsApp instead of simulated |
| Resend (optional) | resend.com | Yes (100/day) | Only if you want real email instead of simulated |

You do **not** need Twilio or Resend to have a complete, working project — simulated
messaging satisfies every requirement in the build spec.

---

## 4. Troubleshooting reference

| Symptom | Likely cause | Fix |
|---|---|---|
| Server won't start, `SUPABASE_URL` warning | `.env` not filled in yet | Fine during early dev; fill in `backend/.env` before testing DB writes |
| Webhook returns `400 invalid signature` | `RAZORPAY_WEBHOOK_SECRET` doesn't match what's set in Razorpay dashboard, or body wasn't raw | Double-check the secret matches exactly; confirm the route uses `express.raw()` not `express.json()` |
| Webhook never arrives from Razorpay | ngrok tunnel not running, or webhook URL in Razorpay dashboard is stale (ngrok URLs change every restart on free tier) | Restart ngrok, copy the new URL, update it in Razorpay Dashboard → Webhooks |
| Gemini call fails / returns non-JSON | Model added markdown fences (` ```json `) around the response, or hit a free-tier rate limit | Strip fences before `JSON.parse`; add a short delay/retry if rate-limited |
| Event stuck in `pending` forever | Pipeline orchestrator (`runPipeline.js`) isn't being run — nothing happens automatically unless you run it or schedule it | Run `node scripts/runPipeline.js` manually, or set up a cron/interval |
| Same event getting messaged repeatedly | Guardrail cooldown/attempt-count logic not being checked before `execute.js` runs | Confirm `decide.js` is called and its result is respected *before* calling `execute.js` — never skip straight to execution |
| Dashboard shows nothing / blank | Frontend pointing at wrong backend URL, or backend not running | Check `frontend/.env` or wherever the API base URL is set; confirm `http://localhost:4000/health` responds |
| Recovery rate looks suspiciously perfect (near 100%) | Seed data or recovery simulation isn't honest — check `seed.js` / `confirmRecovery.js` logic | This defeats the point of the project — deliberately keep the simulated recovery rate around 30–50%, as specified |
| `npm install` fails in Cursor's terminal | Wrong directory (root instead of `backend/` or `frontend/`) | `cd backend` or `cd frontend` first |

---

## 5. What "done" looks like (final checklist)

- [ ] Real Razorpay test-mode webhooks flowing into your backend
- [ ] 50+ event batch run end-to-end through detect → diagnose → decide → execute → log
- [ ] Measured, honest recovery rate (not cherry-picked)
- [ ] Guardrails visibly working — you can point to an event that hit max attempts
      and stopped
- [ ] Full audit trail visible per event in the dashboard
- [ ] README, architecture diagram, and (if applicable) demo video ready

---

## 6. How to ask Cursor for help on something new

Don't describe the whole project again — just give it the specific piece and
context, e.g.:
```
@backend/services/decide.js
This is blocking valid retries even when attempt_count is 1. Walk through the
cooldown logic and find the bug.
```
Referencing the exact file with `@` keeps the fix focused instead of triggering a
full rebuild.
