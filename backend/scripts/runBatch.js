import dotenv from 'dotenv';
import { supabase } from '../db/supabase.js';
import { seedDatabase } from './seed.js';
import { runPipeline } from './runPipeline.js';
import { simulateRecoveries } from './simulateRecoveries.js';
import { MAX_ATTEMPTS } from '../services/decide.js';
import { pathToFileURL } from 'url';
dotenv.config();

/**
 * Runs the full demo end-to-end:
 *   1. Seed N synthetic events
 *   2. Run the pipeline (diagnose + decide + execute) — this is "attempt round 1"
 *   3. Simulate some customers paying in response
 *   4. Repeat the pipeline + simulate-recovery cycle up to MAX_ATTEMPTS times,
 *      so events that don't recover on round 1 get a real second/third attempt
 *      (respecting the same cooldown/guardrail logic every real run would)
 *   5. Print the final honest numbers
 *
 * NOTE: the 4-hour cooldown between attempts is real guardrail logic — for a
 * fast local demo, set COOLDOWN_HOURS=0.01 in your .env (see README) so
 * rounds don't block each other. In production this naturally spreads over
 * real days, which is the intended behavior.
 */
export async function runFullBatch(seedCount = 50) {
  console.log(`\n=== Revenue Recovery Agent — full batch run (${seedCount} events) ===\n`);

  console.log('--- Step 1: Seeding data ---');
  await seedDatabase(seedCount);

  for (let round = 1; round <= MAX_ATTEMPTS; round++) {
    console.log(`\n--- Round ${round}: pipeline run ---`);
    await runPipeline();

    console.log(`--- Round ${round}: simulating customer responses ---`);
    await simulateRecoveries();
  }

  console.log('\n--- Final pass: catching any remaining exhausted events ---');
  await runPipeline(); // one more pass to flip anyone who hit MAX_ATTEMPTS to 'exhausted'

  await printFinalReport();
}

async function printFinalReport() {
  const { data: events, error } = await supabase.from('events').select('*');
  if (error) throw error;

  const totalAtRisk = events.reduce((s, e) => s + Number(e.amount_at_risk || 0), 0);
  const totalRecovered = events.reduce((s, e) => s + Number(e.amount_recovered || 0), 0);
  const recovered = events.filter((e) => e.status === 'recovered').length;
  const exhausted = events.filter((e) => e.status === 'exhausted').length;
  const escalated = events.filter((e) => e.status === 'escalated').length;
  const active = events.filter((e) => ['pending', 'diagnosed'].includes(e.status)).length;
  const recoveryRate = events.length ? ((recovered / events.length) * 100).toFixed(1) : '0.0';

  console.log('\n=== FINAL RESULTS ===');
  console.log(`Total events:        ${events.length}`);
  console.log(`Total at risk:       ₹${totalAtRisk.toLocaleString('en-IN')}`);
  console.log(`Total recovered:     ₹${totalRecovered.toLocaleString('en-IN')}`);
  console.log(`Recovery rate:       ${recoveryRate}%`);
  console.log(`Recovered events:    ${recovered}`);
  console.log(`Exhausted events:    ${exhausted}  (hit max attempts, unrecovered)`);
  console.log(`Escalated events:    ${escalated}  (opted out or flagged for human)`);
  console.log(`Still active:        ${active}  (mid-cooldown or awaiting next attempt)`);

  const liveEvents = events.filter((e) => e.source !== 'seed_demo');
  if (liveEvents.length > 0) {
    console.log(`\nOf the above, ${liveEvents.length} came from LIVE Razorpay Test Mode data`);
    console.log(`(source=live_webhook or live_poll) — the rest is seeded demo data.`);
  } else {
    console.log(`\nAll ${events.length} events above are seeded demo data (source=seed_demo) — no live events yet.`);
  }

  console.log(`\nPitch line: "Recovered ₹${totalRecovered.toLocaleString('en-IN')} out of ₹${totalAtRisk.toLocaleString('en-IN')} at risk `);
  console.log(`(${recoveryRate}% recovery rate) across ${events.length} events, with ${escalated} escalations `);
  console.log(`and an honest exception list of ${exhausted} unrecoverable cases."\n`);
}

// Allow running standalone: `node scripts/runBatch.js` or `node scripts/runBatch.js 75`
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const count = Number(process.argv[2]) || 50;
  runFullBatch(count)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[batch] failed:', err);
      process.exit(1);
    });
}
