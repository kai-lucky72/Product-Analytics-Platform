import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../lib/auth-context';
import { analytics } from '../lib/api';
import { useDateRange } from '../lib/useDateRange';
import { RangeSelector } from '../components/RangeSelector';
import { Card, Stat, Spinner, ErrorBanner, Empty } from '../components/ui';
import { Timeseries } from '../components/charts';
import type { Overview, EventName } from '../lib/types';

export default function OverviewPage() {
  const { session } = useAuth();
  const { preset, setPreset, from, to, granularity } = useDateRange('30d');
  const [data, setData] = useState<Overview | null>(null);
  const [eventNames, setEventNames] = useState<EventName[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!session?.queryKey) return;
    setLoading(true);
    setError('');
    try {
      const [ov, names] = await Promise.all([
        analytics.overview(session.queryKey, from, to, granularity),
        analytics.eventNames(session.queryKey),
      ]);
      setData(ov);
      setEventNames(names.slice(0, 5));
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load overview');
    } finally {
      setLoading(false);
    }
  }, [session?.queryKey, from, to, granularity]);

  useEffect(() => {
    load();
  }, [load]);

  if (!session?.queryKey) {
    return (
      <Card title="Connect a query key" subtitle="Go to Settings to add your query API key">
        <Empty message="No query API key configured. Open Settings to create one." />
      </Card>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Overview</h2>
          <p className="muted">Traffic, engagement and top events for {session.projectName}.</p>
        </div>
        <RangeSelector preset={preset} onChange={setPreset} />
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}
      {loading && <Spinner label="Loading overview…" />}

      {!loading && data && (
        <>
          <div className="stats-row">
            <Stat label="Total events" value={data.total_events.toLocaleString()} />
            <Stat label="Total users" value={data.total_users.toLocaleString()} />
            <Stat label="Active users (7d)" value={data.active_users.toLocaleString()} />
            <Stat label="Events / user" value={data.events_per_user.toFixed(2)} />
          </div>

          <Card title="Events over time" subtitle={`${granularity}ly aggregated from the OLAP store`}>
            <Timeseries
              data={data.series.map((p) => ({ ts_ms: p.ts_ms, events: p.events, users: p.users }))}
              dataKey="events"
              granularity={granularity}
            />
          </Card>

          <div className="grid-2">
            <Card title="Distinct users" subtitle="Unique visitors per bucket">
              <Timeseries
                data={data.series.map((p) => ({ ts_ms: p.ts_ms, users: p.users }))}
                dataKey="users"
                granularity={granularity}
                color="#22c55e"
              />
            </Card>

            <Card title="Top events" subtitle="Most frequent event names">
              {eventNames.length === 0 ? (
                <Empty message="No events tracked yet — use the Settings page to send test events." />
              ) : (
                <div className="event-name-list">
                  {eventNames.map((n) => (
                    <div key={n.event_name} className="event-name-row">
                      <span className="pill">{n.event_name}</span>
                      <span className="muted">{new Date(n.last_seen_ms).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
