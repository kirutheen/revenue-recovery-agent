import { supabase } from '../db/supabase.js';

// Only THESE actions count as a real customer-facing attempt. This list is
// what the cooldown guardrail in decide.js is actually protecting against —
// spamming a customer too often. Diagnosis, decision logging, etc. are just
// internal bookkeeping and must NEVER reset the cooldown clock.
const ATTEMPT_ACTIONS = new Set(['action_executed', 'escalated_to_human']);

/**
 * Records one row in event_actions for a given event, and always bumps
 * last_action_at (used for the dashboard's "last activity" display only).
 * Only bumps last_attempt_at — which the cooldown guardrail reads — when
 * `action` is a real customer-facing attempt (see ATTEMPT_ACTIONS above).
 * Every meaningful step in the pipeline (received, diagnosed, nudge_sent, recovered,
 * exhausted, escalated) should call this so the dashboard can show a full audit trail.
 */
export async function logAction(eventId, action, detail = {}) {
  const { error: actionError } = await supabase
    .from('event_actions')
    .insert({ event_id: eventId, action, detail });

  if (actionError) {
    console.error('[audit] failed to log action:', actionError.message);
  }

  const now = new Date().toISOString();
  const update = { last_action_at: now };
  if (ATTEMPT_ACTIONS.has(action)) {
    update.last_attempt_at = now;
  }

  const { error: updateError } = await supabase
    .from('events')
    .update(update)
    .eq('id', eventId);

  if (updateError) {
    console.error('[audit] failed to update event timestamps:', updateError.message);
  }
}
