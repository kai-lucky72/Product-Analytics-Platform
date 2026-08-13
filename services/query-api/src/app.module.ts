import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClickHouseModule } from './clickhouse/clickhouse.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { GrpcModule } from './grpc/grpc.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ClickHouseModule,
    AuthModule,
    AnalyticsModule,
    GrpcModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
