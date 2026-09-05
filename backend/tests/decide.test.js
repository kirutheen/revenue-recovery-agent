import { decide, MAX_ATTEMPTS, COOLDOWN_HOURS } from '../services/decide.js';
import assert from 'node:assert';

function hoursAgo(h) {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
}

const baseEvent = {
  status: 'diagnosed',
  opted_out: false,
  diagnosed_reason: 'card_expired',
  recommended_action: 'retry_payment',
  attempt_count: 0,
  last_attempt_at: null,
};

const tests = [
  {
    name: 'fresh diagnosed event with no prior attempts → proceeds',
    event: { ...baseEvent },
    expect: { proceed: true, action: 'retry_payment' },
  },
  {
    name: 'opted-out customer → blocked, reason opted_out',
    event: { ...baseEvent, opted_out: true },
    expect: { proceed: false, reason: 'opted_out' },
  },
  {
    name: `attempt_count at MAX_ATTEMPTS (${MAX_ATTEMPTS}) → blocked, exhausted`,
    event: { ...baseEvent, attempt_count: MAX_ATTEMPTS },
    expect: { proceed: false, reason: 'attempts_exhausted' },
  },
  {
    name: `last attempt ${COOLDOWN_HOURS - 1}h ago (inside cooldown) → blocked`,
    event: { ...baseEvent, attempt_count: 1, last_attempt_at: hoursAgo(COOLDOWN_HOURS - 1) },
    expect: { proceed: false, reason: 'cooldown_active' },
  },
  {
    name: `last attempt ${COOLDOWN_HOURS + 1}h ago (past cooldown) → proceeds`,
    event: { ...baseEvent, attempt_count: 1, last_attempt_at: hoursAgo(COOLDOWN_HOURS + 1) },
    expect: { proceed: true, action: 'retry_payment' },
  },
  {
    name: 'not yet diagnosed (pending, no reason) → blocked, not_diagnosed',
    event: { status: 'pending', opted_out: false, attempt_count: 0, last_attempt_at: null },
    expect: { proceed: false, reason: 'not_diagnosed' },
  },
  {
    // Regression test for the real bug found in audit: diagnosis (and other
    // non-attempt audit logging) used to stamp the SAME timestamp field the
    // cooldown reads, so a just-diagnosed event looked like it had JUST been
    // attempted and got stuck in cooldown forever. last_action_at (bumped by
    // every audit entry) must have no effect on decide() — only
    // last_attempt_at (bumped only by real sends) matters.
    name: 'freshly diagnosed event (last_attempt_at still null) → proceeds even though "just happened"',
    event: { ...baseEvent, attempt_count: 0, last_action_at: new Date().toISOString(), last_attempt_at: null },
    expect: { proceed: true, action: 'retry_payment' },
  },
  {
    name: 'already recovered → blocked, status_is_recovered',
    event: { ...baseEvent, status: 'recovered' },
    expect: { proceed: false, reason: 'status_is_recovered' },
  },
  {
    name: 'opted_out takes priority even if also exhausted',
    event: { ...baseEvent, opted_out: true, attempt_count: MAX_ATTEMPTS },
    expect: { proceed: false, reason: 'opted_out' },
  },
];

let passed = 0;
let failed = 0;

for (const t of tests) {
  try {
    const result = decide(t.event);
    assert.strictEqual(result.proceed, t.expect.proceed, `proceed mismatch`);
    if (t.expect.reason) assert.strictEqual(result.reason, t.expect.reason, `reason mismatch`);
    if (t.expect.action) assert.strictEqual(result.action, t.expect.action, `action mismatch`);
    console.log(`✅ ${t.name}`);
    passed++;
  } catch (err) {
    console.log(`❌ ${t.name}`);
    console.log(`   ${err.message}`);
    failed++;
  }
}

console.log(`\n${passed}/${tests.length} guardrail tests passed`);
if (failed > 0) process.exit(1);
