import { Global, Module } from '@nestjs/common';
import { ClickHouseQueryService } from './clickhouse-query.service';

@Global()
@Module({
  providers: [ClickHouseQueryService],
  exports: [ClickHouseQueryService],
})
export class ClickHouseModule {}
