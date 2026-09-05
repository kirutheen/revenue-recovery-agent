# Changelog — audit fixes + live data support

## Critical fixes

- **Cooldown bug fixed.** `last_action_at` was being bumped by every audit
  log entry (including diagnosis), which meant the guardrail's cooldown check
  saw a "just happened" timestamp immediately after diagnosis and blocked
  every event from ever getting a real attempt. Added a separate
  `last_attempt_at` column that is ONLY set by real customer-facing sends
  (`action_executed`, `escalated_to_human`); `decide.js` now reads that
  instead. Added a regression test (`tests/decide.test.js`) that fails if
  this ever regresses.
  Files: `services/audit.js`, `services/decide.js`, `db/schema.sql`,
  `tests/decide.test.js`.

- **Subscription recovery-matching bug fixed.** Recovery matching used to
  query `raw_payload->>id`, which only existed for checkout-abandonment
  events, not subscription-failure events (different JSON shape). Added a
  plain `order_id` column populated consistently at insert time for both
  event types, and switched matching to use it.
  Files: `routes/webhook.js`, `scripts/detectAbandonment.js`, `scripts/seed.js`,
  `db/schema.sql`.

## Live data support (new)

- Added an `events.source` column: `live_webhook`, `live_poll`, or
  `seed_demo`. Populated automatically wherever events are created.
- `/api/events` and `/api/events/metrics` now support filtering/splitting by
  source (`?source=...`, and a `by_source` breakdown in metrics).
- `simulateRecoveries.js` (the fake-payment simulator) is now hard-restricted
  to `source = 'seed_demo'` — it can never mark a real live event as
  recovered.
- Dashboard: new `SourceBadge` component shown in the events table, the audit
  trail modal, and a new source filter dropdown. `MetricStrip` shows a note
  splitting live vs. demo totals when both exist.
- New `npm run live` script (abandonment scan + one pipeline pass) for
  quickly pulling in real Razorpay Test Mode data.
- See `SETUP-GUIDE.md` Part 6 for a full walkthrough of generating genuine
  Razorpay Test Mode transactions (using their standard test card numbers)
  to produce real live events end-to-end.

## Security hardening

- Added `helmet` for standard security headers.
- Added optional shared-secret auth (`DASHBOARD_API_KEY` / `VITE_API_KEY`)
  on `/api/events/*` — off by default locally, with a loud startup warning if
  missing on what looks like a deployed server.
- `validateEnv.js` now also warns loudly if `RAZORPAY_WEBHOOK_SECRET` is
  missing on a deployed server (previously silent).

## Housekeeping

- Added `twilio` as a real dependency (was dynamically imported but never
  listed, so `MESSAGING_MODE=twilio` would silently fail without a manual
  `npm install twilio`).
- Filled in `.env.example` gaps: `FRONTEND_URL`, `DASHBOARD_API_KEY`
  (backend), `VITE_API_KEY` (frontend).
- Removed a dead unused variable in `webhook.js`.
- `README.md` test count updated (9/9, was 8/8 before the new regression test).

## If you already created Supabase tables from the old schema

Don't re-run all of `db/schema.sql` — it will error on tables that already
exist. Instead run just the `alter table` migration block near the bottom of
that file (it's commented out — uncomment and run just those lines in the
Supabase SQL Editor). Takes 10 seconds, keeps existing data.

## Verified before handing back

- `npm test` in `backend/` → 9/9 guardrail tests + 8/8 seed tests passing.
- `npm run build` in `frontend/` → builds cleanly, no errors.
- Every backend `.js` file passes `node --check` (syntax-valid).
