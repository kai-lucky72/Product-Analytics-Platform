import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Transport, type MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { analyticsProtoPath, config, createLogger } from '@analytics/shared';

const logger = createLogger('auth');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn'],
  });

  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: false }),
  );
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Internal gRPC surface (used by ingestion + query-api for API key validation).
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'analytics',
      protoPath: analyticsProtoPath(),
      url: `0.0.0.0:${config.ports.authGrpc}`,
      loader: { keepCase: true, longs: String, enums: String, defaults: true },
    },
  });

  await app.startAllMicroservices();
  await app.listen(config.ports.auth, '0.0.0.0');

  logger.info(`auth service listening`, {
    rest: config.ports.auth,
    grpc: config.ports.authGrpc,
  });
}

bootstrap().catch((err) => {
  logger.error('auth bootstrap failed', { error: String(err) });
  process.exit(1);
});
