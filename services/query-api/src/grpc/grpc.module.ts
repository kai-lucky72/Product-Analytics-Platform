import { Module } from '@nestjs/common';
import { AnalyticsGrpcController } from './analytics-grpc.controller';

@Module({
  controllers: [AnalyticsGrpcController],
})
export class GrpcModule {}
