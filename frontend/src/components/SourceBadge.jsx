const SOURCE_LABELS = {
  live_webhook: 'Live',
  live_poll: 'Live',
  seed_demo: 'Demo',
};

// Keeps a real Razorpay Test Mode event and a seeded synthetic event visually
// distinct everywhere in the UI, so nobody mistakes a demo number for a real one.
export default function SourceBadge({ source }) {
  const isLive = source === 'live_webhook' || source === 'live_poll';
  const label = SOURCE_LABELS[source] || 'Demo';
  return (
    <span
      className={`source-badge ${isLive ? 'source-badge--live' : 'source-badge--demo'}`}
      title={isLive ? 'From a real Razorpay Test Mode event' : 'From the synthetic seed generator'}
    >
      {label}
    </span>
  );
}
