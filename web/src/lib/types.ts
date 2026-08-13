export interface User {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  projectId?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
  apiKeys?: {
    ingestion: string;
    query: string;
  };
}

export interface Session {
  token: string;
  user: User;
  activeProjectId: string;
  queryKey?: string;
  ingestionKey?: string;
  projectName?: string;
}

export interface MetricPoint {
  ts_ms: number;
  events: number;
  users: number;
}

export interface Overview {
  series: MetricPoint[];
  total_events: number;
  total_users: number;
  active_users: number;
  events_per_user: number;
}

export interface MetricSeriesResponse {
  metric: 'events' | 'users';
  series: Array<{ ts_ms: number; value: number }>;
  total: number;
}

export interface FunnelStep {
  index: number;
  event: string;
  users: number;
  conversion: number;
}

export interface Funnel {
  steps: FunnelStep[];
  total_users: number;
}

export interface RetentionCohort {
  cohort_start_ms: number;
  cohort_users: number;
  retained: number[];
}

export interface Retention {
  cohorts: RetentionCohort[];
  period_days: number;
  periods: number;
}

export interface EventRow {
  event_id: string;
  distinct_id: string;
  event_name: string;
  ts_ms: number;
  properties: Record<string, unknown>;
  session_id: string | null;
}

export interface EventPage {
  events: EventRow[];
  total: number;
}

export interface EventName {
  event_name: string;
  last_seen_ms: number;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  _count?: { apiKeys: number };
}

export interface ApiKeyMeta {
  id: string;
  name: string;
  keyPrefix: string;
  type: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface DashboardSummary {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { panels: number };
}

export interface Panel {
  id: string;
  dashboardId: string;
  type: 'overview' | 'metric' | 'funnel' | 'retention' | 'events';
  title: string;
  config: Record<string, unknown>;
  position: number;
  width: number;
  height: number;
  createdAt: string;
}

export interface Dashboard {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  panels: Panel[];
}

export interface AlertRule {
  id: string;
  project_id: string;
  name: string;
  metric: 'events' | 'users';
  event_name: string;
  operator: 'gt' | 'lt' | 'gte' | 'lte';
  threshold: number;
  window_ms: number;
  evaluate_every_ms: number;
  cooldown_ms: number;
  webhook_url?: string;
  enabled: boolean;
  created_at: string;
}

export interface AlertHistoryEntry {
  rule_id: string;
  rule_name: string;
  project_id: string;
  metric: string;
  event_name: string;
  value: number;
  status: 'breached' | 'resolved';
  fired_at: string;
}
