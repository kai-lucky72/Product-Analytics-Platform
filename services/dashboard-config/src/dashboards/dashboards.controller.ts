import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { DashboardsService } from './dashboards.service';
import type {
  CreateDashboardDto,
  CreatePanelDto,
  UpdateDashboardDto,
  UpdatePanelDto,
} from './dto';

@Controller('api/v1/dashboards')
export class DashboardsController {
  constructor(private readonly dashboards: DashboardsService) {}

  @Get()
  list(@Query('project_id') projectId: string) {
    return this.dashboards.list(projectId);
  }

  @Post()
  create(@Body() dto: CreateDashboardDto) {
    return this.dashboards.create(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.dashboards.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDashboardDto) {
    return this.dashboards.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.dashboards.remove(id);
  }

  @Post(':id/panels')
  createPanel(@Param('id') id: string, @Body() dto: CreatePanelDto) {
    return this.dashboards.createPanel(id, dto);
  }

  @Patch('panels/:panelId')
  updatePanel(@Param('panelId') panelId: string, @Body() dto: UpdatePanelDto) {
    return this.dashboards.updatePanel(panelId, dto);
  }

  @Delete('panels/:panelId')
  @HttpCode(204)
  async removePanel(@Param('panelId') panelId: string) {
    await this.dashboards.removePanel(panelId);
  }
}
