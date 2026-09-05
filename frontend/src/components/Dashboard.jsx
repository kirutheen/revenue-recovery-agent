import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client.js';
import MetricStrip from './MetricStrip.jsx';
import EventFeed from './EventFeed.jsx';
import ExceptionList from './ExceptionList.jsx';
import AuditTrailModal from './AuditTrailModal.jsx';

const POLL_INTERVAL_MS = 15000;

export default function Dashboard() {
  const [events, setEvents] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [filters, setFilters] = useState({});
  const [page, setPage] = useState(1);

  // Exceptions must always reflect ALL exhausted/escalated events, independent
  // of whatever filter the main table is using — an honest exception list
  // can't be silently narrowed by an unrelated UI filter.
  const [exceptionEvents, setExceptionEvents] = useState([]);

  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const [eventsResult, metricsData, exhaustedResult, escalatedResult] = await Promise.all([
        api.getEvents({ ...filters, page, limit: 25 }),
        api.getMetrics(),
        api.getEvents({ status: 'exhausted', limit: 200 }),
        api.getEvents({ status: 'escalated', limit: 200 }),
      ]);
      setEvents(eventsResult.data);
      setPagination(eventsResult.pagination);
      setMetrics(metricsData);
      setExceptionEvents([...exhaustedResult.data, ...escalatedResult.data]);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadData]);

  function handleFilterChange(next) {
    setFilters(next);
    setPage(1); // reset to page 1 whenever filters change
  }

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <div>
          <span className="dashboard__eyebrow">Revenue Recovery Agent</span>
          <h1>Recovery ledger</h1>
        </div>
        <div className="dashboard__header-right">
          {lastUpdated && (
            <span className="ink-soft dashboard__updated">
              Updated {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button className="btn-refresh" onClick={loadData}>Refresh</button>
        </div>
      </header>

      {error && (
        <div className="banner-error">
          Could not reach the backend at the configured API URL — {error}. Confirm the
          backend is running and VITE_API_BASE_URL is correct.
        </div>
      )}

      {loading ? (
        <p className="ink-soft">Loading ledger…</p>
      ) : (
        <>
          <MetricStrip metrics={metrics} />

          <div className="dashboard__grid">
            <section className="dashboard__main">
              <h2>All events</h2>
              <EventFeed
                events={events}
                filters={filters}
                onFilterChange={handleFilterChange}
                onSelectEvent={setSelectedEventId}
                pagination={pagination}
                onPageChange={setPage}
              />
            </section>

            <aside className="dashboard__side">
              <ExceptionList events={exceptionEvents} onSelectEvent={setSelectedEventId} />
            </aside>
          </div>
        </>
      )}

      {selectedEventId && (
        <AuditTrailModal
          eventId={selectedEventId}
          onClose={() => setSelectedEventId(null)}
        />
      )}
    </div>
  );
}
