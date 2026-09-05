/**
 * Validates required environment variables at startup and prints a clear,
 * beginner-friendly checklist instead of letting the app crash later with a
 * confusing error deep in some unrelated file.
 *
 * This never THROWS for missing optional keys (Twilio/Resend) — those are
 * genuinely optional. It only warns loudly for keys the core pipeline needs.
 */
export function validateEnv() {
  const checks = [
    { key: 'SUPABASE_URL', required: true, hint: 'Supabase project → Settings → API → Project URL' },
    { key: 'SUPABASE_SERVICE_ROLE_KEY', required: true, hint: 'Supabase project → Settings → API → service_role key' },
    { key: 'GEMINI_API_KEY', required: true, hint: 'aistudio.google.com → Get API Key' },
    { key: 'RAZORPAY_KEY_ID', required: false, hint: 'Razorpay Dashboard (Test Mode) → Settings → API Keys' },
    { key: 'RAZORPAY_KEY_SECRET', required: false, hint: 'Razorpay Dashboard (Test Mode) → Settings → API Keys' },
    { key: 'RAZORPAY_WEBHOOK_SECRET', required: false, hint: 'Razorpay Dashboard → Settings → Webhooks' },
    { key: 'DASHBOARD_API_KEY', required: false, hint: 'any random string you make up — protects your live revenue data once deployed' },
  ];

  const missing = checks.filter((c) => !process.env[c.key]);
  const missingRequired = missing.filter((c) => c.required);

  if (missing.length === 0) {
    console.log('[env] all credentials present ✓');
    return;
  }

  console.log('\n[env] ── Setup checklist ──────────────────────────────');
  for (const c of missing) {
    const tag = c.required ? 'REQUIRED' : 'optional';
    console.log(`  [ ] ${c.key}  (${tag}) — ${c.hint}`);
  }
  console.log('  Fill these in backend/.env — see project-manual.md for the full walkthrough.');
  console.log('──────────────────────────────────────────────────────\n');

  if (missingRequired.length > 0) {
    console.log(
      `[env] Server will still start, but the pipeline cannot diagnose events or ` +
      `write to the database until the ${missingRequired.length} REQUIRED key(s) above are set.\n`
    );
  }

  // Loud, hard-to-miss warning if this looks like a deployed server (not your
  // own laptop) running without the two keys that keep it from being wide
  // open to the internet. Missing them locally is fine and expected.
  const looksDeployed = process.env.NODE_ENV === 'production' || !!process.env.RENDER || !!process.env.RAILWAY_ENVIRONMENT;
  if (looksDeployed) {
    if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
      console.warn('\n⚠️  [security] RAZORPAY_WEBHOOK_SECRET is not set on what looks like a deployed server.');
      console.warn('    Anyone can POST fake payment webhooks to /webhook/razorpay right now. Set this before real use.\n');
    }
    if (!process.env.DASHBOARD_API_KEY) {
      console.warn('⚠️  [security] DASHBOARD_API_KEY is not set — /api/events is publicly readable by anyone with the URL.');
      console.warn('    Set DASHBOARD_API_KEY in .env (and the matching VITE_API_KEY in the frontend) before sharing this URL.\n');
    }
  }
}
