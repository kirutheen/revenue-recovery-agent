import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import StatusBadge from './StatusBadge.jsx';
import SourceBadge from './SourceBadge.jsx';

const ACTION_LABELS = {
  event_received: 'Event received',
  diagnosed: 'Diagnosed',
  decision_proceed: 'Guardrail check passed',
  decision_wait: 'Waiting — cooldown active',
  decision_exhausted: 'Marked exhausted',
  decision_escalated: 'Escalated',
  decision_blocked: 'Blocked',
  action_executed: 'Nudge sent',
  escalated_to_human: 'Escalated to human',
  recovered: 'Payment recovered',
};

function formatDateTime(iso) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function formatINR(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(amount || 0);
}

export default function AuditTrailModal({ eventId, onClose }) {
  const [event, setEvent] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.getEvent(eventId)
      .then((data) => { if (!cancelled) setEvent(data); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [eventId]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="receipt" onClick={(e) => e.stopPropagation()}>
        <button className="receipt__close" onClick={onClose} aria-label="Close">×</button>

        {error && <p className="error-text">Could not load event: {error}</p>}

        {!event && !error && <p className="ink-soft">Loading audit trail…</p>}

        {event && (
          <>
            <header className="receipt__header">
              <span className="receipt__eyebrow">Recovery audit trail</span>
              <h2 className="receipt__id mono">{event.id.slice(0, 8)}</h2>
              <div className="receipt__badges">
                <StatusBadge status={event.status} />
                <SourceBadge source={event.source} />
              </div>
            </header>

            <dl className="receipt__summary">
              <div className="receipt__line">
                <dt>At risk</dt>
                <dd className="mono">{formatINR(event.amount_at_risk)}</dd>
              </div>
              {event.amount_recovered > 0 && (
                <div className="receipt__line">
                  <dt>Recovered</dt>
                  <dd className="mono">{formatINR(event.amount_recovered)}</dd>
                </div>
              )}
              <div className="receipt__line">
                <dt>Diagnosed reason</dt>
                <dd>{event.diagnosed_reason || '—'}</dd>
              </div>
              <div className="receipt__line">
                <dt>Attempts used</dt>
                <dd className="mono">{event.attempt_count} / 3</dd>
              </div>
            </dl>

            <div className="receipt__divider" />

            <ol className="receipt__timeline">
              {event.audit_trail && event.audit_trail.length > 0 ? (
                event.audit_trail.map((action) => (
                  <li key={action.id}>
                    <span className="receipt__timeline-time mono">{formatDateTime(action.created_at)}</span>
                    <span className="receipt__timeline-action">
                      {ACTION_LABELS[action.action] || action.action}
                    </span>
                    {action.detail && Object.keys(action.detail).length > 0 && (
                      <span className="receipt__timeline-detail">
                        {Object.entries(action.detail)
                          .filter(([k]) => k !== 'message_en')
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(' · ')}
                      </span>
                    )}
                  </li>
                ))
              ) : (
                <li className="ink-soft">No actions logged yet.</li>
              )}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}
