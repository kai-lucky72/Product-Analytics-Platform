import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../lib/auth-context';
import { analytics } from '../lib/api';
import { useDateRange } from '../lib/useDateRange';
import { RangeSelector } from '../components/RangeSelector';
import { Card, Button, Spinner, ErrorBanner } from '../components/ui';
import { FunnelChart } from '../components/charts';
import type { Funnel, EventName } from '../lib/types';

export default function FunnelsPage() {
  const { session } = useAuth();
  const { preset, setPreset, from, to } = useDateRange('90d');
  const [events, setEvents] = useState<EventName[]>([]);
  const [steps, setSteps] = useState<string[]>(['signup_completed', 'feature_clicked', 'purchase']);
  const [stepInput, setStepInput] = useState('');
  const [windowSeconds, setWindowSeconds] = useState(1209600);
  const [result, setResult] = useState<Funnel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session?.queryKey) return;
    analytics.eventNames(session.queryKey).then(setEvents).catch(() => {});
  }, [session?.queryKey]);

  const run = useCallback(async () => {
    if (!session?.queryKey || steps.length === 0) return;
    setLoading(true);
    setError('');
    try {
      const res = await analytics.funnel(session.queryKey, steps, from, to, windowSeconds);
      setResult(res);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to run funnel');
    } finally {
      setLoading(false);
    }
  }, [session?.queryKey, steps, from, to, windowSeconds]);

  useEffect(() => {
    run();
  }, [run]);

  function addStep(name?: string) {
    const value = (name ?? stepInput).trim();
    if (!value) return;
    if (steps.includes(value)) return;
    const next = [...steps, value];
    setSteps(next);
    setStepInput('');
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Funnels</h2>
          <p className="muted">Ordered conversion through a sequence of events.</p>
        </div>
        <RangeSelector preset={preset} onChange={setPreset} />
      </div>

      <Card title="Configuration">
        <div className="funnel-config">
          <div className="steps-editor">
            {steps.map((s, i) => (
              <div className="step-row" key={`${s}-${i}`}>
                <span className="step-index">{i + 1}</span>
                <span className="pill">{s}</span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setSteps(steps.filter((_, idx) => idx !== i))}
                >
                  Remove
                </button>
              </div>
            ))}
            <div className="step-add">
              <input
                list="event-options"
                value={stepInput}
                onChange={(e) => setStepInput(e.target.value)}
                placeholder="Add event name…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addStep();
                  }
                }}
              />
              <datalist id="event-options">
                {events.map((e) => (
                  <option key={e.event_name} value={e.event_name} />
                ))}
              </datalist>
              <Button onClick={() => addStep()}>Add</Button>
            </div>
          </div>
          <div className="funnel-params">
            <label className="field field-inline">
              <span>Conversion window (s)</span>
              <input
                type="number"
                value={windowSeconds}
                onChange={(e) => setWindowSeconds(Number(e.target.value))}
              />
            </label>
            <Button variant="secondary" onClick={run} disabled={loading}>
              {loading ? 'Running…' : 'Run funnel'}
            </Button>
          </div>
        </div>
      </Card>

      {error && <ErrorBanner message={error} onRetry={run} />}
      {loading && <Spinner label="Computing funnel…" />}

      {!loading && result && (
        <Card
          title="Conversion"
          subtitle={`${result.total_users.toLocaleString()} users entered the funnel`}
        >
          <FunnelChart
            data={result.steps.map((s) => ({ event: `${s.event}  (${s.conversion}%)`, users: s.users }))}
          />
        </Card>
      )}
    </div>
  );
}
