import * as path from 'path';
import * as protoLoader from '@grpc/proto-loader';
import {
  credentials,
  loadPackageDefinition,
  type ChannelCredentials,
} from '@grpc/grpc-js';

let resolvedProtoPath: string | null = null;

/**
 * Locate the canonical analytics.proto regardless of whether we run from source
 * (tsx) or from compiled dist output.
 */
export function analyticsProtoPath(): string {
  if (resolvedProtoPath) return resolvedProtoPath;
  const candidates = [
    () => require.resolve('@analytics/shared/proto/analytics.proto'),
    () => path.join(__dirname, '..', 'proto', 'analytics.proto'),
    () => path.join(process.cwd(), 'proto', 'analytics.proto'),
    () => path.join(process.cwd(), '..', 'proto', 'analytics.proto'),
  ];
  for (const resolve of candidates) {
    try {
      const p = resolve();
      resolvedProtoPath = p;
      return p;
    } catch {
      /* try next */
    }
  }
  throw new Error('Unable to locate analytics.proto');
}

export type GrpcPackage = any;

export function loadAnalyticsPackage(): GrpcPackage {
  const definition = protoLoader.loadSync(analyticsProtoPath(), {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    bytes: String,
  });
  const pkg = loadPackageDefinition(definition) as any;
  return pkg.analytics;
}

export function createGrpcClient<C>(
  ctor: new (address: string, credentials: ChannelCredentials) => C,
  address: string,
): C {
  return new ctor(address, credentials.createInsecure());
}
