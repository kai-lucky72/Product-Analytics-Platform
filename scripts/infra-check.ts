import { createClickHouse, createLogger, createRedis, config } from '@analytics/shared';

const logger = createLogger('infra-check');

async function main() {
  let ok = true;

  // Redis
  try {
    const redis = createRedis();
    await redis.ping();
    logger.info('redis: OK', { host: config.redis.host, port: config.redis.port });
    redis.disconnect();
  } catch (err) {
    ok = false;
    logger.error('redis: FAIL', { error: String(err) });
  }

  // ClickHouse
  try {
    const ch = createClickHouse();
    const rs = await ch.query({ query: 'SELECT 1 AS one', format: 'JSONEachRow' });
    const rows = await rs.json();
    logger.info('clickhouse: OK', { url: config.clickhouse.url, one: rows[0]?.one });
    await ch.close();
  } catch (err) {
    ok = false;
    logger.error('clickhouse: FAIL', { error: String(err) });
  }

  // Postgres
  try {
    const url = new URL(config.postgres.url);
    const { default: net } = await import('node:net');
    const reachable = await new Promise<boolean>((resolve) => {
      const sock = net.connect(Number(url.port), url.hostname, () => {
        sock.destroy();
        resolve(true);
      });
      sock.on('error', () => resolve(false));
    });
    logger.info(reachable ? 'postgres: OK' : 'postgres: FAIL', {
      host: url.hostname,
      port: url.port,
    });
    if (!reachable) ok = false;
  } catch (err) {
    ok = false;
    logger.error('postgres: FAIL', { error: String(err) });
  }

  logger.info(ok ? 'infra check passed' : 'infra check FAILED');
  process.exit(ok ? 0 : 1);
}

main();
