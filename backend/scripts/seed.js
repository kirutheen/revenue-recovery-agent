import dotenv from 'dotenv';
import { supabase } from '../db/supabase.js';
import { pathToFileURL } from 'url';
dotenv.config();

// Realistic INR amount bands per flow, so the dataset doesn't look uniform/fake
const SUBSCRIPTION_AMOUNTS = [499, 999, 1499, 2499, 4999, 9999];
const CHECKOUT_AMOUNTS = [299, 599, 899, 1299, 1999, 3499, 5999];

// Reasons a diagnosis engine would realistically assign per flow — used only
// to shape realistic raw_payload content; actual diagnosed_reason is set by
// the AI diagnosis step later, not hardcoded here.
const FAILURE_REASONS = ['card_expired', 'insufficient_funds', 'bank_timeout', 'network_error'];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomAmount(bandArr) {
  return randomFrom(bandArr);
}

function randomPastTimestamp(maxHoursAgo) {
  const hoursAgo = Math.random() * maxHoursAgo;
  return Math.floor((Date.now() - hoursAgo * 60 * 60 * 1000) / 1000); // unix seconds, like Razorpay uses
}

function buildSubscriptionFailedPayload(id) {
  const amountPaise = randomAmount(SUBSCRIPTION_AMOUNTS) * 100;
  const reasonHint = randomFrom(FAILURE_REASONS);
  return {
    event: 'subscription.charged',
    payload: {
      subscription: {
        entity: {
          id: `sub_seed_${id}`,
          status: 'active',
        },
      },
      payment: {
        entity: {
          id: `pay_seed_${id}`,
          order_id: `order_seed_${id}`,
          amount: amountPaise,
          status: 'failed',
          error_reason: reasonHint,
        },
      },
    },
  };
}

function buildCheckoutAbandonedPayload(id) {
  const amountPaise = randomAmount(CHECKOUT_AMOUNTS) * 100;
  return {
    id: `order_seed_${id}`,
    entity: 'order',
    amount: amountPaise,
    status: 'created',
    created_at: randomPastTimestamp(72),
    customer_email: `customer${id}@example.com`,
    customer_phone: `+9198765${String(id).padStart(5, '0')}`,
  };
}

/**
 * Generates `count` synthetic events split roughly evenly across both flows,
 * with varied amounts and a small percentage pre-marked opted_out to exercise
 * the guardrail's opt-out path during the batch run.
 */
export function generateSeedEvents(count = 50) {
  const events = [];

  for (let i = 1; i <= count; i++) {
    const isSubscription = i % 2 === 0;
    const optedOut = Math.random() < 0.08; // ~8% opt-out rate, realistic minority

    if (isSubscription) {
      const payload = buildSubscriptionFailedPayload(i);
      events.push({
        event_type: 'subscription_failed',
        raw_payload: payload,
        order_id: payload.payload.payment.entity.order_id,
        amount_at_risk: payload.payload.payment.entity.amount / 100,
        status: 'pending',
        opted_out: optedOut,
        source: 'seed_demo',
      });
    } else {
      const payload = buildCheckoutAbandonedPayload(i);
      events.push({
        event_type: 'checkout_abandoned',
        raw_payload: payload,
        order_id: payload.id,
        amount_at_risk: payload.amount / 100,
        status: 'pending',
        opted_out: optedOut,
        source: 'seed_demo',
      });
    }
  }

  return events;
}

export async function seedDatabase(count = 50) {
  const events = generateSeedEvents(count);

  const { data, error } = await supabase.from('events').insert(events).select();

  if (error) throw error;

  console.log(`[seed] inserted ${data.length} events`);
  console.log(`[seed] subscription_failed: ${data.filter((e) => e.event_type === 'subscription_failed').length}`);
  console.log(`[seed] checkout_abandoned: ${data.filter((e) => e.event_type === 'checkout_abandoned').length}`);
  console.log(`[seed] opted_out: ${data.filter((e) => e.opted_out).length}`);
  console.log(`[seed] total amount at risk: ₹${data.reduce((s, e) => s + Number(e.amount_at_risk), 0).toLocaleString('en-IN')}`);

  return data;
}

// Allow running standalone: `node scripts/seed.js` or `node scripts/seed.js 75`
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const count = Number(process.argv[2]) || 50;
  seedDatabase(count)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seed] failed:', err.message);
      process.exit(1);
    });
}
