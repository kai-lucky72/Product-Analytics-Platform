export const STREAM_EVENTS = 'analytics:events';
export const STREAM_GROUP = 'analytics:events:processors';
export const STREAM_DEAD_LETTER = 'analytics:events:dead-letter';

export const EVENT_COLUMNS = [
  'event_id',
  'project_id',
  'distinct_id',
  'event_name',
  'timestamp',
  'received_at',
  'session_id',
  'properties_json',
  'properties_keys',
  'properties_values',
] as const;

/** Retention of event properties that are "well-known" and cheap to query. */
export const PROPERTY_KEY_MAX_LENGTH = 128;
export const EVENT_NAME_MAX_LENGTH = 200;
export const DISTINCT_ID_MAX_LENGTH = 200;
