import type { ClickHouseClient } from '@clickhouse/client';

/**
 * Canonical ClickHouse schema. Shared by the stream processor (ensures schema
 * at startup) and the init-db script so DDL never drifts.
 */

export const CLICKHOUSE_DDL: string[] = [
  // Core append-only event store. Column-oriented MergeTree optimized for
  // range scans over (project_id, event_name, timestamp). ReplacingMergeTree
  // collapses duplicate inserts of the same event_id (crash-window redelivery)
  // at merge time, making the pipeline idempotent on top of at-least-once.
  `CREATE TABLE IF NOT EXISTS analytics.events (
     event_id UUID,
     project_id String,
     distinct_id String,
     event_name String,
     timestamp DateTime64(6, 'UTC'),
     received_at DateTime64(6, 'UTC'),
     session_id Nullable(String),
     properties_json String,
     properties_keys Array(String),
     properties_values Array(String),
     INDEX idx_distinct distinct_id TYPE bloom_filter(0.02) GRANULARITY 1,
     INDEX idx_props_keys properties_keys TYPE bloom_filter(0.02) GRANULARITY 1
   ) ENGINE = ReplacingMergeTree
   PARTITION BY toYYYYMM(timestamp)
   ORDER BY (project_id, event_name, timestamp, event_id)
   TTL toDateTime(timestamp) + INTERVAL 12 MONTH
   SETTINGS index_granularity = 8192`,

  // Real-time aggregation table. AggregatingMergeTree stores per-hour distinct
  // user state (uniqExactState) which is merged in the background — so queries
  // never rescan raw events for counts.
  `CREATE TABLE IF NOT EXISTS analytics.hourly_events (
     project_id String,
     event_name String,
     hour DateTime('UTC'),
     events UInt64,
     users AggregateFunction(uniqExact, String)
   ) ENGINE = AggregatingMergeTree
   PARTITION BY toYYYYMM(hour)
   ORDER BY (project_id, event_name, hour)
   SETTINGS index_granularity = 8192`,

  // Materialized view turns every insert into the raw events table into an
  // incremental, aggregated write to hourly_events. This is the backbone of
  // the "real-time aggregation" story: ingest once, aggregate for free.
  `CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.hourly_events_mv
   TO analytics.hourly_events AS
   SELECT
     project_id,
     event_name,
     toStartOfHour(timestamp) AS hour,
     count() AS events,
     uniqExactState(distinct_id) AS users
   FROM analytics.events
   GROUP BY project_id, event_name, hour`,

  // Session store for session-level queries.
  `CREATE TABLE IF NOT EXISTS analytics.sessions (
     session_id String,
     project_id String,
     distinct_id String,
     started_at DateTime64(6, 'UTC'),
     ended_at DateTime64(6, 'UTC'),
     event_count UInt32
   ) ENGINE = MergeTree
   PARTITION BY toYYYYMM(started_at)
   ORDER BY (project_id, started_at)
   TTL toDateTime(started_at) + INTERVAL 12 MONTH`,

  // Event-name dictionary for typeahead / filter UIs.
  `CREATE TABLE IF NOT EXISTS analytics.event_names (
     project_id String,
     event_name String,
     last_seen DateTime
   ) ENGINE = ReplacingMergeTree(last_seen)
   ORDER BY (project_id, event_name)`,
];

export async function ensureAnalyticsSchema(client: ClickHouseClient): Promise<void> {
  for (const ddl of CLICKHOUSE_DDL) {
    await client.command({ query: ddl });
  }
}
