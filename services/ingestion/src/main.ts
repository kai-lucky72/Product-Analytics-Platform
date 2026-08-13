import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { config, createLogger } from '@analytics/shared';

const logger = createLogger('ingestion');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: false });

  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: false }),
  );
  app.enableCors({ origin: true, methods: ['GET', 'POST', 'OPTIONS'] });

  // Batch capture payloads can be large (up to BATCH_MAX_BYTES per request);
  // raise the default 100kb body limit so bursts aren't rejected up front.
  const maxBytes = config.batch.maxBytes;
  app.useBodyParser('json', { limit: maxBytes });

  await app.listen(config.ports.ingestion, '0.0.0.0');
  logger.info('ingestion service listening', { port: config.ports.ingestion });
}

bootstrap().catch((err) => {
  logger.error('ingestion bootstrap failed', { error: String(err) });
  process.exit(1);
});
