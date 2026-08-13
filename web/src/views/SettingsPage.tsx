import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../lib/auth-context';
import { auth, ingest } from '../lib/api';
import { Card, Button, Spinner, ErrorBanner, Empty } from '../components/ui';
import type { ApiKeyMeta, Project } from '../lib/types';

export default function SettingsPage() {
  const { session, setKeys, setActiveProject, refreshProjects } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [keys, setKeyList] = useState<ApiKeyMeta[]>([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [testEventName, setTestEventName] = useState('pageview');
  const [testPath, setTestPath] = useState('/');
  const [testCount, setTestCount] = useState(5);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true);
    setError('');
    try {
      const [p, k] = await Promise.all([
        auth.listProjects(session.token),
        auth.listApiKeys(session.token, session.activeProjectId),
      ]);
      setProjects(p);
      setKeyList(k);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, [session?.token, session?.activeProjectId]);

  useEffect(() => {
    load();
  }, [load]);

  async function createProject() {
    if (!session?.token || !newProjectName.trim()) return;
    try {
      const project = await auth.createProject(session.token, newProjectName.trim());
      setNewProjectName('');
      setActiveProject(project.id, project.name);
      await refreshProjects();
      await load();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create project');
    }
  }

  async function createKey(type: 'ingestion' | 'query') {
    if (!session?.token) return;
    try {
      const res = await auth.createApiKey(session.token, session.activeProjectId, `${type} key`, type);
      setRevealed((prev) => ({ ...prev, [res.prefix]: res.fullKey }));
      await load();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create API key');
    }
  }

  async function revokeKey(id: string) {
    if (!session?.token) return;
    await auth.revokeApiKey(session.token, id);
    await load();
  }

  function useKey(type: 'ingestion' | 'query') {
    const found = keys.find((k) => k.type === type);
    if (!found) return null;
    return revealed[found.keyPrefix] ?? null;
  }

  function attachKey(type: 'ingestion' | 'query') {
    const full = useKey(type);
    if (!full) return;
    if (!session) return;
    if (type === 'query') setKeys(full, session.ingestionKey ?? '');
    else setKeys(session.queryKey ?? '', full);
    setNotice(`${type} key attached to this browser session.`);
  }

  async function sendTestEvents() {
    if (!session?.ingestionKey) {
      setError('No ingestion key attached. Create one and click "Attach".');
      return;
    }
    setSending(true);
    setError('');
    try {
      const events = Array.from({ length: testCount }, (_, i) => ({
        distinct_id: `tester_${Math.floor(Math.random() * 1000)}`,
        event: testEventName.trim(),
        timestamp: Date.now(),
        session_id: `s_test_${Math.floor(Date.now() / 1000)}`,
        properties: {
          path: testPath,
          browser: ['chrome', 'firefox', 'safari'][i % 3],
          country: ['US', 'DE', 'FR', 'JP'][i % 4],
        },
      }));
      const res = await ingest.send(session.ingestionKey, events);
      setNotice(`Sent ${res.accepted} events (queue depth ${res.queueDepth}).`);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to send test events');
    } finally {
      setSending(false);
    }
  }

  if (!session?.token) return null;
  if (loading) return <Spinner label="Loading settings…" />;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Settings</h2>
          <p className="muted">Projects, API keys, and the test event sender.</p>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}
      {notice && <div className="notice">{notice}</div>}

      <div className="grid-2">
        <Card title="Projects" subtitle="Tenant-isolated analytics namespaces">
          {projects.length === 0 ? (
            <Empty message="No projects." />
          ) : (
            <div className="dash-list">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className={`dash-item ${session.activeProjectId === p.id ? 'active' : ''}`}
                  onClick={() => {
                    setActiveProject(p.id, p.name);
                    load();
                  }}
                >
                  <div className="dash-item-main">
                    <span className="dash-item-name">{p.name}</span>
                    <span className="muted">{p._count?.apiKeys ?? 0} keys</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="dash-create">
            <input
              placeholder="New project name…"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createProject();
              }}
            />
            <Button onClick={createProject}>Create</Button>
          </div>
        </Card>

        <Card title="API keys" subtitle={`Project: ${session.projectName}`}>
          {keys.length === 0 ? (
            <Empty message="No API keys for this project." />
          ) : (
            <div className="dash-list">
              {keys.map((k) => (
                <div key={k.id} className="dash-item">
                  <div className="dash-item-main">
                    <span className="dash-item-name">
                      <span className={`pill ${k.type === 'query' ? 'ok' : ''}`}>{k.type}</span> {k.name}
                    </span>
                    <span className="mono muted">{k.keyPrefix}…</span>
                  </div>
                  <div className="dash-item-actions">
                    {revealed[k.keyPrefix] && (
                      <span className="mono key-reveal">{revealed[k.keyPrefix]}</span>
                    )}
                    {!revealed[k.keyPrefix] && (
                      <button className="btn btn-ghost btn-sm" onClick={() => createKey(k.type as any)}>
                        Regenerate
                      </button>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => revokeKey(k.id)}>
                      Revoke
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="dash-create">
            <Button variant="secondary" onClick={() => createKey('ingestion')}>
              New ingestion key
            </Button>
            <Button variant="secondary" onClick={() => createKey('query')}>
              New query key
            </Button>
            {keys.some((k) => k.type === 'query') && (
              <Button onClick={() => attachKey('query')}>Attach query key</Button>
            )}
            {keys.some((k) => k.type === 'ingestion') && (
              <Button onClick={() => attachKey('ingestion')}>Attach ingestion key</Button>
            )}
          </div>
          <p className="muted">
            Query key attached: {session.queryKey ? 'yes' : 'no'} · Ingestion key attached:{' '}
            {session.ingestionKey ? 'yes' : 'no'}
          </p>
        </Card>
      </div>

      <Card title="Send test events" subtitle="Exercise the full pipeline: ingest → stream → ClickHouse">
        <div className="alert-form">
          <label className="field">
            <span>Event name</span>
            <input value={testEventName} onChange={(e) => setTestEventName(e.target.value)} />
          </label>
          <label className="field">
            <span>Path property</span>
            <input value={testPath} onChange={(e) => setTestPath(e.target.value)} />
          </label>
          <label className="field">
            <span>Count</span>
            <input
              type="number"
              min={1}
              max={500}
              value={testCount}
              onChange={(e) => setTestCount(Math.max(1, Math.min(500, Number(e.target.value))))}
            />
          </label>
          <Button onClick={sendTestEvents} disabled={sending}>
            {sending ? 'Sending…' : 'Send test events'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
