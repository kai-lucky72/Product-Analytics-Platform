import { Global, Module } from '@nestjs/common';
import { EventWriterService } from './event-writer.service';

@Global()
@Module({
  providers: [EventWriterService],
  exports: [EventWriterService],
})
export class WriterModule {}
