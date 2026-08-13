import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { createClickHouse, ensureAnalyticsSchema, createLogger, type ClickHouseClient } from '@analytics/shared';

export interface EventsRow {
  event_id: string;
  project_id: string;
  distinct_id: string;
  event_name: string;
  timestamp: string;
  received_at: string;
  session_id: string | null;
  properties_json: string;
  properties_keys: string[];
  properties_values: string[];
}

@Injectable()
export class ClickHouseService implements OnApplicationShutdown {
  private readonly logger = createLogger('stream-processor:clickhouse');
  readonly client: ClickHouseClient;

  constructor() {
    this.client = createClickHouse();
  }

  async ensureSchema(): Promise<void> {
    await ensureAnalyticsSchema(this.client);
    this.logger.info('clickhouse schema ensured');
  }

  /**
   * Append a batch of rows to the raw events table. The materialized view on
   * top handles real-time aggregation; this write path is intentionally dumb
   * (insert-only, column-oriented) so it can absorb bursts.
   */
  async insertEvents(rows: EventsRow[]): Promise<void> {
    if (rows.length === 0) return;
    await this.client.insert({
      table: 'events',
      values: rows,
      format: 'JSONEachRow',
    });
  }

  async recordEventNames(projectId: string, names: string[]): Promise<void> {
    if (names.length === 0) return;
    const values = [...new Set(names)].map((name) => ({
      project_id: projectId,
      event_name: name,
      last_seen: formatChTs(Date.now()),
    }));
    await this.client
      .insert({ table: 'event_names', values, format: 'JSONEachRow' })
      .catch((err) => this.logger.debug('event_names upsert failed', { error: String(err) }));
  }

  async recordSession(row: {
    session_id: string;
    project_id: string;
    distinct_id: string;
    started_at: string;
    ended_at: string;
    event_count: number;
  }): Promise<void> {
    await this.client
      .insert({ table: 'sessions', values: [row], format: 'JSONEachRow' })
      .catch((err) => this.logger.debug('session insert failed', { error: String(err) }));
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client.close().catch(() => {});
  }
}

export function formatChTs(ms: number): string {
  const d = new Date(ms);
  const base = d.toISOString().slice(0, 19).replace('T', ' ');
  return `${base}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}
