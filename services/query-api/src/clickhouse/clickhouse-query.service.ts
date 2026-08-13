import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { createClickHouse, type ClickHouseClient } from '@analytics/shared';

/**
 * Read-side ClickHouse client. Query parameters are always bound through
 * ClickHouse's native named-parameter mechanism — user input never touches the
 * SQL string directly.
 */
@Injectable()
export class ClickHouseQueryService implements OnApplicationShutdown {
  readonly client: ClickHouseClient;

  constructor() {
    this.client = createClickHouse();
  }

  async run<T = any>(query: string, params: Record<string, unknown> = {}): Promise<T[]> {
    const rs = await this.client.query({
      query,
      query_params: params,
      format: 'JSONEachRow',
    });
    return (await rs.json()) as T[];
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client.close().catch(() => {});
  }
}
