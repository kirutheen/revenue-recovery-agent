-- Revenue Recovery Agent — events table
-- Run this in the Supabase SQL editor (or via psql) before anything else.

create table if not exists events (
  id                  uuid primary key default gen_random_uuid(),
  event_type          text not null check (event_type in ('subscription_failed', 'checkout_abandoned')),
  raw_payload         jsonb not null,

  -- Where this row came from: a real Razorpay webhook, the abandonment
  -- poller hitting the real Razorpay API, or the synthetic seed generator.
  -- Lets the dashboard honestly separate live results from demo results.
  source              text not null default 'seed_demo' check (source in (
                          'live_webhook', 'live_poll', 'seed_demo'
                        )),

  -- Plain top-level order id, populated consistently for BOTH event types
  -- at insert time, so recovery-matching never has to dig through differently
  -- shaped raw_payload JSON per event type.
  order_id            text,

  diagnosed_reason    text check (diagnosed_reason in (
                          'card_expired', 'insufficient_funds', 'bank_timeout',
                          'silent_dropoff', 'unknown'
                        )),
  confidence          numeric(3,2),

  recommended_action  text check (recommended_action in (
                          'retry_payment', 'whatsapp_nudge', 'email_nudge',
                          'discount_offer', 'escalate_human'
                        )),

  action_taken        text,
  attempt_count        integer not null default 0,
  opted_out           boolean not null default false,

  status              text not null default 'pending' check (status in (
                          'pending', 'diagnosed', 'recovered', 'exhausted', 'escalated'
                        )),

  amount_at_risk      numeric(12,2) not null default 0,
  amount_recovered    numeric(12,2) not null default 0,

  customer_message    text,

  created_at          timestamptz not null default now(),
  -- Timestamp of the last AUDIT LOG entry of any kind (diagnosis, decision,
  -- action, recovery) — shown on the dashboard as "last activity".
  last_action_at      timestamptz,
  -- Timestamp of the last REAL customer-facing attempt (nudge sent /
  -- escalated). This is the ONLY field the cooldown guardrail reads —
  -- keeping it separate from last_action_at prevents diagnosis/logging
  -- events from ever being mistaken for an attempt.
  last_attempt_at     timestamptz
);

-- audit trail: one row per action taken on an event, in order
create table if not exists event_actions (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references events(id) on delete cascade,
  action       text not null,       -- e.g. 'diagnosed', 'whatsapp_nudge_sent', 'recovered', 'exhausted'
  detail       jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists idx_events_status on events(status);
create index if not exists idx_events_type on events(event_type);
create index if not exists idx_events_source on events(source);
create index if not exists idx_events_order_id on events(order_id);
create index if not exists idx_event_actions_event_id on event_actions(event_id);

-- Migration note (if you already have a live Supabase table from before
-- this change, run this block once instead of re-running the whole file):
--
-- alter table events add column if not exists source text not null default 'seed_demo'
--   check (source in ('live_webhook', 'live_poll', 'seed_demo'));
-- alter table events add column if not exists order_id text;
-- alter table events add column if not exists last_attempt_at timestamptz;
-- create index if not exists idx_events_source on events(source);
-- create index if not exists idx_events_order_id on events(order_id);
