import Razorpay from 'razorpay';
import dotenv from 'dotenv';
import { supabase } from '../db/supabase.js';
import { logAction } from '../services/audit.js';
import { pathToFileURL } from 'url';
dotenv.config();

const ABANDONMENT_TIMEOUT_MINUTES = 30;

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'placeholder',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'placeholder',
});

/**
 * Razorpay fires a webhook when an order IS paid, but nothing fires when a
 * customer simply never comes back. So we poll: fetch recent orders, and for
 * any order older than ABANDONMENT_TIMEOUT_MINUTES that's still unpaid, treat
 * it as an abandonment event — but only once (skip if we already logged it).
 */
export async function detectAbandonedCheckouts() {
  if (!process.env.RAZORPAY_KEY_ID) {
    console.warn('[abandonment] RAZORPAY_KEY_ID not set — skipping poll. Fill in backend/.env to enable.');
    return [];
  }

  const cutoff = Date.now() - ABANDONMENT_TIMEOUT_MINUTES * 60 * 1000;
  const orders = await razorpay.orders.all({ count: 100 });

  const created = [];

  for (const order of orders.items) {
    const createdAtMs = order.created_at * 1000; // Razorpay gives unix seconds
    const isStale = createdAtMs < cutoff;
    const isUnpaid = order.status === 'created' || order.status === 'attempted';

    if (!isStale || !isUnpaid) continue;

    // Skip if we've already created an event for this order
    const { data: existing } = await supabase
      .from('events')
      .select('id')
      .eq('order_id', order.id)
      .eq('event_type', 'checkout_abandoned')
      .maybeSingle();

    if (existing) continue;

    const { data: newEvent, error } = await supabase
      .from('events')
      .insert({
        event_type: 'checkout_abandoned',
        raw_payload: order,
        order_id: order.id,
        amount_at_risk: (order.amount || 0) / 100,
        status: 'pending',
        source: 'live_poll',
      })
      .select()
      .single();

    if (error) {
      console.error(`[abandonment] failed to insert event for order ${order.id}:`, error.message);
      continue;
    }

    await logAction(newEvent.id, 'event_received', {
      detected_by: 'abandonment_poll',
      order_id: order.id,
    });

    created.push(newEvent);
  }

  console.log(`[abandonment] scan complete — ${created.length} new abandoned checkout(s) found`);
  return created;
}

// Allow running standalone: `node scripts/detectAbandonment.js`
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  detectAbandonedCheckouts()
    .then((created) => {
      console.log(`Done. ${created.length} event(s) created.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Abandonment detection failed:', err);
      process.exit(1);
    });
}
