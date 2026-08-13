import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { isCapturePayload } from '@analytics/shared';
import { CaptureService } from './capture.service';
import { EventWriterService } from '../writer/event-writer.service';

@Controller()
export class CaptureController {
  constructor(
    private readonly captureService: CaptureService,
    private readonly writer: EventWriterService,
  ) {}

  /**
   * Primary capture endpoint. Mirrors the Plausible-style bulk wire format:
   *   POST /i/event { "api_key": "phc_...", "batch": [{ distinct_id, event, timestamp, properties, session_id }] }
   * Acknowledges fast (enqueue only); all heavy lifting happens downstream.
   */
  @Post('i/event')
  @HttpCode(200)
  async capture(@Body() payload: unknown) {
    if (!isCapturePayload(payload)) {
      throw new UnauthorizedException('Malformed payload');
    }
    const result = await this.captureService.capture(payload);
    if (result.project === null && result.accepted === 0 && result.rejected > 0) {
      throw new UnauthorizedException('Invalid API key');
    }
    return result;
  }

  @Get('i/status')
  status() {
    return this.writer.stats();
  }

  @Get('health')
  health() {
    return { status: 'ok', service: 'ingestion' };
  }
}
