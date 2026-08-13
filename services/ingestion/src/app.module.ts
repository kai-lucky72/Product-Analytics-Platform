import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CaptureModule } from './capture/capture.module';
import { WriterModule } from './writer/writer.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CaptureModule, WriterModule],
})
export class AppModule {}
