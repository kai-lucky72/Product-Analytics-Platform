import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { QueryKeyGuard } from '../auth/query-key.guard';
import { CurrentProject } from '../auth/current-project.decorator';
import type { ResolvedProject } from '../auth/api-key-resolver.service';
import type {
  EventNamesDto,
  EventsDto,
  FunnelDto,
  MetricSeriesDto,
  RangeDto,
  RetentionDto,
} from './dto';

@Controller('api/v1')
@UseGuards(QueryKeyGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  overview(@CurrentProject() project: ResolvedProject, @Query() dto: RangeDto) {
    return this.analytics.overview(project.id, dto.from, dto.to, dto.granularity ?? 'day');
  }

  @Get('metrics/series')
  async metricSeries(@CurrentProject() project: ResolvedProject, @Query() dto: MetricSeriesDto) {
    const metric = dto.metric ?? 'events';
    const points = await this.analytics.metricSeries(
      project.id,
      dto.event_name,
      dto.from,
      dto.to,
      dto.granularity ?? 'day',
      metric,
    );
    return {
      metric,
      series: points.map((p) => ({ ts_ms: p.ts_ms, value: metric === 'events' ? p.events : p.users })),
      total: points.reduce((acc, p) => acc + (metric === 'events' ? p.events : p.users), 0),
    };
  }

  @Get('funnel')
  funnel(@CurrentProject() project: ResolvedProject, @Query() dto: FunnelDto) {
    const steps = dto.steps.split(',').map((s) => s.trim()).filter(Boolean);
    return this.analytics.funnel(project.id, steps, dto.from, dto.to, dto.window_seconds ?? 86_400 * 7);
  }

  @Get('retention')
  retention(@CurrentProject() project: ResolvedProject, @Query() dto: RetentionDto) {
    return this.analytics.retention(
      project.id,
      dto.trigger_event,
      dto.returning_event,
      dto.from,
      dto.to,
      dto.period_days ?? 7,
      dto.periods ?? 8,
    );
  }

  @Get('events')
  events(@CurrentProject() project: ResolvedProject, @Query() dto: EventsDto) {
    return this.analytics.events(project.id, {
      eventName: dto.event_name,
      distinctId: dto.distinct_id,
      search: dto.search,
      fromMs: dto.from,
      toMs: dto.to,
      limit: dto.limit ?? 100,
      offset: dto.offset ?? 0,
    });
  }

  @Get('event-names')
  eventNames(@CurrentProject() project: ResolvedProject, @Query() dto: EventNamesDto) {
    return this.analytics.eventNames(project.id, dto.search);
  }
}
