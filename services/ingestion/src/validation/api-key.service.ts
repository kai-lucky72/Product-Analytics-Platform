import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { createHash } from 'crypto';
import Redis from 'ioredis';
import {
  config,
  createGrpcClient,
  createLogger,
  createRedis,
  loadAnalyticsPackage,
} from '@analytics/shared';

export interface ResolvedKey {
  projectId: string;
  projectName: string;
  organizationId: string;
  keyType: string;
}

interface AuthClient {
  ValidateApiKey(
    req: { api_key: string },
    cb: (err: Error | null, res: any) => void,
  ): void;
  close(): void;
}

const CACHE_TTL_SECONDS = 300;

@Injectable()
export class ApiKeyService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = createLogger('ingestion:apikey');
  private redis!: Redis;
  private authClient!: AuthClient;

  onApplicationBootstrap(): void {
    this.redis = createRedis();
    this.redis.on('error', (err) => this.logger.debug('redis error', { error: String(err) }));
    const pkg = loadAnalyticsPackage();
    this.authClient = createGrpcClient<AuthClient>(pkg.Auth, config.grpc.authUrl);
  }

  /**
   * Validate an API key and resolve its project. Cache-first for throughput
   * under burst load; gRPC is the source of truth on cache miss.
   */
  async resolve(apiKey: string): Promise<ResolvedKey | null> {
    const cacheKey = `apikey:${this.hash(apiKey)}`;

    const cached = await this.redis.get(cacheKey).catch(() => null);
    if (cached) {
      return JSON.parse(cached) as ResolvedKey;
    }

    const resolved = await new Promise<ResolvedKey | null>((resolvePromise) => {
      const deadline = Date.now() + 3000;
      this.authClient.ValidateApiKey(
        { api_key: apiKey },
        (err, res) => {
          if (err || !res?.valid) {
            this.logger.warn('api key rejected', { error: err?.message ?? 'invalid' });
            resolvePromise(null);
            return;
          }
          resolvePromise({
            projectId: res.project_id,
            projectName: res.project_name,
            organizationId: res.organization_id,
            keyType: res.key_type,
          });
        },
      );
      // Safety: prevent hanging calls from blocking ingestion.
      setTimeout(() => resolvePromise(null), deadline).unref();
    });

    if (resolved) {
      await this.redis.set(cacheKey, JSON.stringify(resolved), 'EX', CACHE_TTL_SECONDS).catch(() => {});
    }
    return resolved;
  }

  async invalidate(apiKey: string): Promise<void> {
    await this.redis.del(`apikey:${this.hash(apiKey)}`).catch(() => {});
  }

  private hash(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  onApplicationShutdown(): void {
    this.authClient?.close();
    this.redis?.disconnect();
  }
}
