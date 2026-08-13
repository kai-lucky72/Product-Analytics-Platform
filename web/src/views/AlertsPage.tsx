import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../lib/auth-context';
import { alerts, analytics } from '../lib/api';
import { Card, Button, Spinner, ErrorBanner, Empty } from '../components/ui';
import type { AlertHistoryEntry, AlertRule, EventName } from '../lib/types';

const EMPTY_FORM = {
  name: '',
  event_name: '',
  metric: 'events' as 'events' | 'users',
  operator: 'lt' as 'gt' | 'lt' | 'gte' | 'lte',
  threshold: 100,
  webhook_url: '',
};

export default function AlertsPage() {
  const { session } = useAuth();
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<EventName[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [history, setHistory] = useState<Record<string, AlertHistoryEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [r, names] = await Promise.all([
        alerts.list(),
        session?.queryKey ? analytics.eventNames(session.queryKey) : Promise.resolve([]),
      ]);
      setRules(r);
      setEvents(names);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load alert rules');
    } finally {
      setLoading(false);
    }
  }, [session?.queryKey]);

  useEffect(() => {
    load();
  }, [load]);

  async function createRule() {
    if (!session?.activeProjectId || !form.name || !form.event_name) return;
    try {
      await alerts.create({
        project_id: session.activeProjectId,
        name: form.name,
        metric: form.metric,
        event_name: form.event_name,
        operator: form.operator,
        threshold: form.threshold,
        webhook_url: form.webhook_url || undefined,
      });
      setForm(EMPTY_FORM);
      await load();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create rule');
    }
  }

  async function toggleRule(rule: AlertRule) {
    await alerts.update(rule.id, { enabled: !rule.enabled });
    await load();
  }

  async function deleteRule(id: string) {
    await alerts.remove(id);
    await load();
  }

  async function showHistory(rule: AlertRule) {
    const h = await alerts.history(rule.id, 10);
    setHistory((prev) => ({ ...prev, [rule.id]: h }));
  }

  const operatorLabel: Record<string, string> = {
    gt: 'greater than',
    lt: 'less than',
    gte: 'at least',
    lte: 'at most',
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Alerts</h2>
          <p className="muted">Threshold rules evaluated by the alerting service against the query API.</p>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}
      {loading && <Spinner label="Loading alert rules…" />}

      {!loading && (
        <>
          <Card title="Create rule">
            <div className="alert-form">
              <label className="field">
                <span>Name</span>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Signup drop guard" />
              </label>
              <label className="field">
                <span>Event</span>
                <input
                  list="alert-event-options"
                  value={form.event_name}
                  onChange={(e) => setForm({ ...form, event_name: e.target.value })}
                  placeholder="signup_completed"
                />
                <datalist id="alert-event-options">
                  {events.map((e) => (
                    <option key={e.event_name} value={e.event_name} />
                  ))}
                </datalist>
              </label>
              <label className="field">
                <span>Metric</span>
                <select value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value as any })}>
                  <option value="events">Events count</option>
                  <option value="users">Unique users</option>
                </select>
              </label>
              <label className="field">
                <span>Operator</span>
                <select value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value as any })}>
                  <option value="lt">less than</option>
                  <option value="lte">at most</option>
                  <option value="gt">greater than</option>
                  <option value="gte">at least</option>
                </select>
              </label>
              <label className="field">
                <span>Threshold</span>
                <input type="number" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: Number(e.target.value) })} />
              </label>
              <label className="field field-wide">
                <span>Webhook URL (optional)</span>
                <input
                  value={form.webhook_url}
                  onChange={(e) => setForm({ ...form, webhook_url: e.target.value })}
                  placeholder="https://hooks.example.com/alert"
                />
              </label>
              <Button onClick={createRule}>Create rule</Button>
            </div>
          </Card>

          <Card title={`Active rules (${rules.length})`}>
            {rules.length === 0 ? (
              <Empty message="No alert rules yet." />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Condition</th>
                      <th>Status</th>
                      <th>History</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((rule) => (
                      <tr key={rule.id}>
                        <td>
                          <b>{rule.name}</b>
                          <div className="muted mono">{rule.event_name}</div>
                        </td>
                        <td className="mono">
                          {rule.metric} {operatorLabel[rule.operator]} {rule.threshold}
                        </td>
                        <td>
                          <span className={`pill ${rule.enabled ? 'ok' : ''}`}>
                            {rule.enabled ? 'enabled' : 'disabled'}
                          </span>
                        </td>
                        <td>
                          <button className="btn btn-ghost btn-sm" onClick={() => showHistory(rule)}>
                            History
                          </button>
                          {history[rule.id] && (
                            <div className="history-pop">
                              {history[rule.id].length === 0 ? (
                                <span className="muted">No fires yet</span>
                              ) : (
                                history[rule.id].map((h, i) => (
                                  <div key={i} className="history-entry">
                                    <span className={`pill ${h.status === 'breached' ? 'danger' : 'ok'}`}>
                                      {h.status}
                                    </span>
                                    <span className="mono">{h.value}</span>
                                    <span className="muted">{new Date(h.fired_at).toLocaleString()}</span>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </td>
                        <td>
                          <button className="btn btn-ghost btn-sm" onClick={() => toggleRule(rule)}>
                            {rule.enabled ? 'Disable' : 'Enable'}
                          </button>
                          <button className="btn btn-ghost btn-sm danger-text" onClick={() => deleteRule(rule.id)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
