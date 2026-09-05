# Setup Guide — Connecting Supabase, Gemini, and Razorpay

Written for a first-time setup. Follow it top to bottom in order — each service
depends on nothing else, but the project needs all three to actually run for real.

---

## Before you start

You need **Node.js** installed (version 18 or higher). Check with:
```
node --version
```
If that fails, download it from nodejs.org (the "LTS" version) and install it
like any normal program.

You'll be editing one file called `.env` in a few steps. It's just a plain text
file — open it in any text editor (VS Code, Notepad, TextEdit, whatever you have).

---

## Part 1 — Supabase (your database)

Supabase gives you a free hosted Postgres database with a nice web dashboard.
Nothing to install on your computer.

### 1.1 Create an account and project
1. Go to **supabase.com** → click **Start your project** → sign in with GitHub
   (or email).
2. Click **New project**.
3. Fill in:
   - **Name**: anything, e.g. `revenue-recovery`
   - **Database Password**: generate one and **save it somewhere** (a password
     manager or a note) — you likely won't need it directly, but keep it safe.
   - **Region**: pick whichever is closest to you.
4. Click **Create new project**. It takes 1–2 minutes to spin up — wait for it.

### 1.2 Create the database tables
1. In the left sidebar of your new project, click the **SQL Editor** icon
   (looks like a terminal/database icon).
2. Click **New query**.
3. Open `backend/db/schema.sql` from this project in a text editor, select all
   the text, copy it.
4. Paste it into the Supabase SQL editor.
5. Click **Run** (or press Ctrl+Enter / Cmd+Enter).
6. You should see "Success. No rows returned." That means your `events` and
   `event_actions` tables now exist.

**Confirm it worked:** click **Table Editor** in the left sidebar — you should
see `events` and `event_actions` listed.

> **Already created these tables before?** This version of `schema.sql` adds
> three new columns (`source`, `order_id`, `last_attempt_at`) that fix real
> bugs in the guardrail logic. Instead of re-running the whole file (which
> would fail on tables that already exist), open `backend/db/schema.sql`,
> scroll to the "Migration note" comment block near the bottom, uncomment
> those `alter table` lines, and run just that block in the SQL Editor
> instead. Takes 10 seconds and keeps any data you already have.

### 1.3 Get your API credentials
1. Click the **gear icon (Settings)** in the left sidebar → **API**.
2. You need two values from this page:
   - **Project URL** — looks like `https://xxxxxxxxxxxx.supabase.co`
   - **service_role key** (under "Project API keys") — a long string starting
     with `eyJ...`. Click the eye icon to reveal it, then copy it.

   ⚠️ The service_role key bypasses all database security rules — never put it
   in frontend code or share it publicly. It only belongs in `backend/.env`.

3. Open `backend/.env` (copy from `backend/.env.example` first if you haven't)
   and fill in:
   ```
   SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJ...................
   ```

That's Supabase done.

---

## Part 2 — Gemini (the AI diagnosis engine)

### 2.1 Get an API key
1. Go to **aistudio.google.com**.
2. Sign in with a Google account.
3. Click **Get API key** (usually top-left or in a side menu).
4. Click **Create API key** → choose "Create API key in new project" if asked.
5. Copy the key that appears — it's a string starting with `AIza...`.

### 2.2 Add it to your project
Open `backend/.env` and add:
```
GEMINI_API_KEY=AIza...................
```

### 2.3 Free tier limits (worth knowing)
Google AI Studio's free tier has a request-per-minute cap. For a 50-event batch
run, if you hit a rate limit, the code already retries automatically with a
short delay (see `services/geminiClient.js`) — you don't need to do anything,
just let it run.

That's Gemini done — this is genuinely the fastest of the three to set up.

---

## Part 3 — Razorpay (test mode)

You only need this if you want to test with **real webhook events**. You can
run the entire project (seed data, dashboard, guardrails) without Razorpay at
all — the seed script generates realistic fake events. Set this up when you're
ready to test the live webhook path.

### 3.1 Create a test account
1. Go to **razorpay.com** → **Sign Up**.
2. Once logged in, look at the top of the dashboard — there's a toggle between
   **Test Mode** and **Live Mode**. Make sure it's set to **Test Mode**. You
   never need Live Mode for this project.

### 3.2 Get your API keys
1. Left sidebar → **Settings** → **API Keys**.
2. Click **Generate Test Key**.
3. Copy the **Key ID** and **Key Secret** shown (the secret is only shown once
   — copy it immediately).
4. Add to `backend/.env`:
   ```
   RAZORPAY_KEY_ID=rzp_test_...................
   RAZORPAY_KEY_SECRET=...................
   ```

### 3.3 Set up the webhook (needs ngrok — see Part 4 first)
Come back to this after Part 4, because you need a public URL first.
1. Left sidebar → **Settings** → **Webhooks** → **Add New Webhook**.
2. **Webhook URL**: your ngrok URL + `/webhook/razorpay`, e.g.
   `https://abcd1234.ngrok-free.app/webhook/razorpay`
3. **Active events**: check `subscription.charged`, `payment.failed`, and
   `order.paid`.
4. Set a **Secret** (any string you choose) → click **Create Webhook**.
5. Copy that same secret into `backend/.env`:
   ```
   RAZORPAY_WEBHOOK_SECRET=your-chosen-secret
   ```

---

## Part 4 — ngrok (only needed to test real Razorpay webhooks locally)

Razorpay needs a public URL to send webhooks to — your laptop running on
`localhost` isn't reachable from the internet. ngrok creates a temporary public
tunnel to your local server.

1. Go to **ngrok.com** → sign up (free).
2. Follow their **"Getting started"** page to download ngrok and run:
   ```
   ngrok config add-authtoken YOUR_TOKEN_HERE
   ```
   (your token is shown on their dashboard after signup)
3. With your backend running (`npm run dev` in the `backend/` folder, see Part 5),
   open a new terminal and run:
   ```
   ngrok http 4000
   ```
4. It prints a URL like `https://abcd1234.ngrok-free.app` — that's your public
   URL. Use it in Razorpay's webhook setup (Part 3.3).

⚠️ **Free ngrok URLs change every time you restart ngrok.** If you stop and
restart it, you'll need to update the webhook URL in Razorpay's dashboard again.

---

## Part 5 — Running the project

### 5.1 Backend
```
cd backend
npm install
npm run dev
```
Watch the terminal output — it prints a checklist of any missing credentials.
Once `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `GEMINI_API_KEY` are all
set, it should say `[env] all credentials present ✓`.

Visit `http://localhost:4000/health` in a browser — you should see
`{"ok":true,"service":"revenue-recovery-backend"}`.

### 5.2 Frontend
Open a **new terminal** (keep the backend running in the first one):
```
cd frontend
npm install
npm run dev
```
It prints a local URL, usually `http://localhost:5173` — open that in your
browser. You'll see the dashboard, empty until you seed data (next step).

### 5.3 Run the automated tests (proves the code itself is correct)
```
cd backend
npm test
```
Should print `9/9 guardrail tests passed` and `8/8 seed generator tests passed`.
These don't need any live credentials — they test the logic in isolation.

### 5.4 Seed demo data and run the full offline demo
This uses **synthetic data only** (tagged `source = seed_demo` in the
database) — no Razorpay account activity needed. Good for a reliable demo
even with no internet.
```
cd backend
npm run batch
```
This creates 50 synthetic events and runs them through the full pipeline
(diagnose → guardrail check → nudge → simulate customer response) across all 3
allowed attempts, then prints your real recovery-rate numbers. Refresh the
dashboard in your browser to see it all populate — demo rows are tagged
**"Demo"** in the Source column.

**Tip:** the guardrail's real cooldown is 4 hours between attempts. For a fast
demo, add this to `backend/.env` first:
```
COOLDOWN_HOURS=0.01
```
(≈36 seconds instead of 4 hours — remove this line before any real production use.)

---

## Part 6 — Generating real LIVE data

Everything above uses fake, synthetic data. This part walks through making
**genuine Razorpay Test Mode transactions** so real events flow through your
real webhook and get diagnosed by a real Gemini call — tagged `source =
live_webhook` / `live_poll` in the database and shown as **"Live"** on the
dashboard, kept visually separate from demo rows at every step.

You need Parts 1–4 done first (Supabase, Gemini, Razorpay keys, ngrok tunnel +
webhook configured and pointed at your running backend).

### 6.1 Start everything
In three separate terminals:
```
# Terminal 1
cd backend && npm run dev

# Terminal 2
ngrok http 4000

# Terminal 3
cd frontend && npm run dev
```
Confirm the ngrok URL shown in Terminal 2 matches what you saved as the
webhook URL in Razorpay's dashboard (Part 3.3). If you restarted ngrok since
then, update it there first — free ngrok URLs change every restart.

### 6.2 Trigger a real failed subscription payment
Razorpay publishes test card numbers that are *designed* to fail, so you can
generate a real failure webhook without spending real money:
1. In your Razorpay Test Mode dashboard, go to any of the standard "create a
   test payment link/order" flows (or use their hosted Checkout demo —
   search "Razorpay Checkout" from the dashboard's docs link).
2. When entering card details at checkout, use:
   - Card number: `4000 0000 0000 0002` (always declines)
   - Any future expiry date, any CVV
3. Complete the checkout attempt. Razorpay will send a `payment.failed`
   webhook to your ngrok URL.
4. Check Terminal 1 (backend) — you should see the webhook logged. Refresh
   the dashboard — a new row appears tagged **Live**.
5. Run the pipeline so it actually gets diagnosed and a nudge attempted:
   ```
   cd backend
   npm run pipeline
   ```

### 6.3 Trigger a real abandoned checkout
1. Create a test order/checkout the same way as above, but this time just
   **close the tab** without entering any payment details at all.
2. Razorpay doesn't fire a webhook for "nothing happened" — instead, run the
   abandonment scanner, which polls Razorpay's API directly for stale unpaid
   orders (default: older than 30 minutes — you can lower
   `ABANDONMENT_TIMEOUT_MINUTES` in `scripts/detectAbandonment.js` while
   testing):
   ```
   cd backend
   npm run live
   ```
   (this runs the abandonment scan, then one pipeline pass, in one command)

### 6.4 Confirm a real recovery
Go back and actually complete one of your test payments successfully this
time (card `4111 1111 1111 1111` always succeeds in Test Mode). Razorpay
fires an `order.paid` webhook, your backend matches it against the earlier
failed/abandoned event by `order_id`, and marks it recovered automatically —
watch the dashboard update within a few seconds.

### 6.5 What NOT to expect
- `npm run batch` and `simulate-recovery` only ever touch `source = seed_demo`
  rows — running them will never fake-recover or interfere with your real
  live events. Live events only change state from real Razorpay webhooks or
  the abandonment poller.
- With `MESSAGING_MODE=simulated` (the default), live nudges are logged to
  the audit trail but no real WhatsApp/email is sent — that's intentional
  until you connect Twilio/Resend. See `project-manual.md` for that setup.

---

## Part 7 — Protecting your live data once you share the dashboard URL

If you deploy this anywhere public (Render, Railway, Vercel, etc.), set:
```
# backend/.env
DASHBOARD_API_KEY=some-long-random-string-you-make-up

# frontend/.env
VITE_API_KEY=some-long-random-string-you-make-up   ← must match exactly
```
Without this, anyone who finds your backend URL can read all your revenue
data. Leave both blank for local development — the check is skipped
automatically when no key is set.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `[env]` checklist still shows missing keys after editing `.env` | Restart the server (`Ctrl+C` then `npm run dev` again) — `.env` is only read on startup |
| Dashboard shows a red banner / "could not reach backend" | Confirm the backend terminal is still running and shows no crash; confirm `frontend/.env` has the right `VITE_API_BASE_URL` |
| `npm install` fails | Make sure you're inside the right folder (`backend/` or `frontend/`) before running it |
| Webhook returns `400 invalid signature` | The `RAZORPAY_WEBHOOK_SECRET` in `.env` doesn't match what you set in Razorpay's dashboard — they must be identical |
| Gemini calls failing | Double check the key was copied in full (no missing characters); confirm you haven't hit the free-tier per-minute limit — the code retries automatically, just wait |
| ngrok webhook stopped working after restart | Free ngrok URLs change on every restart — update the URL in Razorpay's Webhooks settings |
| Dashboard shows `401 unauthorized` after you set `DASHBOARD_API_KEY` | `VITE_API_KEY` in `frontend/.env` must match it exactly, and you need to restart the frontend dev server after editing `.env` |
| A live test payment doesn't confirm as recovered | Confirm both the failure and the success webhook are for the *same* Test Mode order — matching is by `order_id`, so a brand-new order won't match an older failed one |

For anything else, see `project-manual.md` for the full architecture reference
and a wider troubleshooting table.
