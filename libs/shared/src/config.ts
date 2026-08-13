/**
 * Centralized environment configuration. Every service reads its config through
 * these helpers so that defaults live in one place and are trivially overridable.
 */

const num = (name: string, def: number): number => {
  const raw = process.env[name];
  if (!raw) return def;
  const n = Number(raw);
  return Number.isFinite(n) ? n : def;
};

const str = (name: string, def: string): string => process.env[name] ?? def;

export const config = {
  env: str('NODE_ENV', 'development'),
  serviceName: str('SERVICE_NAME', 'unknown'),

  redis: {
    host: str('REDIS_HOST', '127.0.0.1'),
    port: num('REDIS_PORT', 6379),
    password: str('REDIS_PASSWORD', ''),
    keyPrefix: str('REDIS_KEY_PREFIX', ''),
  },

  clickhouse: {
    url: str('CLICKHOUSE_URL', 'http://127.0.0.1:8123'),
    database: str('CLICKHOUSE_DATABASE', 'analytics'),
    username: str('CLICKHOUSE_USER', 'default'),
    password: str('CLICKHOUSE_PASSWORD', ''),
  },

  postgres: {
    url: str(
      'DATABASE_URL',
      'postgresql://analytics:analytics@127.0.0.1:5432/analytics_auth',
    ),
    dashboardsUrl: str(
      'DATABASE_URL_DASHBOARDS',
      'postgresql://analytics:analytics@127.0.0.1:5432/analytics_dashboards',
    ),
  },

  ports: {
    auth: num('PORT_AUTH', 4001),
    authGrpc: num('PORT_AUTH_GRPC', 5001),
    ingestion: num('PORT_INGESTION', 4002),
    stream: num('PORT_STREAM', 4003),
    query: num('PORT_QUERY', 4004),
    queryGrpc: num('PORT_QUERY_GRPC', 5004),
    alerting: num('PORT_ALERTING', 4005),
    dashboards: num('PORT_DASHBOARDS', 4006),
  },

  grpc: {
    authUrl: str('AUTH_GRPC_URL', '127.0.0.1:4001'),
    queryUrl: str('QUERY_GRPC_URL', '127.0.0.1:5004'),
  },

  streams: {
    events: str('STREAM_EVENTS', 'analytics:events'),
    group: str('STREAM_GROUP', 'analytics:events:processors'),
    deadLetter: str('STREAM_DEAD_LETTER', 'analytics:events:dead-letter'),
    maxLen: num('STREAM_MAX_LEN', 1_000_000),
  },

  batch: {
    maxEvents: num('BATCH_MAX_EVENTS', 5000),
    maxBytes: num('BATCH_MAX_BYTES', 1_000_000),
    maxWaitMs: num('BATCH_MAX_WAIT_MS', 2000),
    maxRetries: num('BATCH_MAX_RETRIES', 5),
  },
};

export type AppConfig = typeof config;
