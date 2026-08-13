import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createLogger } from '@analytics/shared';

const logger = createLogger('stream-processor');

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  logger.info('stream processor started');

  const shutdown = async (signal: string) => {
    logger.info('shutting down', { signal });
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  logger.error('stream processor bootstrap failed', { error: String(err) });
  process.exit(1);
});
