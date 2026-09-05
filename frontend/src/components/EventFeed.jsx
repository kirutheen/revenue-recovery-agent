import StatusBadge from './StatusBadge.jsx';
import SourceBadge from './SourceBadge.jsx';

function formatINR(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const REASON_LABELS = {
  card_expired: 'Card expired',
  insufficient_funds: 'Insufficient funds',
  bank_timeout: 'Bank timeout',
  silent_dropoff: 'Silent drop-off',
  unknown: 'Unknown',
};

const TYPE_LABELS = {
  subscription_failed: 'Subscription',
  checkout_abandoned: 'Checkout',
};

const STATUS_OPTIONS = ['pending', 'diagnosed', 'recovered', 'exhausted', 'escalated'];
const TYPE_OPTIONS = ['subscription_failed', 'checkout_abandoned'];
const SOURCE_OPTIONS = [
  { value: 'live_webhook', label: 'Live — webhook' },
  { value: 'live_poll', label: 'Live — abandonment scan' },
  { value: 'seed_demo', label: 'Demo (seeded)' },
];

export default function EventFeed({ events, filters, onFilterChange, onSelectEvent, pagination, onPageChange }) {
  return (
    <div>
      <div className="filter-bar">
        <select
          value={filters.status || ''}
          onChange={(e) => onFilterChange({ ...filters, status: e.target.value })}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
          ))}
        </select>

        <select
          value={filters.event_type || ''}
          onChange={(e) => onFilterChange({ ...filters, event_type: e.target.value })}
        >
          <option value="">All flows</option>
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>

        <select
          value={filters.source || ''}
          onChange={(e) => onFilterChange({ ...filters, source: e.target.value })}
        >
          <option value="">Live + demo</option>
          {SOURCE_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        {(filters.status || filters.event_type || filters.source) && (
          <button className="filter-bar__clear" onClick={() => onFilterChange({})}>
            Clear filters
          </button>
        )}
      </div>

      {!events || events.length === 0 ? (
        <div className="empty-state">
          <p>No events match these filters. Run the seed script, or adjust the filters above.</p>
        </div>
      ) : (
        <>
          <div className="ledger-table-wrap">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Source</th>
                  <th>Reason</th>
                  <th className="align-right">At risk</th>
                  <th className="align-right">Recovered</th>
                  <th>Attempts</th>
                  <th>Status</th>
                  <th>Last action</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr
                    key={event.id}
                    onClick={() => onSelectEvent(event.id)}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && onSelectEvent(event.id)}
                  >
                    <td>{TYPE_LABELS[event.event_type] || event.event_type}</td>
                    <td><SourceBadge source={event.source} /></td>
                    <td>{REASON_LABELS[event.diagnosed_reason] || '—'}</td>
                    <td className="align-right mono">{formatINR(event.amount_at_risk)}</td>
                    <td className="align-right mono">
                      {event.amount_recovered > 0 ? formatINR(event.amount_recovered) : '—'}
                    </td>
                    <td className="mono">{event.attempt_count} / 3</td>
                    <td><StatusBadge status={event.status} /></td>
                    <td className="ink-soft">{formatDate(event.last_action_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && pagination.total_pages > 1 && (
            <div className="pagination">
              <button
                disabled={pagination.page <= 1}
                onClick={() => onPageChange(pagination.page - 1)}
              >
                ← Previous
              </button>
              <span className="ink-soft">
                Page {pagination.page} of {pagination.total_pages} · {pagination.total} events
              </span>
              <button
                disabled={pagination.page >= pagination.total_pages}
                onClick={() => onPageChange(pagination.page + 1)}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
