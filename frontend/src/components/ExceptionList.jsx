import StatusBadge from './StatusBadge.jsx';

function formatINR(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

const REASON_LABELS = {
  card_expired: 'Card expired',
  insufficient_funds: 'Insufficient funds',
  bank_timeout: 'Bank timeout',
  silent_dropoff: 'Silent drop-off',
  unknown: 'Unknown',
};

export default function ExceptionList({ events, onSelectEvent }) {
  const exceptions = events.filter((e) => e.status === 'exhausted' || e.status === 'escalated');

  const totalUnrecovered = exceptions.reduce((sum, e) => sum + Number(e.amount_at_risk || 0), 0);

  return (
    <div className="exception-panel">
      <div className="exception-panel__header">
        <div>
          <h2>Exception list</h2>
          <p className="ink-soft">
            Every event we could not recover — {exceptions.length} case{exceptions.length !== 1 ? 's' : ''},
            not a curated subset.
          </p>
        </div>
        <div className="exception-panel__total mono">{formatINR(totalUnrecovered)}</div>
      </div>

      {exceptions.length === 0 ? (
        <p className="empty-state">No unrecovered events. (If this looks too clean, check the pipeline is actually running.)</p>
      ) : (
        <ul className="exception-list">
          {exceptions.map((event) => (
            <li key={event.id} onClick={() => onSelectEvent(event.id)} tabIndex={0}>
              <div className="exception-list__main">
                <span className="exception-list__reason">
                  {REASON_LABELS[event.diagnosed_reason] || 'Unknown reason'}
                </span>
                <StatusBadge status={event.status} />
              </div>
              <span className="mono exception-list__amount">{formatINR(event.amount_at_risk)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
