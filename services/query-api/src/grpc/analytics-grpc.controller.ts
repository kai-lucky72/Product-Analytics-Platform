import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { AnalyticsService } from '../analytics/analytics.service';

interface OverviewRequest {
  project_id: string;
  from_ms: string;
  to_ms: string;
  granularity?: string;
}

interface FunnelRequest {
  project_id: string;
  steps: string[];
  from_ms: string;
  to_ms: string;
  window_seconds?: string;
}

interface RetentionRequest {
  project_id: string;
  trigger_event: string;
  returning_event: string;
  from_ms: string;
  to_ms: string;
  period_days?: string;
  periods?: string;
}

interface EventQueryRequest {
  project_id: string;
  event_name?: string;
  distinct_id?: string;
  search?: string;
  from_ms: string;
  to_ms: string;
  limit?: number;
  offset?: number;
}

interface MetricSeriesRequest {
  project_id: string;
  event_name: string;
  from_ms: string;
  to_ms: string;
  granularity?: string;
  metric?: string;
}

const ms = (v: string | number | undefined, fallback: number): number =>
  v === undefined || v === '' ? fallback : Number(v);

/**
 * Internal gRPC implementation of the AnalyticsQuery service. Alerting (and any
 * future internal consumer) talks to analytics through this surface without
 * needing API keys or REST.
 */
@Controller()
export class AnalyticsGrpcController {
  constructor(private readonly analytics: AnalyticsService) {}

  @GrpcMethod('AnalyticsQuery', 'GetOverview')
  async getOverview(req: OverviewRequest) {
    const granularity = (['hour', 'day', 'week'] as const).includes(req.granularity as any)
      ? (req.granularity as 'hour' | 'day' | 'week')
      : 'day';
    const result = await this.analytics.overview(
      req.project_id,
      ms(req.from_ms, Date.now() - 30 * 86_400_000),
      ms(req.to_ms, Date.now()),
      granularity,
    );
    return {
      series: result.series.map((p) => ({ ts_ms: p.ts_ms, events: p.events, users: p.users })),
      total_events: result.total_events,
      total_users: result.total_users,
      active_users: result.active_users,
      events_per_user: result.events_per_user,
      users_per_visitor: 0,
    };
  }

  @GrpcMethod('AnalyticsQuery', 'GetFunnel')
  async getFunnel(req: FunnelRequest) {
    const result = await this.analytics.funnel(
      req.project_id,
      req.steps ?? [],
      ms(req.from_ms, Date.now() - 30 * 86_400_000),
      ms(req.to_ms, Date.now()),
      ms(req.window_seconds, 86_400 * 7),
    );
    return {
      steps: result.steps.map((s) => ({
        index: s.index,
        event: s.event,
        count: s.users,
        users: s.users,
        conversion: s.conversion,
      })),
      total_users: result.total_users,
    };
  }

  @GrpcMethod('AnalyticsQuery', 'GetRetention')
  async getRetention(req: RetentionRequest) {
    const result = await this.analytics.retention(
      req.project_id,
      req.trigger_event,
      req.returning_event,
      ms(req.from_ms, Date.now() - 90 * 86_400_000),
      ms(req.to_ms, Date.now()),
      ms(req.period_days, 7),
      ms(req.periods, 8),
    );
    return {
      cohorts: result.cohorts.map((c) => ({
        cohort_start_ms: c.cohort_start_ms,
        cohort_users: c.cohort_users,
        retained_users: c.retained,
      })),
      period_days: result.period_days,
    };
  }

  @GrpcMethod('AnalyticsQuery', 'GetEvents')
  async getEvents(req: EventQueryRequest) {
    const result = await this.analytics.events(req.project_id, {
      eventName: req.event_name,
      distinctId: req.distinct_id,
      search: req.search,
      fromMs: ms(req.from_ms, Date.now() - 30 * 86_400_000),
      toMs: ms(req.to_ms, Date.now()),
      limit: req.limit ?? 100,
      offset: req.offset ?? 0,
    });
    return {
      events: result.events.map((e) => ({
        event_id: e.event_id,
        distinct_id: e.distinct_id,
        event_name: e.event_name,
        ts_ms: e.ts_ms,
        properties: JSON.stringify(e.properties),
        session_id: e.session_id,
      })),
      total: result.total,
    };
  }

  @GrpcMethod('AnalyticsQuery', 'GetMetricSeries')
  async getMetricSeries(req: MetricSeriesRequest) {
    const granularity = (['hour', 'day', 'week'] as const).includes(req.granularity as any)
      ? (req.granularity as 'hour' | 'day' | 'week')
      : 'day';
    const metric = req.metric === 'users' ? 'users' : 'events';
    const points = await this.analytics.metricSeries(
      req.project_id,
      req.event_name,
      ms(req.from_ms, Date.now() - 30 * 86_400_000),
      ms(req.to_ms, Date.now()),
      granularity,
      metric,
    );
    const total = points.reduce((acc, p) => acc + (metric === 'events' ? p.events : p.users), 0);
    return {
      series: points.map((p) => ({ ts_ms: p.ts_ms, value: metric === 'events' ? p.events : p.users })),
      total,
      total_users: points.reduce((acc, p) => acc + p.users, 0),
    };
  }
}
