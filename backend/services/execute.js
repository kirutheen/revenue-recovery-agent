import { supabase } from '../db/supabase.js';
import { logAction } from './audit.js';
import { generateMessage } from './generateMessage.js';

const CHANNEL_BY_ACTION = {
  retry_payment: 'system',       // no customer message — a silent retry attempt
  whatsapp_nudge: 'whatsapp',
  email_nudge: 'email',
  discount_offer: 'whatsapp',    // discount nudges ride the same channel as whatsapp by default
  escalate_human: 'internal',    // no customer message — flags a human, doesn't message the customer
};

/**
 * Executes the approved action for an event: generates the message (if the
 * action involves messaging a customer), "sends" it via the configured
 * channel, increments attempt_count, and logs everything.
 *
 * Defaults to MESSAGING_MODE=simulated — logs the message as sent without
 * calling any external service. This is intentional: the whole project must
 * work with zero paid signups.
 */
export async function executeAction(event, action) {
  const channel = CHANNEL_BY_ACTION[action] || 'internal';
  const attemptNumber = (event.attempt_count || 0) + 1;

  // escalate_human never messages the customer — it just flags for a human
  if (action === 'escalate_human') {
    await supabase.from('events').update({ status: 'escalated', action_taken: action }).eq('id', event.id);
    await logAction(event.id, 'escalated_to_human', { reason: 'ai_recommended_escalation' });
    return { channel: 'internal', sent: false, escalated: true };
  }

  let message = { message_en: '', message_hinglish: '' };
  if (channel === 'whatsapp' || channel === 'email') {
    message = await generateMessage(event, attemptNumber);
  }

  const dispatchResult = await dispatch(channel, event, message);

  const { error } = await supabase
    .from('events')
    .update({
      attempt_count: attemptNumber,
      action_taken: action,
    })
    .eq('id', event.id);

  if (error) throw error;

  await logAction(event.id, 'action_executed', {
    action,
    channel,
    attempt_number: attemptNumber,
    mode: dispatchResult.mode,
    message_en: message.message_en || undefined,
  });

  return { channel, sent: dispatchResult.sent, attemptNumber };
}

async function dispatch(channel, event, message) {
  const messagingMode = process.env.MESSAGING_MODE || 'simulated';
  const emailMode = process.env.EMAIL_MODE || 'simulated';

  if (channel === 'system') {
    // retry_payment — no customer-facing message, just a logged internal action
    return { sent: true, mode: 'system' };
  }

  if (channel === 'whatsapp') {
    if (messagingMode === 'twilio' && process.env.TWILIO_ACCOUNT_SID) {
      return await sendViaTwilio(event, message);
    }
    console.log(`[SIMULATED WHATSAPP] → event ${event.id}: "${message.message_en}"`);
    return { sent: true, mode: 'simulated' };
  }

  if (channel === 'email') {
    if (emailMode === 'resend' && process.env.RESEND_API_KEY) {
      return await sendViaResend(event, message);
    }
    console.log(`[SIMULATED EMAIL] → event ${event.id}: "${message.message_en}"`);
    return { sent: true, mode: 'simulated' };
  }

  return { sent: false, mode: 'unknown_channel' };
}

async function sendViaTwilio(event, message) {
  try {
    const twilio = (await import('twilio')).default;
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to: `whatsapp:${event.raw_payload?.customer_phone || ''}`,
      body: message.message_en,
    });
    return { sent: true, mode: 'twilio' };
  } catch (err) {
    console.error('[execute] Twilio send failed, falling back to simulated log:', err.message);
    console.log(`[SIMULATED WHATSAPP - fallback] → event ${event.id}: "${message.message_en}"`);
    return { sent: true, mode: 'simulated_fallback' };
  }
}

async function sendViaResend(event, message) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'recovery@yourdomain.com',
        to: event.raw_payload?.customer_email || '',
        subject: 'Complete your payment',
        text: message.message_en,
      }),
    });
    if (!res.ok) throw new Error(`Resend API returned ${res.status}`);
    return { sent: true, mode: 'resend' };
  } catch (err) {
    console.error('[execute] Resend send failed, falling back to simulated log:', err.message);
    console.log(`[SIMULATED EMAIL - fallback] → event ${event.id}: "${message.message_en}"`);
    return { sent: true, mode: 'simulated_fallback' };
  }
}
