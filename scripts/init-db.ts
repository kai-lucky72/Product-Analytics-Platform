import { execFileSync } from 'node:child_process';
import { config, createClickHouse, createLogger, ensureAnalyticsSchema } from '@analytics/shared';
import * as path from 'node:path';

const logger = createLogger('init-db');

async function main() {
  const root = process.cwd();

  // 1. Prisma migrations for the two OLTP services.
  const migrations: Array<{ dir: string; env: Record<string, string | undefined> }> = [
    { dir: 'services/auth', env: { DATABASE_URL: config.postgres.url } },
    {
      dir: 'services/dashboard-config',
      env: { DATABASE_URL: config.postgres.dashboardsUrl },
    },
  ];
  for (const { dir, env } of migrations) {
    logger.info('running prisma migrate deploy', { dir });
    try {
      execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
        cwd: path.join(root, dir),
        stdio: 'inherit',
        env: { ...process.env, ...env },
      });
    } catch (err) {
      logger.error('prisma migrate failed', { dir, error: String(err) });
      process.exit(1);
    }
  }

  // 2. ClickHouse OLAP schema (events, hourly_events, MV, sessions, event_names).
  logger.info('ensuring clickhouse schema');
  const ch = createClickHouse();
  await ensureAnalyticsSchema(ch);
  await ch.close();

  logger.info('init-db complete');
}

main().catch((err) => {
  logger.error('init-db failed', { error: String(err) });
  process.exit(1);
});
