import { createHash, randomBytes } from 'crypto';

export interface ApiKeyMaterial {
  /** Public prefix used to identify the key at a glance. */
  prefix: string;
  /** The full key shown to the user exactly once at creation. */
  fullKey: string;
  /** SHA-256 of the full key — the only thing we persist. */
  keyHash: string;
}

export function generateApiKey(projectId: string): ApiKeyMaterial {
  const entropy = randomBytes(24).toString('base64url');
  const prefix = entropy.slice(0, 10);
  const fullKey = `phc_${projectId.slice(0, 8)}_${prefix}${entropy}`;
  return {
    prefix: `phc_${prefix}`,
    fullKey,
    keyHash: hashApiKey(fullKey),
  };
}

export function hashApiKey(fullKey: string): string {
  return createHash('sha256').update(fullKey, 'utf8').digest('hex');
}
