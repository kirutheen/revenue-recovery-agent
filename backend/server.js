import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import webhookRouter from './routes/webhook.js';
import eventsRouter from './routes/events.js';
import { validateEnv } from './config/validateEnv.js';
import { webhookLimiter, apiLimiter } from './middleware/rateLimiter.js';
import { requireApiKey } from './middleware/apiAuth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

dotenv.config();
validateEnv();

const app = express();

app.use(helmet());

// Restrict CORS to the configured frontend origin in production. Defaults to
// allow-all for local dev convenience — set FRONTEND_URL once you deploy.
const frontendUrl = process.env.FRONTEND_URL;
if (!frontendUrl) {
  console.log('[cors] FRONTEND_URL not set — allowing all origins (fine for local dev, set this before deploying).');
}
app.use(cors({ origin: frontendUrl || '*' }));

app.use(morgan('dev'));

// Razorpay webhook needs the RAW body for signature verification —
// mount it BEFORE the global express.json() middleware, with its own rate limit.
app.use('/webhook', webhookLimiter, express.raw({ type: 'application/json' }), webhookRouter);

app.use(express.json());
app.use('/api/events', apiLimiter, requireApiKey, eventsRouter);

app.get('/health', (req, res) => res.json({ ok: true, service: 'revenue-recovery-backend' }));

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Revenue Recovery Agent backend running on port ${PORT}`);
  console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhook/razorpay`);
});
