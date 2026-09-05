import dotenv from 'dotenv';
import { supabase } from '../db/supabase.js';
import { confirmRecovery } from '../services/confirmRecovery.js';
import { pathToFileURL } from 'url';
dotenv.config();

const DEFAULT_RECOVERY_PROBABILITY = 0.4; // 40% — middle of the realistic 30-50% band

/**
 * Simulates customers actually paying after receiving a nudge. Only events
 * that have had at least one action taken (attempt_count > 0) and are still
 * active (pending/diagnosed) are eligible — this mirrors a real customer
 * responding to a nudge, not paying out of nowhere.
 *
 * This is a DEMO/TEST utility, standing in for real `order.paid` webhooks
 * that would trigger the same confirmRecovery() call in production.
 */
export async function simulateRecoveries(probability = DEFAULT_RECOVERY_PROBABILITY) {
  // IMPORTANT: restricted to source='seed_demo' only. This function fakes a
  // customer paying — it must NEVER mark a real live_webhook/live_poll event
  // as recovered, or the dashboard would show a fabricated result for real
  // money. Real recoveries only ever happen via confirmRecovery() being
  // called from an actual Razorpay success webhook.
  const { data: eligible, error } = await supabase
    .from('events')
    .select('*')
    .eq('source', 'seed_demo')
    .in('status', ['pending', 'diagnosed'])
    .gt('attempt_count', 0);

  if (error) throw error;

  let recoveredCount = 0;
  let recoveredAmount = 0;

  for (const event of eligible) {
    if (Math.random() < probability) {
      await confirmRecovery(event.id, event.amount_at_risk);
      recoveredCount++;
      recoveredAmount += Number(event.amount_at_risk);
    }
  }

  console.log(`[simulate-recovery] ${recoveredCount}/${eligible.length} eligible events recovered (₹${recoveredAmount.toLocaleString('en-IN')})`);
  return { eligible: eligible.length, recovered: recoveredCount, amount: recoveredAmount };
}

// Allow running standalone: `node scripts/simulateRecoveries.js`
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  simulateRecoveries()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[simulate-recovery] failed:', err.message);
      process.exit(1);
    });
}
