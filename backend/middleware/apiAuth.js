// Minimal shared-secret auth for the dashboard-facing /api/events routes.
// This is NOT full user auth — it's a single shared key, which is enough to
// stop random internet traffic from reading your revenue data once this is
// deployed somewhere public, without needing any paid auth service.
//
// If DASHBOARD_API_KEY is not set in .env, this middleware does nothing —
// so local development still works with zero setup. validateEnv.js prints a
// loud warning at startup if it's missing, so you don't forget before deploying.
export function requireApiKey(req, res, next) {
  const configuredKey = process.env.DASHBOARD_API_KEY;

  // No key configured → auth is off (local dev convenience).
  if (!configuredKey) return next();

  const providedKey = req.headers['x-api-key'];
  if (providedKey !== configuredKey) {
    return res.status(401).json({ error: 'unauthorized — missing or invalid X-API-Key header' });
  }

  next();
}
