import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import type { Granularity } from '@analytics/shared';

const toNumber = ({ value }: { value: string }) => Number(value);
const toInt = ({ value }: { value: string }) => parseInt(value, 10);

export class RangeDto {
  @Transform(toNumber)
  @IsInt()
  @Min(0)
  from: number;

  @Transform(toNumber)
  @IsInt()
  @Min(0)
  to: number;

  @IsOptional()
  @IsIn(['hour', 'day', 'week'])
  granularity?: Granularity;
}

export class MetricSeriesDto extends RangeDto {
  @IsString()
  @IsNotEmpty()
  event_name: string;

  @IsOptional()
  @IsIn(['events', 'users'])
  metric?: 'events' | 'users';
}

export class FunnelDto extends RangeDto {
  @IsString()
  @IsNotEmpty()
  steps: string;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  window_seconds?: number = 86_400 * 7;
}

export class RetentionDto extends RangeDto {
  @IsString()
  @IsNotEmpty()
  trigger_event: string;

  @IsString()
  @IsNotEmpty()
  returning_event: string;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(31)
  period_days?: number = 7;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(16)
  periods?: number = 8;
}

export class EventsDto extends RangeDto {
  @IsOptional()
  @IsString()
  event_name?: string;

  @IsOptional()
  @IsString()
  distinct_id?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number = 100;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

export class EventNamesDto {
  @IsOptional()
  @IsString()
  search?: string;
}

export interface TimeseriesPoint {
  ts_ms: number;
  value: number;
}
