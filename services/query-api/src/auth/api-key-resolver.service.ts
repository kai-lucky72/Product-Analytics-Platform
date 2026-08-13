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

export interface ResolvedProject {
  id: string;
  name: string;
  organizationId: string;
}

interface AuthClient {
  ValidateApiKey(
    req: { api_key: string },
    cb: (err: Error | null, res: any) => void,
  ): void;
  close(): void;
}

const CACHE_TTL_SECONDS = 300;

/**
 * Validates query API keys against the Auth service over gRPC and resolves the
 * owning project. Cache-first for dashboard workloads; gRPC on miss.
 */
@Injectable()
export class ApiKeyResolverService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = createLogger('query-api:apikey');
  private redis!: Redis;
  private authClient!: AuthClient;

  onApplicationBootstrap(): void {
    this.redis = createRedis();
    this.redis.on('error', (err) => this.logger.debug('redis error', { error: String(err) }));
    const pkg = loadAnalyticsPackage();
    this.authClient = createGrpcClient<AuthClient>(pkg.Auth, config.grpc.authUrl);
  }

  async resolve(apiKey: string): Promise<ResolvedProject | null> {
    const cacheKey = `querykey:${this.hash(apiKey)}`;
    const cached = await this.redis.get(cacheKey).catch(() => null);
    if (cached) return JSON.parse(cached) as ResolvedProject;

    const resolved = await new Promise<ResolvedProject | null>((resolvePromise) => {
      const timer = setTimeout(() => resolvePromise(null), 3000).unref();
      this.authClient.ValidateApiKey(
        { api_key: apiKey },
        (err, res) => {
          clearTimeout(timer);
          if (err || !res?.valid || res.key_type !== 'query') {
            resolvePromise(null);
            return;
          }
          resolvePromise({
            id: res.project_id,
            name: res.project_name,
            organizationId: res.organization_id,
          });
        },
      );
    });

    if (resolved) {
      await this.redis.set(cacheKey, JSON.stringify(resolved), 'EX', CACHE_TTL_SECONDS).catch(() => {});
    }
    return resolved;
  }

  private hash(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  onApplicationShutdown(): void {
    this.authClient?.close();
    this.redis?.disconnect();
  }
}
