import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
} from 'class-validator';

export class CreateRuleDto {
  @IsString()
  @IsNotEmpty()
  project_id: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsIn(['events', 'users'])
  metric: 'events' | 'users';

  @IsString()
  @IsNotEmpty()
  event_name: string;

  @IsIn(['gt', 'lt', 'gte', 'lte'])
  operator: 'gt' | 'lt' | 'gte' | 'lte';

  @IsNumber()
  threshold: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60_000)
  window_ms?: number = 3_600_000;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5_000)
  evaluate_every_ms?: number = 60_000;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cooldown_ms?: number = 1_800_000;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  webhook_url?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean = true;
}

export class UpdateRuleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['events', 'users'])
  metric?: 'events' | 'users';

  @IsOptional()
  @IsString()
  event_name?: string;

  @IsOptional()
  @IsIn(['gt', 'lt', 'gte', 'lte'])
  operator?: 'gt' | 'lt' | 'gte' | 'lte';

  @IsOptional()
  @IsNumber()
  threshold?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
