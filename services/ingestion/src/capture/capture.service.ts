import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  config,
  DISTINCT_ID_MAX_LENGTH,
  EVENT_NAME_MAX_LENGTH,
  PROPERTY_KEY_MAX_LENGTH,
  type CapturePayload,
  type EnrichedEvent,
} from '@analytics/shared';
import { ApiKeyService } from '../validation/api-key.service';
import { EventWriterService } from '../writer/event-writer.service';

export interface CaptureResult {
  status: 'ok';
  accepted: number;
  rejected: number;
  project: string | null;
  queueDepth: number;
}

@Injectable()
export class CaptureService {
  constructor(
    private readonly apiKey: ApiKeyService,
    private readonly writer: EventWriterService,
  ) {}

  async capture(payload: CapturePayload): Promise<CaptureResult> {
    const resolved = await this.apiKey.resolve(payload.api_key);
    if (!resolved) {
      return { status: 'ok', accepted: 0, rejected: payload.batch.length, project: null, queueDepth: 0 };
    }

    // Enforce an upper bound so one abusive request can't flood the buffer.
    const items = payload.batch.slice(0, config.batch.maxEvents);
    const now = Date.now();

    let accepted = 0;
    const enriched: EnrichedEvent[] = [];
    for (const item of items) {
      const event = this.enrich(resolved.projectId, item, now);
      if (event) {
        enriched.push(event);
        accepted++;
      }
    }

    this.writer.enqueue(enriched);

    return {
      status: 'ok',
      accepted,
      rejected: items.length - accepted,
      project: resolved.projectName,
      queueDepth: this.writer.stats().queueDepth,
    };
  }

  private enrich(
    projectId: string,
    item: any,
    now: number,
  ): EnrichedEvent | null {
    if (!item || typeof item !== 'object') return null;

    const eventName = item.event;
    if (typeof eventName !== 'string' || eventName.length === 0 || eventName.length > EVENT_NAME_MAX_LENGTH) {
      return null;
    }

    const distinctId = item.distinct_id;
    if (typeof distinctId !== 'string' || distinctId.length === 0 || distinctId.length > DISTINCT_ID_MAX_LENGTH) {
      return null;
    }

    const ts = Number.isFinite(item.timestamp) ? item.timestamp : now;
    if (ts <= 0 || ts > now + 3_600_000) return null;

    const rawProps =
      item.properties && typeof item.properties === 'object'
        ? (item.properties as Record<string, unknown>)
        : {};
    const properties: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rawProps)) {
      if (k.length <= PROPERTY_KEY_MAX_LENGTH) properties[k] = v;
    }

    return {
      event_id: randomUUID(),
      project_id: projectId,
      distinct_id: distinctId,
      event_name: eventName,
      timestamp: ts,
      received_at: now,
      session_id: typeof item.session_id === 'string' ? item.session_id : null,
      properties,
    };
  }
}
