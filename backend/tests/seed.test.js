import { generateSeedEvents } from '../scripts/seed.js';
import assert from 'node:assert';

const events = generateSeedEvents(50);

let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { console.log(`✅ ${name}`); passed++; }
  else { console.log(`❌ ${name}`); failed++; }
}

check('generates exactly 50 events', events.length === 50);

const subCount = events.filter(e => e.event_type === 'subscription_failed').length;
const checkoutCount = events.filter(e => e.event_type === 'checkout_abandoned').length;
check('roughly even split between both flows', Math.abs(subCount - checkoutCount) <= 2);

check('every event has a positive amount_at_risk', events.every(e => e.amount_at_risk > 0));
check('every event starts as pending', events.every(e => e.status === 'pending'));
check('every event has a raw_payload object', events.every(e => typeof e.raw_payload === 'object'));

const optedOutCount = events.filter(e => e.opted_out).length;
check('opt-out rate is a realistic minority (0-20% of 50)', optedOutCount >= 0 && optedOutCount <= 10);

const amounts = events.map(e => e.amount_at_risk);
const uniqueAmounts = new Set(amounts).size;
check('amounts are varied, not all identical', uniqueAmounts > 3);

// Re-run to confirm randomization actually varies between runs (not a fixed fixture)
const events2 = generateSeedEvents(50);
const opted1 = events.filter(e => e.opted_out).length;
const opted2 = events2.filter(e => e.opted_out).length;
check('two separate generations are not byte-identical (real randomization)',
  JSON.stringify(events) !== JSON.stringify(events2));

console.log(`\n${passed}/${passed + failed} seed generator tests passed`);
if (failed > 0) process.exit(1);
