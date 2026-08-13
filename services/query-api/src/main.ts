import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Transport, type MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { analyticsProtoPath, config, createLogger } from '@analytics/shared';

const logger = createLogger('query-api');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: false });

  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: false }),
  );
  app.enableCors({ origin: true });

  // Internal gRPC surface (used by alerting service + future internal consumers).
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'analytics',
      protoPath: analyticsProtoPath(),
      url: `0.0.0.0:${config.ports.queryGrpc}`,
      loader: { keepCase: true, longs: String, enums: String, defaults: true },
    },
  });

  await app.startAllMicroservices();
  await app.listen(config.ports.query, '0.0.0.0');
  logger.info('query-api service listening', {
    rest: config.ports.query,
    grpc: config.ports.queryGrpc,
  });
}

bootstrap().catch((err) => {
  logger.error('query-api bootstrap failed', { error: String(err) });
  process.exit(1);
});
