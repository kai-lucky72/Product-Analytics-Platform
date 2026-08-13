/**
 * Minimal structured logger. In production (NODE_ENV=production) emits JSON
 * lines for log aggregation; in development emits readable output.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

export function createLogger(service: string, level: Level = 'info'): Logger {
  const json = process.env.NODE_ENV === 'production';
  const write = (lvl: Level, msg: string, meta?: Record<string, unknown>) => {
    const line = {
      ts: new Date().toISOString(),
      level: lvl,
      service,
      ...meta,
      msg,
    };
    const out = json ? JSON.stringify(line) : formatDev(line);
    if (lvl === 'error') process.stderr.write(out + '\n');
    else process.stdout.write(out + '\n');
  };

  const thresholds: Record<Level, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
  };

  const enabled = (lvl: Level) => thresholds[lvl] >= thresholds[level];

  return {
    debug: (msg, meta) => enabled('debug') && write('debug', msg, meta),
    info: (msg, meta) => enabled('info') && write('info', msg, meta),
    warn: (msg, meta) => enabled('warn') && write('warn', msg, meta),
    error: (msg, meta) => enabled('error') && write('error', msg, meta),
    child: (bindings) => createLoggerWithBindings(service, level, bindings),
  };
}

function createLoggerWithBindings(
  service: string,
  level: Level,
  bindings: Record<string, unknown>,
): Logger {
  const base = createLogger(service, level);
  return {
    debug: (msg, meta) => base.debug(msg, { ...bindings, ...meta }),
    info: (msg, meta) => base.info(msg, { ...bindings, ...meta }),
    warn: (msg, meta) => base.warn(msg, { ...bindings, ...meta }),
    error: (msg, meta) => base.error(msg, { ...bindings, ...meta }),
    child: (extra) => createLoggerWithBindings(service, level, { ...bindings, ...extra }),
  };
}

function formatDev(line: Record<string, unknown>): string {
  const { ts, level, service, msg, ...meta } = line as Record<string, unknown>;
  const metaStr =
    meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${ts} ${String(level).toUpperCase().padEnd(5)} [${String(service)}] ${String(msg)}${metaStr}`;
}
