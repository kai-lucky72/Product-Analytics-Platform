import { Injectable } from '@nestjs/common';
import { createLogger, type Granularity } from '@analytics/shared';
import { ClickHouseQueryService } from '../clickhouse/clickhouse-query.service';

export interface MetricPoint {
  ts_ms: number;
  events: number;
  users: number;
}

export interface OverviewResult {
  series: MetricPoint[];
  total_events: number;
  total_users: number;
  active_users: number;
  events_per_user: number;
}

export interface FunnelStep {
  index: number;
  event: string;
  users: number;
  conversion: number;
}

export interface FunnelResult {
  steps: FunnelStep[];
  total_users: number;
}

export interface RetentionCohort {
  cohort_start_ms: number;
  cohort_users: number;
  retained: number[];
}

export interface RetentionResult {
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

const BUCKET_EXPR: Record<Granularity, string> = {
  hour: 'hour',
  day: 'toStartOfInterval(hour, INTERVAL 1 DAY)',
  week: 'toStartOfInterval(hour, INTERVAL 1 WEEK)',
};

const MS = 1000;
const DAY_MS = 86_400_000;

@Injectable()
export class AnalyticsService {
  private readonly logger = createLogger('query-api:analytics');

  constructor(private readonly ch: ClickHouseQueryService) {}

  // -------------------------------------------------------------------------
  // Overview
  // -------------------------------------------------------------------------
  async overview(
    projectId: string,
    fromMs: number,
    toMs: number,
    granularity: Granularity,
  ): Promise<OverviewResult> {
    const bucket = BUCKET_EXPR[granularity];
    const range = this.rangeClause(fromMs, toMs);

    const series = await this.ch.run<MetricPoint>(
      `SELECT toUnixTimestamp(${bucket}) * ${MS} AS ts_ms,
              sum(events) AS events,
              uniqMerge(users) AS users
       FROM analytics.hourly_events
       WHERE project_id = {project_id:String} AND ${range}
       GROUP BY ${bucket}
       ORDER BY ts_ms ASC`,
      { project_id: projectId, from: fromMs, to: toMs },
    );

    const [totals] = await this.ch.run<{ events: number; users: number }>(
      `SELECT sum(events) AS events, uniqMerge(users) AS users
       FROM analytics.hourly_events
       WHERE project_id = {project_id:String} AND ${range}`,
      { project_id: projectId, from: fromMs, to: toMs },
    );

    const activeFrom = toMs - 7 * DAY_MS;
    const [active] = await this.ch.run<{ users: number }>(
      `SELECT uniqMerge(users) AS users
       FROM analytics.hourly_events
       WHERE project_id = {project_id:String}
         AND hour >= toDateTime64({active_from:Int64}/${MS}, 6, 'UTC')
         AND hour <= toDateTime64({to:Int64}/${MS}, 6, 'UTC')`,
      { project_id: projectId, active_from: activeFrom, to: toMs },
    );

    const totalEvents = Number(totals?.events ?? 0);
    const totalUsers = Number(totals?.users ?? 0);

    return {
      series: series.map((s) => ({
        ts_ms: Number(s.ts_ms),
        events: Number(s.events),
        users: Number(s.users),
      })),
      total_events: totalEvents,
      total_users: totalUsers,
      active_users: Number(active?.users ?? 0),
      events_per_user: totalUsers > 0 ? round(totalEvents / totalUsers, 2) : 0,
    };
  }

  // -------------------------------------------------------------------------
  // Metric series (single event, additive or distinct count)
  // -------------------------------------------------------------------------
  async metricSeries(
    projectId: string,
    eventName: string,
    fromMs: number,
    toMs: number,
    granularity: Granularity,
    metric: 'events' | 'users',
  ): Promise<MetricPoint[]> {
    const bucket = BUCKET_EXPR[granularity];
    const range = this.rangeClause(fromMs, toMs);
    const rows = await this.ch.run<MetricPoint>(
      `SELECT toUnixTimestamp(${bucket}) * ${MS} AS ts_ms,
              sum(events) AS events,
              uniqMerge(users) AS users
       FROM analytics.hourly_events
       WHERE project_id = {project_id:String}
         AND event_name = {event_name:String}
         AND ${range}
       GROUP BY ${bucket}
       ORDER BY ts_ms ASC`,
      { project_id: projectId, event_name: eventName, from: fromMs, to: toMs },
    );

    return rows.map((r) => ({
      ts_ms: Number(r.ts_ms),
      events: Number(r.events),
      users: Number(r.users),
    }));
  }

  // -------------------------------------------------------------------------
  // Funnels — ordered multi-step conversion using ClickHouse windowFunnel.
  // -------------------------------------------------------------------------
  async funnel(
    projectId: string,
    steps: string[],
    fromMs: number,
    toMs: number,
    windowSeconds: number,
  ): Promise<FunnelResult> {
    if (steps.length === 0) {
      return { steps: [], total_users: 0 };
    }

    const conditions = steps
      .map((_, i) => `event_name = {step${i}:String}`)
      .join(',\n');
    const params: Record<string, unknown> = {
      project_id: projectId,
      from: fromMs,
      to: toMs,
      win: windowSeconds,
      steps,
    };
    steps.forEach((s, i) => (params[`step${i}`] = s));

    const rows = await this.ch.run<{ level: number; users: number }>(
      `SELECT level, count() AS users
       FROM (
         SELECT distinct_id,
                windowFunnel(toUInt64({win:Int64}))(
                  timestamp,
                  ${conditions}
                ) AS level
         FROM analytics.events FINAL
         WHERE project_id = {project_id:String}
           AND ${this.rangeClause(fromMs, toMs)}
           AND event_name IN {steps:Array(String)}
         GROUP BY distinct_id
       )
       GROUP BY level
       ORDER BY level ASC`,
      params,
    );

    const levelCounts = new Map<number, number>();
    for (const r of rows) levelCounts.set(Number(r.level), Number(r.users));

    const totalUsers = levelCounts.get(1) ?? 0;
    const result: FunnelStep[] = [];

    let reached = 0;
    for (let i = 1; i <= steps.length; i++) {
      reached += levelCounts.get(i) ?? 0;
      result.push({
        index: i - 1,
        event: steps[i - 1],
        users: reached,
        conversion: totalUsers > 0 ? round((reached / totalUsers) * 100, 2) : 0,
      });
    }

    return { steps: result, total_users: totalUsers };
  }

  // -------------------------------------------------------------------------
  // Retention — cohort-based, computed from raw events.
  // -------------------------------------------------------------------------
  async retention(
    projectId: string,
    triggerEvent: string,
    returningEvent: string,
    fromMs: number,
    toMs: number,
    periodDays: number,
    periods: number,
  ): Promise<RetentionResult> {
    if (periods <= 0) periods = 1;
    const bucketExpr = `toStartOfInterval(timestamp, INTERVAL {period_days:Int32} DAY)`;

    const periodCols: string[] = [];
    for (let k = 0; k < periods; k++) {
      periodCols.push(
        `count(DISTINCT if(a.pts = c.cts + toIntervalDay(${k} * {period_days:Int32}), c.distinct_id, NULL)) AS p${k}`,
      );
    }

    const rows = await this.ch.run<any>(
      `WITH cohort AS (
         SELECT distinct_id, ${bucketExpr} AS cts
         FROM analytics.events FINAL
         WHERE project_id = {project_id:String}
           AND event_name = {trigger:String}
           AND ${this.rangeClause(fromMs, toMs)}
         GROUP BY distinct_id, cts
       ),
       activity AS (
         SELECT DISTINCT distinct_id, ${bucketExpr} AS pts
         FROM analytics.events FINAL
         WHERE project_id = {project_id:String}
           AND event_name = {returning:String}
           AND ${this.rangeClause(fromMs, toMs)}
       )
       SELECT
         toUnixTimestamp(c.cts) * ${MS} AS cohort_start_ms,
         count(DISTINCT c.distinct_id) AS cohort_users,
         ${periodCols.join(',\n')}
       FROM cohort c
       LEFT JOIN activity a ON a.distinct_id = c.distinct_id
       GROUP BY c.cts
       ORDER BY c.cts ASC`,
      {
        project_id: projectId,
        trigger: triggerEvent,
        returning: returningEvent,
        from: fromMs,
        to: toMs,
        period_days: periodDays,
      },
    );

    const cohorts: RetentionCohort[] = rows.map((r) => {
      const retained: number[] = [];
      for (let k = 0; k < periods; k++) retained.push(Number(r[`p${k}`] ?? 0));
      return {
        cohort_start_ms: Number(r.cohort_start_ms),
        cohort_users: Number(r.cohort_users),
        retained,
      };
    });

    return { cohorts, period_days: periodDays, periods };
  }

  // -------------------------------------------------------------------------
  // Raw event feed
  // -------------------------------------------------------------------------
  async events(
    projectId: string,
    opts: {
      eventName?: string;
      distinctId?: string;
      search?: string;
      fromMs: number;
      toMs: number;
      limit: number;
      offset: number;
    },
  ): Promise<EventPage> {
    const where = [`project_id = {project_id:String}`, this.rangeClause(opts.fromMs, opts.toMs)];
    const params: Record<string, unknown> = { project_id: projectId, from: opts.fromMs, to: opts.toMs };

    if (opts.eventName) {
      where.push('event_name = {event_name:String}');
      params.event_name = opts.eventName;
    }
    if (opts.distinctId) {
      where.push('distinct_id = {distinct_id:String}');
      params.distinct_id = opts.distinctId;
    }
    if (opts.search) {
      const pattern = `%${escapeLike(opts.search)}%`;
      where.push('(event_name ILIKE {search:String} OR properties_json ILIKE {search:String})');
      params.search = pattern;
    }

    const whereSql = where.join(' AND ');
    const limit = Math.min(Math.max(opts.limit, 1), 1000);

    const [rows, countRow] = await Promise.all([
      this.ch.run<any>(
        `SELECT event_id, distinct_id, event_name,
                toUnixTimestamp(timestamp) * ${MS} AS ts_ms,
                properties_json, session_id
         FROM analytics.events FINAL
         WHERE ${whereSql}
         ORDER BY timestamp DESC
         LIMIT {limit:UInt32} OFFSET {offset:UInt32}`,
        { ...params, limit, offset: opts.offset },
      ),
      this.ch.run<{ total: number }>(
        `SELECT count() AS total
         FROM (SELECT event_id FROM analytics.events FINAL WHERE ${whereSql} GROUP BY event_id)`,
        params,
      ),
    ]);

    return {
      events: rows.map((r) => ({
        event_id: r.event_id,
        distinct_id: r.distinct_id,
        event_name: r.event_name,
        ts_ms: Number(r.ts_ms),
        properties: safeJson(r.properties_json),
        session_id: r.session_id ?? null,
      })),
      total: Number(countRow?.[0]?.total ?? 0),
    };
  }

  async eventNames(projectId: string, search?: string): Promise<Array<{ event_name: string; last_seen_ms: number }>> {
    const where = ['project_id = {project_id:String}'];
    const params: Record<string, unknown> = { project_id: projectId };
    if (search) {
      where.push('event_name ILIKE {search:String}');
      params.search = `%${escapeLike(search)}%`;
    }
    const rows = await this.ch.run<any>(
      `SELECT event_name, toUnixTimestamp(last_seen) * ${MS} AS last_seen_ms
       FROM analytics.event_names
       WHERE ${where.join(' AND ')}
       ORDER BY last_seen DESC
       LIMIT 100`,
      params,
    );
    return rows.map((r) => ({ event_name: r.event_name, last_seen_ms: Number(r.last_seen_ms) }));
  }

  // -------------------------------------------------------------------------
  private rangeClause(fromMs: number, toMs: number): string {
    return `timestamp >= toDateTime64({from:Int64}/${MS}, 6, 'UTC')
            AND timestamp <= toDateTime64({to:Int64}/${MS}, 6, 'UTC')`;
  }
}

const round = (n: number, dp: number) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

const safeJson = (s: string | null): Record<string, unknown> => {
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
};
