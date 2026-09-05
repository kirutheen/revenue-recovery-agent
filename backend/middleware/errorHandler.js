/**
 * Catches any error passed to next(err) anywhere in the app and returns a
 * consistent JSON shape instead of leaking a stack trace to the client.
 * Must be registered LAST, after all routes.
 */
export function errorHandler(err, req, res, next) {
  console.error(`[error] ${req.method} ${req.path}:`, err.message);
  const status = err.status || 500;
  res.status(status).json({
    error: status === 500 ? 'Internal server error' : err.message,
  });
}

/**
 * Catches requests to routes that don't exist. Registered after all real
 * routes but before errorHandler.
 */
export function notFoundHandler(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
}
