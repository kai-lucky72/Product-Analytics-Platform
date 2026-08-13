import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { config, createLogger } from '@analytics/shared';

const logger = createLogger('dashboard-config');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.enableCors({ origin: true });

  await app.listen(config.ports.dashboards, '0.0.0.0');
  logger.info('dashboard-config service listening', { port: config.ports.dashboards });
}

bootstrap().catch((err) => {
  logger.error('dashboard-config bootstrap failed', { error: String(err) });
  process.exit(1);
});
