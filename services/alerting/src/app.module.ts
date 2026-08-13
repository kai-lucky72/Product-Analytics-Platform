import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AlertingModule } from './alerting/alerting.module';
import { HealthController } from './health.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AlertingModule],
  controllers: [HealthController],
})
export class AppModule {}
