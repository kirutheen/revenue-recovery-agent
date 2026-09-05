import express from 'express';
import crypto from 'crypto';
import { supabase } from '../db/supabase.js';
import { logAction } from '../services/audit.js';
import { confirmRecovery } from '../services/confirmRecovery.js';

const router = express.Router();

// Razorpay requires the RAW request body for signature verification,
// so this route is mounted with express.raw() in server.js — not express.json().
function verifySignature(rawBody, signature, secret) {
  if (!secret) return true; // allow local testing before webhook secret is set
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  return expected === signature;
}

router.post('/razorpay', async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const rawBody = req.body; // Buffer, thanks to express.raw()
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!verifySignature(rawBody, signature, secret)) {
    return res.status(400).json({ error: 'invalid signature' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch (e) {
    return res.status(400).json({ error: 'invalid JSON' });
  }

  const eventName = payload.event; // e.g. "subscription.charged", "payment.failed", "order.paid"

  try {
    // A successful payment for a subscription/order that we previously
    // logged as failed/abandoned is a recovery — try to match and confirm it
    // before checking whether this is a NEW failure/abandonment event.
    const recoveryMatch = await tryMatchRecovery(eventName, payload);
    if (recoveryMatch) {
      return res.status(200).json({ received: true, action: 'recovery_confirmed', event_id: recoveryMatch.id });
    }

    const mapped = mapRazorpayEvent(eventName, payload);
    if (!mapped) {
      // Not an event type we act on (e.g. a payment success with no matching
      // prior failure — nothing for us to recover)
      return res.status(200).json({ received: true, action: 'ignored' });
    }

    const { data, error } = await supabase
      .from('events')
      .insert({
        event_type: mapped.event_type,
        raw_payload: payload,
        order_id: mapped.order_id,
        amount_at_risk: mapped.amount_at_risk,
        status: 'pending',
        source: 'live_webhook',
      })
      .select()
      .single();

    if (error) throw error;

    await logAction(data.id, 'event_received', { event_name: eventName });

    res.status(200).json({ received: true, event_id: data.id });
  } catch (err) {
    console.error('[webhook] error handling event:', err.message);
    res.status(500).json({ error: 'internal error' });
  }
});

/**
 * If this webhook represents a SUCCESSFUL payment, check whether it matches
 * an event we're actively tracking (by order_id or subscription entity id)
 * that hasn't been recovered yet, and confirm recovery if so.
 * Returns the updated event row if a match was confirmed, otherwise null.
 */
async function tryMatchRecovery(eventName, payload) {
  const isSuccessEvent =
    eventName === 'order.paid' ||
    (eventName === 'subscription.charged' && payload.payload?.payment?.entity?.status === 'captured');

  if (!isSuccessEvent) return null;

  const orderId = payload.payload?.order?.entity?.id || payload.payload?.payment?.entity?.order_id;
  const amount = (payload.payload?.payment?.entity?.amount || payload.payload?.order?.entity?.amount || 0) / 100;

  if (!orderId) return null;

  const { data: candidates } = await supabase
    .from('events')
    .select('*')
    .in('status', ['pending', 'diagnosed'])
    .eq('order_id', orderId);

  const match = candidates?.[0];
  if (!match) return null;

  return await confirmRecovery(match.id, amount);
}

function mapRazorpayEvent(eventName, payload) {
  if (eventName === 'subscription.charged') {
    const payment = payload.payload?.payment?.entity;
    // A "charged" webhook with a failed payment status is our failure signal
    if (payment && payment.status === 'failed') {
      return {
        event_type: 'subscription_failed',
        amount_at_risk: (payment.amount || 0) / 100,
        // Populated consistently here (rather than dug out of raw_payload
        // JSON later) so recovery-matching can use a plain, indexed column
        // regardless of event type.
        order_id: payment.order_id || null,
      };
    }
    return null;
  }

  if (eventName === 'payment.failed') {
    const payment = payload.payload?.payment?.entity;
    return {
      event_type: 'subscription_failed',
      amount_at_risk: (payment?.amount || 0) / 100,
      order_id: payment?.order_id || null,
    };
  }

  // checkout abandonment is detected out-of-band by a timeout job (see scripts/detectAbandonment.js)
  // that looks for order.created without a matching order.paid within N minutes —
  // Razorpay doesn't fire a webhook for "nothing happened".
  return null;
}

export default router;
