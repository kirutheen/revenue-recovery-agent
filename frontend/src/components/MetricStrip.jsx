function formatINR(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

export default function MetricStrip({ metrics }) {
  if (!metrics) return null;

  const {
    total_at_risk,
    total_recovered,
    recovery_rate,
    recovered,
    exhausted,
    escalated,
    active,
    by_source,
  } = metrics;

  const liveCount = by_source?.live?.total_events ?? 0;
  const demoCount = by_source?.seed_demo?.total_events ?? 0;

  return (
    <div className="metric-strip">
      {by_source && (liveCount > 0 || demoCount > 0) && (
        <p className="metric-strip__source-note ink-soft">
          These totals blend <strong>{liveCount} live</strong> Razorpay Test Mode event{liveCount === 1 ? '' : 's'}
          {' '}with <strong>{demoCount} seeded demo</strong> event{demoCount === 1 ? '' : 's'}.
          {liveCount > 0 && (
            <> Live recovered so far: {formatINR(by_source.live.total_recovered)} of {formatINR(by_source.live.total_at_risk)} at risk.</>
          )}
          {' '}Filter by Source below to see either on its own.
        </p>
      )}

      <div className="metric-strip__primary">
        <div className="metric-card metric-card--primary">
          <span className="metric-card__label">Total at risk</span>
          <span className="metric-card__value mono">{formatINR(total_at_risk)}</span>
        </div>
        <div className="metric-card metric-card--primary metric-card--recovered">
          <span className="metric-card__label">Recovered</span>
          <span className="metric-card__value mono">{formatINR(total_recovered)}</span>
        </div>
        <div className="metric-card metric-card--primary">
          <span className="metric-card__label">Recovery rate</span>
          <span className="metric-card__value mono">{recovery_rate}%</span>
        </div>
      </div>

      <div className="metric-strip__counts">
        <CountPill label="Active" value={active} status="pending" />
        <CountPill label="Recovered" value={recovered} status="recovered" />
        <CountPill label="Exhausted" value={exhausted} status="exhausted" />
        <CountPill label="Escalated" value={escalated} status="escalated" />
      </div>
    </div>
  );
}

function CountPill({ label, value, status }) {
  return (
    <div className={`count-pill count-pill--${status}`}>
      <span className="count-pill__value mono">{value}</span>
      <span className="count-pill__label">{label}</span>
    </div>
  );
}
