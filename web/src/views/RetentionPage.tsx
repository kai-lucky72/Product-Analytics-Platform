import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../lib/auth-context';
import { analytics } from '../lib/api';
import { useDateRange } from '../lib/useDateRange';
import { RangeSelector } from '../components/RangeSelector';
import { Card, Button, Spinner, ErrorBanner } from '../components/ui';
import { RetentionMatrix } from '../components/charts';
import type { Retention, EventName } from '../lib/types';

export default function RetentionPage() {
  const { session } = useAuth();
  const { preset, setPreset, from, to } = useDateRange('90d');
  const [events, setEvents] = useState<EventName[]>([]);
  const [trigger, setTrigger] = useState('signup_completed');
  const [returning, setReturning] = useState('pageview');
  const [periodDays, setPeriodDays] = useState(7);
  const [periods, setPeriods] = useState(8);
  const [result, setResult] = useState<Retention | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session?.queryKey) return;
    analytics.eventNames(session.queryKey).then(setEvents).catch(() => {});
  }, [session?.queryKey]);

  const run = useCallback(async () => {
    if (!session?.queryKey) return;
    setLoading(true);
    setError('');
    try {
      const res = await analytics.retention(
        session.queryKey,
        trigger,
        returning,
        from,
        to,
        periodDays,
        periods,
      );
      setResult(res);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to run retention query');
    } finally {
      setLoading(false);
    }
  }, [session?.queryKey, trigger, returning, from, to, periodDays, periods]);

  useEffect(() => {
    run();
  }, [run]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Retention</h2>
          <p className="muted">Cohort analysis: how often users come back after a trigger event.</p>
        </div>
        <RangeSelector preset={preset} onChange={setPreset} />
      </div>

      <Card title="Configuration">
        <div className="retention-config">
          <label className="field">
            <span>Trigger event</span>
            <input list="event-options" value={trigger} onChange={(e) => setTrigger(e.target.value)} />
          </label>
          <label className="field">
            <span>Returning event</span>
            <input list="event-options" value={returning} onChange={(e) => setReturning(e.target.value)} />
          </label>
          <datalist id="event-options">
            {events.map((e) => (
              <option key={e.event_name} value={e.event_name} />
            ))}
          </datalist>
          <label className="field">
            <span>Period (days)</span>
            <input type="number" min={1} max={31} value={periodDays} onChange={(e) => setPeriodDays(Number(e.target.value))} />
          </label>
          <label className="field">
            <span>Periods</span>
            <input type="number" min={1} max={16} value={periods} onChange={(e) => setPeriods(Number(e.target.value))} />
          </label>
          <Button variant="secondary" onClick={run} disabled={loading}>
            {loading ? 'Running…' : 'Run retention'}
          </Button>
        </div>
      </Card>

      {error && <ErrorBanner message={error} onRetry={run} />}
      {loading && <Spinner label="Computing retention…" />}

      {!loading && result && (
        <Card title="Retention matrix" subtitle={`${result.period_days}-day buckets`}>
          <RetentionMatrix
            cohorts={result.cohorts.map((c) => ({
              label: new Date(c.cohort_start_ms).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              }),
              values: c.retained,
            }))}
          />
        </Card>
      )}
    </div>
  );
}
