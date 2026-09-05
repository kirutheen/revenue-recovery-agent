import { supabase } from '../db/supabase.js';
import { logAction } from './audit.js';

// ── Tunable constants — the actual "bounded, explainable" guardrails ────────
export const MAX_ATTEMPTS = 3;
// Configurable via env for fast demo/test runs (e.g. COOLDOWN_HOURS=0.01 for a
// ~36-second cooldown while testing). Defaults to the real 4-hour policy.
export const COOLDOWN_HOURS = Number(process.env.COOLDOWN_HOURS) || 4;
// ─────────────────────────────────────────────────────────────────────────

const COOLDOWN_MS = COOLDOWN_HOURS * 60 * 60 * 1000;

/**
 * Deterministic decision: given a diagnosed event, decide whether we are
 * ALLOWED to act right now, and if so, what happens if we don't act
 * (exhausted) or shouldn't ever act again (escalated due to opt-out).
 *
 * This function makes NO network calls and NO AI calls — it is pure,
 * predictable, and testable in isolation. That's intentional: money-related
 * actions must be governed by code a human can fully audit, not by another
 * model's judgment call.
 *
 * Returns one of:
 *   { proceed: true,  action: <recommended_action> }
 *   { proceed: false, reason: 'opted_out' | 'cooldown_active' | 'attempts_exhausted' | 'not_diagnosed' }
 */
export function decide(event) {
  if (event.status !== 'diagnosed' && event.status !== 'pending') {
    // Already recovered / exhausted / escalated — nothing to decide
    return { proceed: false, reason: `status_is_${event.status}` };
  }

  if (event.opted_out) {
    return { proceed: false, reason: 'opted_out' };
  }

  if (!event.diagnosed_reason || !event.recommended_action) {
    return { proceed: false, reason: 'not_diagnosed' };
  }

  if (event.attempt_count >= MAX_ATTEMPTS) {
    return { proceed: false, reason: 'attempts_exhausted' };
  }

  // IMPORTANT: this reads last_attempt_at (set only by a real customer-facing
  // send in audit.js), never last_action_at (which also gets bumped by
  // diagnosis/logging steps). Reading the wrong field here was the bug that
  // previously made every event get stuck in cooldown forever.
  if (event.last_attempt_at) {
    const elapsedMs = Date.now() - new Date(event.last_attempt_at).getTime();
    if (elapsedMs < COOLDOWN_MS) {
      return { proceed: false, reason: 'cooldown_active' };
    }
  }

  return { proceed: true, action: event.recommended_action };
}

/**
 * Applies the decision to the database: marks escalated / exhausted where
 * applicable, and logs every decision (even "do nothing" ones) to the audit
 * trail so the reasoning is fully traceable later.
 *
 * Returns the decision object plus what state change (if any) was applied.
 */
export async function applyDecision(event) {
  const decision = decide(event);

  if (decision.proceed) {
    await logAction(event.id, 'decision_proceed', { action: decision.action });
    return decision;
  }

  // Not proceeding — figure out if this needs a status change
  if (decision.reason === 'opted_out') {
    await supabase.from('events').update({ status: 'escalated' }).eq('id', event.id);
    await logAction(event.id, 'decision_escalated', { reason: 'opted_out' });
  } else if (decision.reason === 'attempts_exhausted') {
    await supabase.from('events').update({ status: 'exhausted' }).eq('id', event.id);
    await logAction(event.id, 'decision_exhausted', {
      reason: 'attempts_exhausted',
      attempt_count: event.attempt_count,
    });
  } else if (decision.reason === 'cooldown_active') {
    await logAction(event.id, 'decision_wait', { reason: 'cooldown_active' });
  } else {
    await logAction(event.id, 'decision_blocked', { reason: decision.reason });
  }

  return decision;
}
