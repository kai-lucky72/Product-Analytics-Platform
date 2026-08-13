import { Module } from '@nestjs/common';
import { StreamConsumerModule } from './consumer/stream-consumer.module';
import { ClickHouseModule } from './clickhouse/clickhouse.module';

@Module({
  imports: [StreamConsumerModule, ClickHouseModule],
})
export class AppModule {}
