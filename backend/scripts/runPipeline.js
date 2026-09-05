import { supabase } from '../db/supabase.js';
import { diagnoseEvent } from '../services/diagnose.js';
import { applyDecision } from '../services/decide.js';
import { executeAction } from '../services/execute.js';
import { pathToFileURL } from 'url';
/**
 * One full pass of the pipeline:
 *   1. Diagnose every 'pending' event (Gemini)
 *   2. Run every 'pending'/'diagnosed' event through the guardrail layer
 *   3. Report a clear summary of what happened and why
 *
 * Execution (Day 3) will slot in right after applyDecision() returns
 * { proceed: true }. Left as a clear extension point below.
 */
export async function runPipeline() {
  const summary = {
    diagnosed: 0,
    proceeded: 0,
    blocked_cooldown: 0,
    blocked_exhausted: 0,
    blocked_escalated: 0,
    errors: 0,
  };

  // Step 1 — diagnose anything still pending
  const { data: pendingEvents, error: pendingError } = await supabase
    .from('events')
    .select('*')
    .eq('status', 'pending');

  if (pendingError) throw pendingError;

  for (const event of pendingEvents) {
    try {
      await diagnoseEvent(event);
      summary.diagnosed++;
    } catch (err) {
      console.error(`[pipeline] diagnosis failed for event ${event.id}:`, err.message);
      summary.errors++;
    }
  }

  // Step 2 — run guardrails on everything now diagnosed (fresh fetch, since
  // statuses changed above)
  const { data: diagnosedEvents, error: diagnosedError } = await supabase
    .from('events')
    .select('*')
    .eq('status', 'diagnosed');

  if (diagnosedError) throw diagnosedError;

  for (const event of diagnosedEvents) {
    try {
      const decision = await applyDecision(event);

      if (decision.proceed) {
        summary.proceeded++;
        await executeAction(event, decision.action);
      } else if (decision.reason === 'cooldown_active') {
        summary.blocked_cooldown++;
      } else if (decision.reason === 'attempts_exhausted') {
        summary.blocked_exhausted++;
      } else if (decision.reason === 'opted_out') {
        summary.blocked_escalated++;
      }
    } catch (err) {
      console.error(`[pipeline] decision failed for event ${event.id}:`, err.message);
      summary.errors++;
    }
  }

  console.log('[pipeline] run complete:', summary);
  return summary;
}

// Allow running standalone: `node scripts/runPipeline.js`
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPipeline()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[pipeline] fatal error:', err);
      process.exit(1);
    });
}
