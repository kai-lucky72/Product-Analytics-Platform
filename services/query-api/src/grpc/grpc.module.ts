import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AnalyticsGrpcController } from './analytics-grpc.controller';

@Module({
  imports: [AnalyticsModule],
  controllers: [AnalyticsGrpcController],
})
export class GrpcModule {}
