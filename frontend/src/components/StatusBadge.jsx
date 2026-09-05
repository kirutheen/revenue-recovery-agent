const STATUS_LABELS = {
  pending: 'Pending',
  diagnosed: 'Diagnosed',
  recovered: 'Recovered',
  exhausted: 'Exhausted',
  escalated: 'Escalated',
};

export default function StatusBadge({ status }) {
  const label = STATUS_LABELS[status] || status;
  return (
    <span className={`status-badge status-badge--${status}`}>
      <span className="status-badge__dot" />
      {label}
    </span>
  );
}
