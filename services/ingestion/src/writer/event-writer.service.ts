import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import {
  config,
  createLogger,
  createRedis,
  type EnrichedEvent,
} from '@analytics/shared';

export interface WriterStats {
  queueDepth: number;
  written: number;
  dropped: number;
  lastError: string | null;
  healthy: boolean;
}

const FLUSH_INTERVAL_MS = 25;
const FLUSH_THRESHOLD = 1000;

/**
 * Coalescing writer to the Redis Streams buffer.
 *
 * Ingestion acknowledges requests immediately and hands events to an in-memory
 * queue; a background flush loop batches many XADDs into a single pipeline so a
 * burst of requests costs ~1 round trip per flush window. This decouples the
 * ingest hot path from the (much slower) ClickHouse write path.
 */
@Injectable()
export class EventWriterService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = createLogger('ingestion:writer');
  private redis!: Redis;
  private queue: EnrichedEvent[] = [];
  private flushing = false;
  private written = 0;
  private dropped = 0;
  private lastError: string | null = null;
  private flushTimer?: NodeJS.Timeout;

  onApplicationBootstrap(): void {
    this.redis = createRedis();
    this.redis.on('error', (err) => {
      this.lastError = String(err);
      this.logger.error('redis error', { error: String(err) });
    });
    this.flushTimer = setInterval(() => this.flush().catch(() => {}), FLUSH_INTERVAL_MS);
    this.flushTimer.unref();
  }

  enqueue(events: EnrichedEvent[]): void {
    if (events.length === 0) return;
    this.queue.push(...events);
    if (this.queue.length >= FLUSH_THRESHOLD) {
      this.flush().catch(() => {});
    }
  }

  stats(): WriterStats {
    return {
      queueDepth: this.queue.length,
      written: this.written,
      dropped: this.dropped,
      lastError: this.lastError,
      healthy: this.dropped === 0 && this.queue.length < 100_000,
    };
  }

  private async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return;
    const batch = this.queue.splice(0, this.queue.length);
    this.flushing = true;
    try {
      const pipeline = this.redis.pipeline();
      for (const event of batch) {
        pipeline.xadd(config.streams.events, '*', 'payload', JSON.stringify(event));
      }
      const results = await pipeline.exec();
      const failed = results?.filter(([err]) => err)?.length ?? 0;
      this.written += batch.length - failed;
      if (failed > 0) {
        this.dropped += failed;
        this.lastError = 'partial pipeline failure';
      }
    } catch (err) {
      this.dropped += batch.length;
      this.lastError = String(err);
      this.logger.error('stream write failed', {
        error: String(err),
        dropped: batch.length,
      });
    } finally {
      this.flushing = false;
    }
  }

  onApplicationShutdown(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.redis?.disconnect();
  }
}
