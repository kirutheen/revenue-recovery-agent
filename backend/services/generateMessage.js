import { askGeminiForJSON } from './geminiClient.js';

function buildMessagePrompt(event, attemptNumber) {
  return `You are writing a short recovery nudge for a fintech customer on attempt
${attemptNumber} of 3. Be polite, clear, and not pushy. Respond ONLY with JSON:
{
  "message_en": a short, polite message (max 40 words) inviting the customer to
    complete their payment, referencing the issue if relevant. Include the
    placeholder [PAYMENT_LINK] where a link would go,
  "message_hinglish": the same message written in casual Hinglish (Hindi written
    in Latin script, mixed with English), same length limit and placeholder
}

Context:
- Diagnosed reason: ${event.diagnosed_reason}
- Recommended action: ${event.recommended_action}
- Amount at risk: ₹${event.amount_at_risk}
- Attempt number: ${attemptNumber} of 3`;
}

/**
 * Generates fresh nudge copy for a given attempt. Falls back to the
 * diagnosis-time customer_message (already on the event row) if this call
 * fails, so execution never gets blocked purely on message-writing.
 */
export async function generateMessage(event, attemptNumber) {
  try {
    const result = await askGeminiForJSON(buildMessagePrompt(event, attemptNumber));
    return {
      message_en: typeof result.message_en === 'string' ? result.message_en : event.customer_message,
      message_hinglish: typeof result.message_hinglish === 'string' ? result.message_hinglish : '',
    };
  } catch (err) {
    console.error(`[generateMessage] Gemini call failed for event ${event.id}, falling back:`, err.message);
    return {
      message_en: event.customer_message || 'We noticed an issue with your recent payment — please complete it here: [PAYMENT_LINK]',
      message_hinglish: '',
    };
  }
}
