/**
 * Core domain model shared across all services.
 */

/** Wire-level event as sent by the client SDK / capture endpoint. */
export interface CaptureEvent {
  /** Stable identifier for the user. Hash-able, never store PII verbatim. */
  distinct_id: string;
  /** Event name, e.g. "pageview", "signup_completed". */
  event: string;
  /** Client-provided event time in epoch milliseconds (UTC). */
  timestamp: number;
  /** Arbitrary event properties (filterable dimensions + metrics). */
  properties?: Record<string, unknown>;
  /** Optional session identifier for session-level queries. */
  session_id?: string;
}

/** Payload accepted by POST /i/event (batch of events). */
export interface CapturePayload {
  api_key: string;
  batch: CaptureEvent[];
}

/** Fully-resolved event after validation + enrichment by the ingestion service. */
export interface AnalyticsEvent {
  event_id: string;
  project_id: string;
  distinct_id: string;
  event_name: string;
  /** Client timestamp, ms since epoch. */
  ts_ms: number;
  /** Server receive timestamp, ms since epoch. */
  received_at_ms: number;
  session_id: string | null;
  /** Serialized JSON. */
  properties_json: string;
  /** Parallel arrays for cheap ClickHouse filtering. */
  properties_keys: string[];
  properties_values: string[];
  /** Event properties parsed back as an object. */
  properties: Record<string, unknown>;
}

export type Granularity = 'hour' | 'day' | 'week';

export const GRANULARITIES: Granularity[] = ['hour', 'day', 'week'];

/** Event as handed off from ingestion to the Redis Streams (pre-row transform). */
export interface EnrichedEvent {
  event_id: string;
  project_id: string;
  distinct_id: string;
  event_name: string;
  /** Client timestamp, ms since epoch. */
  timestamp: number;
  /** Server receive timestamp, ms since epoch. */
  received_at: number;
  session_id: string | null;
  properties: Record<string, unknown>;
}

export const isCapturePayload = (value: unknown): value is CapturePayload => {
  const v = value as CapturePayload;
  return (
    v !== null &&
    typeof v === 'object' &&
    typeof v.api_key === 'string' &&
    v.api_key.length > 0 &&
    Array.isArray(v.batch)
  );
};
