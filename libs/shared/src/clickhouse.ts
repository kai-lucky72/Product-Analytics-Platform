import { createClient, type ClickHouseClient } from '@clickhouse/client';
import { config } from './config';

/**
 * Shared ClickHouse client factory.
 *
 * ClickHouse is the OLAP / column-store analytics backend. Unlike Postgres (the
 * OLTP store for relational config data), every analytics table here is an
 * append-only, column-oriented MergeTree table, optimized for range scans over
 * time series rather than row lookups.
 */
export function createClickHouse(): ClickHouseClient {
  return createClient({
    url: config.clickhouse.url,
    username: config.clickhouse.username,
    password: config.clickhouse.password,
    database: config.clickhouse.database,
    request_timeout: 60_000,
    max_open_connections: 8,
    compression: { request: true, response: true },
  });
}

export type { ClickHouseClient };
