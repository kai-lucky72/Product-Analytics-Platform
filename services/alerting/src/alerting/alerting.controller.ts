import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Patch,
  Query,
} from '@nestjs/common';
import { AlertingService } from './alerting.service';
import type { CreateRuleDto, UpdateRuleDto } from './dto';

@Controller('api/v1/rules')
export class AlertingController {
  constructor(private readonly alerting: AlertingService) {}

  @Get()
  list() {
    return this.alerting.listRules();
  }

  @Post()
  create(@Body() dto: CreateRuleDto) {
    return this.alerting.createRule(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.alerting.getRule(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRuleDto) {
    return this.alerting.updateRule(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.alerting.deleteRule(id);
  }

  @Get(':id/history')
  history(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.alerting.history(id, limit ? parseInt(limit, 10) : 20);
  }
}
