import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../lib/auth-context';
import { analytics } from '../lib/api';
import { useDateRange } from '../lib/useDateRange';
import { RangeSelector } from '../components/RangeSelector';
import { Card, Spinner, ErrorBanner, Empty } from '../components/ui';
import type { EventPage, EventName } from '../lib/types';

export default function EventsPage() {
  const { session } = useAuth();
  const { preset, setPreset, from, to } = useDateRange('7d');
  const [data, setData] = useState<EventPage | null>(null);
  const [events, setEvents] = useState<EventName[]>([]);
  const [eventName, setEventName] = useState('');
  const [distinctId, setDistinctId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const LIMIT = 50;

  useEffect(() => {
    if (!session?.queryKey) return;
    analytics.eventNames(session.queryKey).then(setEvents).catch(() => {});
  }, [session?.queryKey]);

  const load = useCallback(async () => {
    if (!session?.queryKey) return;
    setLoading(true);
    setError('');
    try {
      const res = await analytics.events(session.queryKey, {
        from,
        to,
        limit: LIMIT,
        offset: page * LIMIT,
        event_name: eventName || undefined,
        distinct_id: distinctId || undefined,
        search: search || undefined,
      });
      setData(res);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }, [session?.queryKey, from, to, eventName, distinctId, search, page]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Events</h2>
          <p className="muted">Raw event feed from the ClickHouse column store.</p>
        </div>
        <RangeSelector preset={preset} onChange={setPreset} />
      </div>

      <Card>
        <div className="filter-row">
          <input
            list="event-filter-options"
            placeholder="Event name"
            value={eventName}
            onChange={(e) => {
              setEventName(e.target.value);
              setPage(0);
            }}
          />
          <datalist id="event-filter-options">
            {events.map((e) => (
              <option key={e.event_name} value={e.event_name} />
            ))}
          </datalist>
          <input
            placeholder="Distinct ID"
            value={distinctId}
            onChange={(e) => {
              setDistinctId(e.target.value);
              setPage(0);
            }}
          />
          <input
            placeholder="Search properties…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>
      </Card>

      {error && <ErrorBanner message={error} onRetry={load} />}
      {loading && <Spinner label="Loading events…" />}

      {!loading && data && (
        <Card
          title={`${data.total.toLocaleString()} matching events`}
          actions={
            <div className="pager">
              <button
                className="btn btn-ghost btn-sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Prev
              </button>
              <span className="muted">
                Page {page + 1} / {totalPages}
              </span>
              <button
                className="btn btn-ghost btn-sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          }
        >
          {data.events.length === 0 ? (
            <Empty message="No events match the current filters." />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Event</th>
                    <th>Distinct ID</th>
                    <th>Session</th>
                    <th>Properties</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((ev) => (
                    <tr key={ev.event_id}>
                      <td className="mono">{new Date(ev.ts_ms).toLocaleString()}</td>
                      <td>
                        <span className="pill">{ev.event_name}</span>
                      </td>
                      <td className="mono">{ev.distinct_id}</td>
                      <td className="mono muted">{ev.session_id ?? '—'}</td>
                      <td className="props-cell">
                        {Object.entries(ev.properties)
                          .slice(0, 4)
                          .map(([k, v]) => (
                            <span className="kv" key={k}>
                              <b>{k}</b>={String(v)}
                            </span>
                          ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
