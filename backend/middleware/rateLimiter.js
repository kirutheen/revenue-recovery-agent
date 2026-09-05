import rateLimit from 'express-rate-limit';

// Webhook endpoint: Razorpay retries on failure, and a merchant could get a
// burst of real events — allow a generous but bounded rate.
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60, // 60 webhook calls per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many webhook requests — please slow down.' },
});

// Dashboard read API: generous since it's just polling for a UI, but still
// bounded so a runaway frontend loop can't hammer the DB.
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120, // 120 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please slow down.' },
});
