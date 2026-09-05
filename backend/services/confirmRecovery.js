import { supabase } from '../db/supabase.js';
import { logAction } from './audit.js';

/**
 * Marks an event as recovered and records the amount recovered.
 * Called either from a real `order.paid` / `subscription.charged` (success)
 * webhook that matches a previously-nudged event, or manually/from seed data
 * for demo purposes.
 */
export async function confirmRecovery(eventId, amountRecovered) {
  const { data: event, error: fetchError } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .single();

  if (fetchError) throw fetchError;

  if (event.status === 'recovered') {
    // Idempotent — don't double-count if called twice for the same event
    return event;
  }

  const { data, error } = await supabase
    .from('events')
    .update({
      status: 'recovered',
      amount_recovered: amountRecovered,
    })
    .eq('id', eventId)
    .select()
    .single();

  if (error) throw error;

  await logAction(eventId, 'recovered', {
    amount_recovered: amountRecovered,
    attempts_taken: event.attempt_count,
  });

  return data;
}
