import express from 'express';
import { supabase } from '../db/supabase.js';

const router = express.Router();

// GET /api/events — feed, newest first. Supports optional filtering and pagination:
//   ?status=exhausted        filter by status
//   ?event_type=checkout_abandoned   filter by flow
//   ?source=live_webhook|live_poll|seed_demo   filter by where the data came from
//   ?page=1&limit=25         paginate (defaults: page=1, limit=100, max=200)
router.get('/', async (req, res, next) => {
  try {
    const { status, event_type, source } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('events')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (status) query = query.eq('status', status);
    if (event_type) query = query.eq('event_type', event_type);
    if (source) query = query.eq('source', source);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      data,
      pagination: { page, limit, total: count, total_pages: Math.ceil((count || 0) / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/events/metrics — dashboard summary numbers
router.get('/metrics', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('events').select('*');
    if (error) throw error;

    const totalAtRisk = data.reduce((s, e) => s + Number(e.amount_at_risk || 0), 0);
    const totalRecovered = data.reduce((s, e) => s + Number(e.amount_recovered || 0), 0);
    const recovered = data.filter((e) => e.status === 'recovered').length;
    const exhausted = data.filter((e) => e.status === 'exhausted').length;
    const escalated = data.filter((e) => e.status === 'escalated').length;
    const active = data.filter((e) => ['pending', 'diagnosed'].includes(e.status)).length;

    // Split live (real Razorpay Test Mode data) from seed/demo data so the
    // headline numbers never quietly blend real results with synthetic ones.
    const bySource = (src) => data.filter((e) => e.source === src || (src === 'live' && e.source !== 'seed_demo'));
    const summarize = (rows) => ({
      total_events: rows.length,
      total_at_risk: rows.reduce((s, e) => s + Number(e.amount_at_risk || 0), 0),
      total_recovered: rows.reduce((s, e) => s + Number(e.amount_recovered || 0), 0),
      recovered: rows.filter((e) => e.status === 'recovered').length,
    });

    res.json({
      total_events: data.length,
      total_at_risk: totalAtRisk,
      total_recovered: totalRecovered,
      recovery_rate: data.length ? +(recovered / data.length * 100).toFixed(1) : 0,
      recovered,
      exhausted,
      escalated,
      active,
      by_source: {
        live: summarize(bySource('live')),
        seed_demo: summarize(bySource('seed_demo')),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/events/:id — single event with its full audit trail
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .single();
    if (eventError) return res.status(404).json({ error: 'event not found' });

    const { data: actions, error: actionsError } = await supabase
      .from('event_actions')
      .select('*')
      .eq('event_id', id)
      .order('created_at', { ascending: true });
    if (actionsError) throw actionsError;

    res.json({ ...event, audit_trail: actions });
  } catch (err) {
    next(err);
  }
});

export default router;
