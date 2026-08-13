import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { randomBytes } from 'crypto';
import Redis from 'ioredis';
import {
  createLogger,
  createRedis,
  ensureStreamGroup,
  waitForRedisReady,
  config,
  DISTINCT_ID_MAX_LENGTH,
  EVENT_NAME_MAX_LENGTH,
  PROPERTY_KEY_MAX_LENGTH,
} from '@analytics/shared';
import { ClickHouseService, formatChTs, type EventsRow } from '../clickhouse/clickhouse.service';

interface BufferedMessage {
  id: string;
  row: EventsRow;
  eventId: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Injectable()
export class StreamConsumerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = createLogger('stream-processor:consumer');
  private redis!: Redis;
  private running = false;
  private readonly buffer: BufferedMessage[] = [];
  private readonly consumerId = `processor-${process.pid}-${randomBytes(4).toString('hex')}`;
  private lastFlushAt = 0;
  private reclaimTimer?: NodeJS.Timeout;

  constructor(private readonly ch: ClickHouseService) {}

  async onApplicationBootstrap(): Promise<void> {
    this.redis = createRedis();
    this.redis.on('error', (err) => this.logger.error('redis error', { error: String(err) }));
    await waitForRedisReady(this.redis);
    await ensureStreamGroup(this.redis, config.streams.events, config.streams.group);
    this.logger.info('consumer starting', { consumerId: this.consumerId });
    this.running = true;
    this.lastFlushAt = Date.now();

    this.loop().catch((err) => this.logger.error('consumer loop crashed', { error: String(err) }));
    this.reclaimTimer = setInterval(() => this.reclaim().catch(() => {}), 5000);
    this.reclaimTimer.unref();
  }

  // -------------------------------------------------------------------------
  // Main read loop: burst-tolerant streaming read with backpressure.
  // -------------------------------------------------------------------------
  private async loop(): Promise<void> {
    while (this.running) {
      try {
        const res = (await this.redis.xreadgroup(
          'GROUP',
          config.streams.group,
          this.consumerId,
          'COUNT',
          config.batch.maxEvents,
          'BLOCK',
          1000,
          'STREAMS',
          config.streams.events,
          '>',
        )) as [string, Array<[string, string[]]>][] | null;

        if (!res) {
          await this.flushIfIdle();
          continue;
        }

        for (const [, messages] of res) {
          for (const [id, fields] of messages) {
            await this.processMessage(id, fields);
          }
        }
        await this.flushIfFull();
      } catch (err) {
        this.logger.error('stream read failed', { error: String(err) });
        await sleep(500);
      }
    }
    await this.flush();
    this.logger.info('consumer loop exited');
  }

  private async processMessage(id: string, fields: string[]): Promise<void> {
    const payload = fields.find((_, i) => i % 2 === 0 && fields[i] === 'payload')
      ? (fields[fields.indexOf('payload') + 1] ?? '')
      : '';

    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      await this.deadLetter(id, 'invalid_json', payload);
      await this.ack(id);
      return;
    }

    let row: EventsRow;
    try {
      row = this.toRow(parsed);
    } catch (err: any) {
      await this.deadLetter(id, `invalid_event: ${err.message}`, payload);
      await this.ack(id);
      return;
    }

    // Idempotency: if this event_id was already committed in the last 24h,
    // skip re-insert and acknowledge (at-least-once redelivery becomes
    // effectively deduplicated on the hot path).
    const seen = await this.redis.set(`dedup:${row.event_id}`, '1', 'EX', 86400, 'NX');
    if (seen === null) {
      this.logger.debug('duplicate event ignored', { eventId: row.event_id });
      await this.ack(id);
      return;
    }

    this.buffer.push({ id, row, eventId: row.event_id });
  }

  // -------------------------------------------------------------------------
  // Flush logic
  // -------------------------------------------------------------------------
  private async flushIfFull(): Promise<void> {
    if (this.buffer.length >= config.batch.maxEvents) {
      await this.flush();
    }
  }

  private async flushIfIdle(): Promise<void> {
    if (this.buffer.length === 0) return;
    if (Date.now() - this.lastFlushAt >= config.batch.maxWaitMs) {
      await this.flush();
    }
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const batch = this.buffer.splice(0, this.buffer.length);
    this.lastFlushAt = Date.now();
    const ids = batch.map((m) => m.id);
    const rows = batch.map((m) => m.row);

    const namesByProject = new Map<string, Set<string>>();
    for (const m of batch) {
      if (!namesByProject.has(m.row.project_id)) namesByProject.set(m.row.project_id, new Set());
      namesByProject.get(m.row.project_id)!.add(m.row.event_name);
    }

    try {
      await this.ch.insertEvents(rows);
      for (const [projectId, names] of namesByProject) {
        await this.ch.recordEventNames(projectId, [...names]);
      }
      await this.ack(...ids);
      this.logger.debug('flushed batch to clickhouse', {
        events: rows.length,
        ids: ids.length,
      });
    } catch (err) {
      this.logger.error('clickhouse insert failed; messages retained for retry', {
        error: String(err),
        events: rows.length,
      });
      // Attempt-based dead-lettering for poison messages.
      for (const m of batch) {
        const attempts = await this.redis.incr(`attempt:${m.eventId}`);
        await this.redis.expire(`attempt:${m.eventId}`, 3600);
        if (attempts >= config.batch.maxRetries) {
          await this.deadLetter(m.id, `max_retries_exceeded (${attempts})`, JSON.stringify(m.row));
          await this.ack(m.id);
        }
        // otherwise leave unacked → XAUTOCLAIM redelivers later
      }
    }
  }

  private async reclaim(): Promise<void> {
    if (!this.running) return;
    try {
      const result = (await this.redis.xautoclaim(
        config.streams.events,
        config.streams.group,
        this.consumerId,
        5000,
        '0',
        'COUNT',
        200,
      )) as [string, Array<[string, string[]]>, string[]];
      const [, messages] = result;
      if (!messages?.length) return;
      this.logger.info('reclaiming stale pending messages', { count: messages.length });
      for (const [id, fields] of messages) {
        await this.processMessage(id, fields);
      }
      await this.flushIfFull();
    } catch (err) {
      this.logger.debug('reclaim failed', { error: String(err) });
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  private async ack(...ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.redis.xack(config.streams.events, config.streams.group, ...ids);
  }

  private async deadLetter(originalId: string, error: string, payload: string): Promise<void> {
    await this.redis
      .xadd(config.streams.deadLetter, '*', 'original_id', originalId, 'error', error, 'payload', payload, 'at', new Date().toISOString())
      .catch((err) => this.logger.error('dead-letter write failed', { error: String(err) }));
  }

  private toRow(raw: unknown): EventsRow {
    const obj = raw as Record<string, unknown>;
    if (!obj || typeof obj !== 'object') throw new Error('not an object');

    const eventName = obj.event_name ?? obj.event;
    if (typeof eventName !== 'string' || eventName.length === 0 || eventName.length > EVENT_NAME_MAX_LENGTH) {
      throw new Error(`bad event_name: ${JSON.stringify(eventName)?.slice(0, 80)}`);
    }

    const distinctId = obj.distinct_id;
    if (typeof distinctId !== 'string' || distinctId.length === 0 || distinctId.length > DISTINCT_ID_MAX_LENGTH) {
      throw new Error('bad distinct_id');
    }

    const projectId = obj.project_id;
    if (typeof projectId !== 'string' || projectId.length === 0) {
      throw new Error('bad project_id');
    }

    const eventId = obj.event_id;
    if (typeof eventId !== 'string' || eventId.length === 0) {
      throw new Error('bad event_id');
    }

    const ts = Number(obj.timestamp);
    if (!Number.isFinite(ts) || ts <= 0 || ts > Date.now() + 3_600_000) {
      throw new Error('bad timestamp');
    }

    const sessionId = typeof obj.session_id === 'string' ? obj.session_id : null;

    const props = obj.properties && typeof obj.properties === 'object' ? (obj.properties as Record<string, unknown>) : {};
    const keys: string[] = [];
    const values: string[] = [];
    for (const [k, v] of Object.entries(props)) {
      if (k.length > PROPERTY_KEY_MAX_LENGTH) continue;
      keys.push(k);
      values.push(typeof v === 'string' ? v : JSON.stringify(v));
    }

    return {
      event_id: eventId,
      project_id: projectId,
      distinct_id: distinctId,
      event_name: eventName,
      timestamp: formatChTs(ts),
      received_at: formatChTs(Number(obj.received_at ?? Date.now())),
      session_id: sessionId,
      properties_json: JSON.stringify(props),
      properties_keys: keys,
      properties_values: values,
    };
  }

  async onApplicationShutdown(): Promise<void> {
    this.running = false;
    if (this.reclaimTimer) clearInterval(this.reclaimTimer);
    if (this.redis) this.redis.disconnect();
  }
}
