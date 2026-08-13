import type {
  AlertHistoryEntry,
  AlertRule,
  ApiKeyMeta,
  AuthResponse,
  Dashboard,
  DashboardSummary,
  EventName,
  EventPage,
  Funnel,
  MetricSeriesResponse,
  Overview,
  Panel,
  Project,
  Retention,
  Session,
} from './types';

const SESSION_KEY = 'nimbus:session';

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null): void {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string; apiKey?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.token) headers['authorization'] = `Bearer ${opts.token}`;
  if (opts.apiKey) headers['authorization'] = `Bearer ${opts.apiKey}`;

  const res = await fetch(path, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      const message = Array.isArray(body.message)
        ? (body.message as string[]).join(', ')
        : (body.message as string) ?? body.error;
      if (message) detail = message;
    } catch {
      /* keep statusText */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export const auth = {
  register(input: {
    email: string;
    password: string;
    name: string;
    organizationName?: string;
  }): Promise<AuthResponse> {
    return request('/auth/register', { method: 'POST', body: input });
  },
  login(input: { email: string; password: string }): Promise<AuthResponse> {
    return request('/auth/login', { method: 'POST', body: input });
  },
  me(token: string) {
    return request('/auth/me', { token });
  },
  listProjects(token: string): Promise<Project[]> {
    return request('/projects', { token });
  },
  listApiKeys(token: string, projectId: string): Promise<ApiKeyMeta[]> {
    return request(`/projects/${projectId}/api-keys`, { token });
  },
  createProject(token: string, name: string): Promise<Project> {
    return request('/projects', { method: 'POST', token, body: { name } });
  },
  createApiKey(
    token: string,
    projectId: string,
    name: string,
    type: 'ingestion' | 'query',
  ): Promise<{ fullKey: string; prefix: string }> {
    return request(`/projects/${projectId}/api-keys`, {
      method: 'POST',
      token,
      body: { name, type },
    });
  },
  revokeApiKey(token: string, apiKeyId: string) {
    return request(`/api-keys/${apiKeyId}`, { method: 'DELETE', token });
  },
};

// ---------------------------------------------------------------------------
// Analytics (query-api, protected by query key)
// ---------------------------------------------------------------------------
export const analytics = {
  overview(apiKey: string, from: number, to: number, granularity: string): Promise<Overview> {
    return request(`/api/v1/overview?from=${from}&to=${to}&granularity=${granularity}`, {
      apiKey,
    });
  },
  metricSeries(
    apiKey: string,
    eventName: string,
    from: number,
    to: number,
    granularity: string,
    metric: 'events' | 'users',
  ): Promise<MetricSeriesResponse> {
    return request(
      `/api/v1/metrics/series?event_name=${encodeURIComponent(eventName)}&from=${from}&to=${to}&granularity=${granularity}&metric=${metric}`,
      { apiKey },
    );
  },
  funnel(
    apiKey: string,
    steps: string[],
    from: number,
    to: number,
    windowSeconds: number,
  ): Promise<Funnel> {
    return request(
      `/api/v1/funnel?steps=${encodeURIComponent(steps.join(','))}&from=${from}&to=${to}&window_seconds=${windowSeconds}`,
      { apiKey },
    );
  },
  retention(
    apiKey: string,
    triggerEvent: string,
    returningEvent: string,
    from: number,
    to: number,
    periodDays: number,
    periods: number,
  ): Promise<Retention> {
    return request(
      `/api/v1/retention?trigger_event=${encodeURIComponent(triggerEvent)}&returning_event=${encodeURIComponent(returningEvent)}&from=${from}&to=${to}&period_days=${periodDays}&periods=${periods}`,
      { apiKey },
    );
  },
  events(
    apiKey: string,
    params: {
      from: number;
      to: number;
      limit?: number;
      offset?: number;
      event_name?: string;
      distinct_id?: string;
      search?: string;
    },
  ): Promise<EventPage> {
    const q = new URLSearchParams({
      from: String(params.from),
      to: String(params.to),
      limit: String(params.limit ?? 100),
      offset: String(params.offset ?? 0),
    });
    if (params.event_name) q.set('event_name', params.event_name);
    if (params.distinct_id) q.set('distinct_id', params.distinct_id);
    if (params.search) q.set('search', params.search);
    return request(`/api/v1/events?${q.toString()}`, { apiKey });
  },
  eventNames(apiKey: string, search?: string): Promise<EventName[]> {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    return request(`/api/v1/event-names${q}`, { apiKey });
  },
};

// ---------------------------------------------------------------------------
// Ingestion
// ---------------------------------------------------------------------------
export const ingest = {
  send(
    ingestionKey: string,
    events: Array<{
      distinct_id: string;
      event: string;
      timestamp: number;
      properties?: Record<string, unknown>;
      session_id?: string;
    }>,
  ): Promise<{ accepted: number; rejected: number; queueDepth: number }> {
    return request('/i/event', {
      method: 'POST',
      body: { api_key: ingestionKey, batch: events },
    });
  },
};

// ---------------------------------------------------------------------------
// Dashboards (dashboard-config)
// ---------------------------------------------------------------------------
export const dashboards = {
  list(projectId: string): Promise<DashboardSummary[]> {
    return request(`/api/v1/dashboards?project_id=${projectId}`);
  },
  get(id: string): Promise<Dashboard> {
    return request(`/api/v1/dashboards/${id}`);
  },
  create(input: { project_id: string; name: string; description?: string }): Promise<DashboardSummary> {
    return request('/api/v1/dashboards', { method: 'POST', body: input });
  },
  remove(id: string) {
    return request(`/api/v1/dashboards/${id}`, { method: 'DELETE' });
  },
  addPanel(dashboardId: string, panel: Partial<Panel> & { type: string; title: string }): Promise<Panel> {
    return request(`/api/v1/dashboards/${dashboardId}/panels`, { method: 'POST', body: panel });
  },
  updatePanel(panelId: string, patch: Partial<Panel>): Promise<Panel> {
    return request(`/api/v1/dashboards/panels/${panelId}`, { method: 'PATCH', body: patch });
  },
  removePanel(panelId: string) {
    return request(`/api/v1/dashboards/panels/${panelId}`, { method: 'DELETE' });
  },
};

// ---------------------------------------------------------------------------
// Alerts (alerting)
// ---------------------------------------------------------------------------
export const alerts = {
  list(): Promise<AlertRule[]> {
    return request('/api/v1/rules');
  },
  create(input: {
    project_id: string;
    name: string;
    metric: 'events' | 'users';
    event_name: string;
    operator: 'gt' | 'lt' | 'gte' | 'lte';
    threshold: number;
    window_ms?: number;
    evaluate_every_ms?: number;
    cooldown_ms?: number;
    webhook_url?: string;
    enabled?: boolean;
  }): Promise<AlertRule> {
    return request('/api/v1/rules', { method: 'POST', body: input });
  },
  update(id: string, patch: Partial<AlertRule>): Promise<AlertRule> {
    return request(`/api/v1/rules/${id}`, { method: 'PATCH', body: patch });
  },
  remove(id: string) {
    return request(`/api/v1/rules/${id}`, { method: 'DELETE' });
  },
  history(id: string, limit = 20): Promise<AlertHistoryEntry[]> {
    return request(`/api/v1/rules/${id}/history?limit=${limit}`);
  },
};
