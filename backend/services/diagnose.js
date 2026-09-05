import { supabase } from '../db/supabase.js';
import { askGeminiForJSON } from './geminiClient.js';
import { logAction } from './audit.js';

const VALID_REASONS = ['card_expired', 'insufficient_funds', 'bank_timeout', 'silent_dropoff', 'unknown'];
const VALID_ACTIONS = ['retry_payment', 'whatsapp_nudge', 'email_nudge', 'discount_offer', 'escalate_human'];

function buildPrompt(payload) {
  return `You are a revenue recovery diagnosis agent for a fintech merchant.

Given this payment/subscription event payload, respond ONLY with JSON:
{
  "diagnosed_reason": one of ["card_expired","insufficient_funds","bank_timeout","silent_dropoff","unknown"],
  "recommended_action": one of ["retry_payment","whatsapp_nudge","email_nudge","discount_offer","escalate_human"],
  "confidence": a number 0-1,
  "customer_message": a short, polite recovery message (max 40 words) inviting the customer to complete payment, referencing the specific issue if relevant
}

Event payload:
${JSON.stringify(payload)}`;
}

/**
 * Diagnoses a single event row: calls Gemini, validates the response against
 * the known enum values (never trusts the model blindly), updates the row,
 * and logs the diagnosis to the audit trail.
 */
export async function diagnoseEvent(event) {
  const prompt = buildPrompt(event.raw_payload);

  let result;
  try {
    result = await askGeminiForJSON(prompt);
  } catch (err) {
    console.error(`[diagnose] Gemini call failed for event ${event.id}:`, err.message);
    // Fail safe: mark as unknown/escalate rather than leaving it silently stuck
    result = {
      diagnosed_reason: 'unknown',
      recommended_action: 'escalate_human',
      confidence: 0,
      customer_message: '',
    };
  }

  const diagnosed_reason = VALID_REASONS.includes(result.diagnosed_reason)
    ? result.diagnosed_reason
    : 'unknown';
  const recommended_action = VALID_ACTIONS.includes(result.recommended_action)
    ? result.recommended_action
    : 'escalate_human';
  const confidence = typeof result.confidence === 'number'
    ? Math.max(0, Math.min(1, result.confidence))
    : 0;
  const customer_message = typeof result.customer_message === 'string'
    ? result.customer_message.slice(0, 500)
    : '';

  const { data, error } = await supabase
    .from('events')
    .update({
      diagnosed_reason,
      recommended_action,
      confidence,
      customer_message,
      status: 'diagnosed',
    })
    .eq('id', event.id)
    .select()
    .single();

  if (error) throw error;

  await logAction(event.id, 'diagnosed', {
    diagnosed_reason,
    recommended_action,
    confidence,
  });

  return data;
}

/**
 * Diagnoses every event currently in 'pending' status.
 */
export async function diagnosePendingEvents() {
  const { data: pending, error } = await supabase
    .from('events')
    .select('*')
    .eq('status', 'pending');

  if (error) throw error;

  const results = [];
  for (const event of pending) {
    const updated = await diagnoseEvent(event);
    results.push(updated);
  }
  return results;
}
