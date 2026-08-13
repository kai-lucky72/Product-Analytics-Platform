import { Module } from '@nestjs/common';
import { CaptureController } from './capture.controller';
import { CaptureService } from './capture.service';
import { ValidationModule } from '../validation/validation.module';
import { WriterModule } from '../writer/writer.module';

@Module({
  imports: [ValidationModule, WriterModule],
  controllers: [CaptureController],
  providers: [CaptureService],
})
export class CaptureModule {}
