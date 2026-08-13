import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import {
  config,
  createGrpcClient,
  createLogger,
  createRedis,
  loadAnalyticsPackage,
} from '@analytics/shared';
import type { CreateRuleDto, UpdateRuleDto } from './dto';

export interface AlertRule {
  id: string;
  project_id: string;
  name: string;
  metric: 'events' | 'users';
  event_name: string;
  operator: 'gt' | 'lt' | 'gte' | 'lte';
  threshold: number;
  window_ms: number;
  evaluate_every_ms: number;
  cooldown_ms: number;
  webhook_url?: string;
  enabled: boolean;
  created_at: string;
}

interface AnalyticsQueryClient {
  GetMetricSeries(
    req: Record<string, unknown>,
    cb: (err: Error | null, res: any) => void,
  ): void;
  close(): void;
}

const RULES_KEY = 'alerting:rules';
const EVAL_KEY = (id: string) => `alerting:last-eval:${id}`;
const STATE_KEY = (id: string) => `alerting:state:${id}`;
const LAST_FIRED_KEY = (id: string) => `alerting:last-fired:${id}`;
const HISTORY_KEY = (id: string) => `alerting:history:${id}`;

const TICK_MS = 15_000;

@Injectable()
export class AlertingService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = createLogger('alerting:core');
  private redis!: Redis;
  private queryClient!: AnalyticsQueryClient;
  private timer?: NodeJS.Timeout;

  onApplicationBootstrap(): void {
    this.redis = createRedis();
    this.redis.on('error', (err) => this.logger.error('redis error', { error: String(err) }));
    const pkg = loadAnalyticsPackage();
    this.queryClient = createGrpcClient<AnalyticsQueryClient>(pkg.AnalyticsQuery, config.grpc.queryUrl);

    this.timer = setInterval(() => this.evaluateDue().catch(() => {}), TICK_MS);
    this.timer.unref();
    this.evaluateDue().catch((err) => this.logger.error('initial evaluation failed', { error: String(err) }));
  }

  // -------------------------------------------------------------------------
  // Rule CRUD
  // -------------------------------------------------------------------------
  async createRule(dto: CreateRuleDto): Promise<AlertRule> {
    const rule: AlertRule = {
      id: randomUUID(),
      project_id: dto.project_id,
      name: dto.name,
      metric: dto.metric,
      event_name: dto.event_name,
      operator: dto.operator,
      threshold: dto.threshold,
      window_ms: dto.window_ms ?? 3_600_000,
      evaluate_every_ms: dto.evaluate_every_ms ?? 60_000,
      cooldown_ms: dto.cooldown_ms ?? 1_800_000,
      webhook_url: dto.webhook_url,
      enabled: dto.enabled ?? true,
      created_at: new Date().toISOString(),
    };
    await this.redis.hset(RULES_KEY, rule.id, JSON.stringify(rule));
    return rule;
  }

  async listRules(): Promise<AlertRule[]> {
    const all = await this.redis.hgetall(RULES_KEY);
    return Object.values(all).map((raw) => JSON.parse(raw) as AlertRule);
  }

  async getRule(id: string): Promise<AlertRule> {
    const raw = await this.redis.hget(RULES_KEY, id);
    if (!raw) throw new NotFoundException('Rule not found');
    return JSON.parse(raw) as AlertRule;
  }

  async updateRule(id: string, dto: UpdateRuleDto): Promise<AlertRule> {
    const rule = await this.getRule(id);
    const next: AlertRule = { ...rule, ...dto };
    await this.redis.hset(RULES_KEY, id, JSON.stringify(next));
    return next;
  }

  async deleteRule(id: string): Promise<void> {
    await this.redis.hdel(RULES_KEY, id);
    await this.redis.del(EVAL_KEY(id), STATE_KEY(id), LAST_FIRED_KEY(id), HISTORY_KEY(id));
  }

  async history(ruleId: string, limit = 20): Promise<unknown[]> {
    const raw = await this.redis.lrange(HISTORY_KEY(ruleId), 0, limit - 1);
    return raw.map((r) => JSON.parse(r));
  }

  // -------------------------------------------------------------------------
  // Evaluation loop
  // -------------------------------------------------------------------------
  private async evaluateDue(): Promise<void> {
    const rules = await this.listRules();
    const now = Date.now();
    for (const rule of rules) {
      if (!rule.enabled) continue;
      const lastEval = Number(await this.redis.get(EVAL_KEY(rule.id)).catch(() => 0)) || 0;
      if (now - lastEval < rule.evaluate_every_ms) continue;
      await this.redis.set(EVAL_KEY(rule.id), String(now)).catch(() => {});
      await this.evaluateRule(rule).catch((err) =>
        this.logger.error('rule evaluation failed', { ruleId: rule.id, error: String(err) }),
      );
    }
  }

  private async evaluateRule(rule: AlertRule): Promise<void> {
    const value = await this.queryMetric(rule);
    const breached = compare(value, rule.operator, rule.threshold);

    const state = (await this.redis.get(STATE_KEY(rule.id)).catch(() => null)) ?? 'ok';
    const now = Date.now();

    if (breached) {
      const lastFired = Number(await this.redis.get(LAST_FIRED_KEY(rule.id)).catch(() => 0)) || 0;
      if (state !== 'breached' || now - lastFired >= rule.cooldown_ms) {
        await this.redis.set(STATE_KEY(rule.id), 'breached').catch(() => {});
        await this.redis.set(LAST_FIRED_KEY(rule.id), String(now)).catch(() => {});
        await this.notify(rule, value, 'breached');
      }
    } else if (state === 'breached') {
      await this.redis.set(STATE_KEY(rule.id), 'ok').catch(() => {});
      await this.notify(rule, value, 'resolved');
    }
  }

  private async queryMetric(rule: AlertRule): Promise<number> {
    const now = Date.now();
    const res = await new Promise<number>((resolvePromise) => {
      const timer = setTimeout(() => resolvePromise(0), 4000).unref();
      this.queryClient.GetMetricSeries(
        {
          project_id: rule.project_id,
          event_name: rule.event_name,
          metric: rule.metric,
          granularity: 'hour',
          from_ms: now - rule.window_ms,
          to_ms: now,
        },
        (err, response) => {
          clearTimeout(timer);
          if (err || !response) {
            this.logger.warn('metric query failed', { ruleId: rule.id, error: err?.message });
            resolvePromise(0);
            return;
          }
          const total = Number(response.total ?? 0);
          resolvePromise(total);
        },
      );
    });
    return res;
  }

  private async notify(rule: AlertRule, value: number, status: 'breached' | 'resolved'): Promise<void> {
    const event = {
      rule_id: rule.id,
      rule_name: rule.name,
      project_id: rule.project_id,
      metric: rule.metric,
      event_name: rule.event_name,
      operator: rule.operator,
      threshold: rule.threshold,
      value,
      status,
      fired_at: new Date().toISOString(),
    };

    this.logger.warn('alert fired', event);
    await this.redis.lpush(HISTORY_KEY(rule.id), JSON.stringify(event)).catch(() => {});
    await this.redis.ltrim(HISTORY_KEY(rule.id), 0, 99).catch(() => {});

    if (rule.webhook_url) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000).unref();
      try {
        const resp = await fetch(rule.webhook_url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(event),
          signal: controller.signal,
        });
        if (!resp.ok) {
          this.logger.warn('webhook returned non-2xx', { status: resp.status, ruleId: rule.id });
        }
      } catch (err) {
        this.logger.warn('webhook delivery failed', { ruleId: rule.id, error: String(err) });
      } finally {
        clearTimeout(timer);
      }
    }
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.queryClient?.close();
    this.redis?.disconnect();
  }
}

const compare = (value: number, op: string, threshold: number): boolean => {
  switch (op) {
    case 'gt':
      return value > threshold;
    case 'lt':
      return value < threshold;
    case 'gte':
      return value >= threshold;
    case 'lte':
      return value <= threshold;
    default:
      throw new BadRequestException('Unknown operator');
  }
};
