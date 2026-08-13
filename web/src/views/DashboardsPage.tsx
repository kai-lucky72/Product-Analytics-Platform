import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../lib/auth-context';
import { dashboards } from '../lib/api';
import { Card, Button, Spinner, ErrorBanner, Empty } from '../components/ui';
import { Timeseries, FunnelChart, RetentionMatrix } from '../components/charts';
import { analytics } from '../lib/api';
import type { Dashboard, DashboardSummary, Panel } from '../lib/types';
import { useDateRange } from '../lib/useDateRange';

export default function DashboardsPage() {
  const { session } = useAuth();
  const { from, to, granularity } = useDateRange('30d');
  const [summaries, setSummaries] = useState<DashboardSummary[]>([]);
  const [active, setActive] = useState<Dashboard | null>(null);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [panelData, setPanelData] = useState<Record<string, any>>({});

  const load = useCallback(async () => {
    if (!session?.activeProjectId) return;
    setLoading(true);
    setError('');
    try {
      const list = await dashboards.list(session.activeProjectId);
      setSummaries(list);
      if (list.length > 0) {
        const detail = await dashboards.get(list[0].id);
        setActive(detail);
      } else {
        setActive(null);
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load dashboards');
    } finally {
      setLoading(false);
    }
  }, [session?.activeProjectId]);

  useEffect(() => {
    load();
  }, [load]);

  const loadPanelData = useCallback(
    async (panel: Panel) => {
      if (!session?.queryKey) return null;
      const key = panel.id;
      try {
        switch (panel.type) {
          case 'overview': {
            const g = (panel.config.granularity as string) ?? granularity;
            const ov = await analytics.overview(session.queryKey, from, to, g);
            return {
              chart: (
                <Timeseries
                  data={ov.series.map((p) => ({ ts_ms: p.ts_ms, events: p.events }))}
                  dataKey="events"
                  granularity={g}
                />
              ),
              meta: { events: ov.total_events, users: ov.total_users, active: ov.active_users },
            };
          }
          case 'metric': {
            const cfg = panel.config;
            const eventName = (cfg.event_name as string) ?? '';
            const metric = (cfg.metric as 'events' | 'users') ?? 'events';
            const g = (cfg.granularity as string) ?? granularity;
            if (!eventName) return null;
            const res = await analytics.metricSeries(session.queryKey, eventName, from, to, g, metric);
            return {
              chart: (
                <Timeseries
                  data={res.series.map((p) => ({ ts_ms: p.ts_ms, value: p.value }))}
                  dataKey="value"
                  granularity={g}
                  color={metric === 'users' ? '#22c55e' : '#6366f1'}
                />
              ),
              meta: { total: res.total, name: eventName },
            };
          }
          case 'funnel': {
            const cfg = panel.config;
            const steps = (cfg.steps as string[]) ?? [];
            const win = (cfg.window_seconds as number) ?? 1209600;
            if (steps.length === 0) return null;
            const res = await analytics.funnel(session.queryKey, steps, from, to, win);
            return {
              chart: (
                <FunnelChart
                  data={res.steps.map((s) => ({ event: `${s.event}  (${s.conversion}%)`, users: s.users }))}
                />
              ),
              meta: { total: res.total_users },
            };
          }
          case 'retention': {
            const cfg = panel.config;
            const trigger = (cfg.trigger_event as string) ?? 'signup_completed';
            const returning = (cfg.returning_event as string) ?? 'pageview';
            const periodDays = (cfg.period_days as number) ?? 7;
            const periods = (cfg.periods as number) ?? 8;
            const res = await analytics.retention(session.queryKey, trigger, returning, from, to, periodDays, periods);
            return {
              chart: (
                <RetentionMatrix
                  cohorts={res.cohorts.map((c) => ({
                    label: new Date(c.cohort_start_ms).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    }),
                    values: c.retained,
                  }))}
                />
              ),
              meta: { cohorts: res.cohorts.length },
            };
          }
          default:
            return null;
        }
      } catch {
        return null;
      }
    },
    [session?.queryKey, from, to, granularity],
  );

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    Promise.all(
      active.panels.map(async (p) => {
        const data = await loadPanelData(p);
        if (!cancelled) setPanelData((prev) => ({ ...prev, [p.id]: data }));
      }),
    ).then(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [active, loadPanelData]);

  async function createDashboard() {
    if (!session?.activeProjectId || !newName.trim()) return;
    try {
      const created = await dashboards.create({
        project_id: session.activeProjectId,
        name: newName.trim(),
      });
      setNewName('');
      await load();
      const detail = await dashboards.get(created.id);
      setActive(detail);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create dashboard');
    }
  }

  async function deleteDashboard(id: string) {
    await dashboards.remove(id);
    await load();
  }

  function selectDashboard(d: DashboardSummary) {
    dashboards.get(d.id).then(setActive).catch(() => {});
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Dashboards</h2>
          <p className="muted">Saved panel layouts stored by the dashboard-config service.</p>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}
      {loading && <Spinner label="Loading dashboards…" />}

      {!loading && (
        <div className="dashboards-layout">
          <div className="dashboards-list">
            <Card title="Dashboards">
              <div className="dash-list">
                {summaries.length === 0 && <Empty message="No dashboards yet." />}
                {summaries.map((d) => (
                  <div
                    key={d.id}
                    className={`dash-item ${active?.id === d.id ? 'active' : ''}`}
                    onClick={() => selectDashboard(d)}
                  >
                    <div className="dash-item-main">
                      <span className="dash-item-name">{d.name}</span>
                      <span className="muted">{d._count?.panels ?? 0} panels</span>
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteDashboard(d.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
              <div className="dash-create">
                <input
                  placeholder="New dashboard name…"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') createDashboard();
                  }}
                />
                <Button onClick={createDashboard}>Create</Button>
              </div>
            </Card>
          </div>

          <div className="dashboards-canvas">
            {active ? (
              <>
                <div className="page-head">
                  <div>
                    <h2>{active.name}</h2>
                    <p className="muted">{active.description ?? ''}</p>
                  </div>
                </div>
                {active.panels.length === 0 && (
                  <Empty message="This dashboard has no panels yet." />
                )}
                <div className="panel-grid">
                  {active.panels.map((p) => {
                    const data = panelData[p.id];
                    return (
                      <Card key={p.id} title={p.title} className={`panel-w${Math.min(p.width, 12)}`}>
                        {data ? (
                          <>
                            {data.meta && (
                              <div className="panel-meta">
                                {Object.entries(data.meta).map(([k, v]) => (
                                  <span key={k} className="pill">
                                    {k}: {String(v)}
                                  </span>
                                ))}
                              </div>
                            )}
                            {data.chart}
                          </>
                        ) : (
                          <Empty message="No data." />
                        )}
                      </Card>
                    );
                  })}
                </div>
              </>
            ) : (
              <Card title="No dashboard selected">
                <Empty message="Create a dashboard to get started." />
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
