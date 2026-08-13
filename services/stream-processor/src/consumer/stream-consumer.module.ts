import { Module } from '@nestjs/common';
import { StreamConsumerService } from './stream-consumer.service';

@Module({
  providers: [StreamConsumerService],
})
export class StreamConsumerModule {}
