import { createLogger, config } from '@analytics/shared';

const logger = createLogger('seed');

const HOST = '127.0.0.1';
const port = (p: number) => `http://${HOST}:${p}`;
const AUTH = port(config.ports.auth);
const INGEST = port(config.ports.ingestion);
const DASH = port(config.ports.dashboards);
const ALERT = port(config.ports.alerting);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(url: string, name: string, tries = 20) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) {
        logger.info(`${name} is up`);
        return;
      }
    } catch {
      /* not ready */
    }
    await sleep(1000);
  }
  throw new Error(`timed out waiting for ${name} at ${url}`);
}

interface Credentials {
  token: string;
  userId: string;
  projectId: string;
  orgId: string;
  ingestionKey: string;
  queryKey: string;
}

async function registerUser(): Promise<Credentials> {
  const email = `demo+${Date.now()}@example.com`;
  const res = await fetch(`${AUTH}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password: 'password123',
      name: 'Demo Analyst',
      organizationName: 'Acme Analytics',
    }),
  });
  if (!res.ok) throw new Error(`register failed: ${res.status} ${await res.text()}`);
  const body = await res.json();
  logger.info('registered demo user', { email });
  return {
    token: body.token,
    userId: body.user.id,
    projectId: body.user.projectId,
    orgId: body.user.organizationId,
    ingestionKey: body.apiKeys.ingestion,
    queryKey: body.apiKeys.query,
  };
}

// ---------------------------------------------------------------------------
// Synthetic event generation with realistic funnels + retention patterns.
// ---------------------------------------------------------------------------

const PATHS = ['/', '/pricing', '/docs', '/signup', '/login', '/blog', '/features', '/contact', '/integrations', '/enterprise'];
const REFERRERS = [null, 'google.com', 'twitter.com', 'news.ycombinator.com', 'github.com', 'producthunt.com', 'linkedin.com'];
const BROWSERS = ['chrome', 'safari', 'firefox', 'edge'];
const DEVICES = ['desktop', 'mobile', 'tablet'];
const COUNTRIES = ['US', 'DE', 'FR', 'GB', 'JP', 'BR', 'IN', 'CA', 'NL', 'ES'];
const OS = ['macOS', 'windows', 'linux', 'ios', 'android'];

interface User {
  id: string;
  signupDay: number; // days ago
  purchased: boolean;
  purchaseDay: number | null;
}

function buildUsers(count: number): User[] {
  const users: User[] = [];
  for (let i = 0; i < count; i++) {
    users.push({
      id: `user_${(i + 1).toString().padStart(5, '0')}`,
      signupDay: Math.floor(Math.random() * 89), // 0..89 days ago
      purchased: false,
      purchaseDay: null,
    });
  }
  return users;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function dayTs(daysAgo: number, hourJitter = true): number {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  let hour = 9 + Math.floor(Math.random() * 13);
  if (!hourJitter) hour = 12;
  const base = startOfToday.getTime() - daysAgo * 86_400_000 + hour * 3_600_000;
  return base + Math.floor(Math.random() * 3_600_000);
}

/** Probability a user is active `r` days after signup. */
const activityProb = (r: number) => 0.65 * Math.pow(0.72, Math.min(r, 14));

interface CaptureEvent {
  distinct_id: string;
  event: string;
  timestamp: number;
  properties: Record<string, unknown>;
  session_id: string;
}

function generateEvents(users: User[]): CaptureEvent[] {
  const events: CaptureEvent[] = [];
  const DAYS = 90;

  for (const user of users) {
    const sessionMap = new Map<string, string>();

    for (let day = 0; day < DAYS; day++) {
      const relative = day - user.signupDay; // 0 = signup day
      const daysAgo = DAYS - 1 - day;
      if (relative < 0) continue;

      // signup event on signup day
      if (relative === 0) {
        const ts = dayTs(daysAgo);
        events.push({
          distinct_id: user.id,
          event: 'signup_completed',
          timestamp: ts,
          properties: { plan: pick(['free', 'free', 'free', 'pro']), channel: pick(['organic', 'paid', 'referral', 'direct']) },
          session_id: `s_${user.id}_0`,
        });
        sessionMap.set(String(day), `s_${user.id}_${day}`);
        continue; // lighter day-0 activity
      }

      if (Math.random() > activityProb(relative)) continue;

      const sessionId = `s_${user.id}_${day}`;
      const numPageviews = 1 + Math.floor(Math.random() * 5);

      for (let pv = 0; pv < numPageviews; pv++) {
        events.push({
          distinct_id: user.id,
          event: 'pageview',
          timestamp: dayTs(daysAgo),
          properties: {
            path: pick(PATHS),
            referrer: pick(REFERRERS),
            browser: pick(BROWSERS),
            device: pick(DEVICES),
            country: pick(COUNTRIES),
            os: pick(OS),
          },
          session_id: sessionId,
        });
      }

      if (Math.random() < 0.4) {
        events.push({
          distinct_id: user.id,
          event: 'feature_clicked',
          timestamp: dayTs(daysAgo),
          properties: { feature: pick(['funnel_builder', 'retention', 'dashboards', 'alerts', 'exports']) },
          session_id: sessionId,
        });
      }

      // Purchase conversion ~7-10 days after signup for a subset of users.
      if (!user.purchased && relative >= 2 && relative <= 10 && Math.random() < 0.02) {
        user.purchased = true;
        user.purchaseDay = daysAgo;
        events.push({
          distinct_id: user.id,
          event: 'purchase',
          timestamp: dayTs(daysAgo),
          properties: {
            amount: Math.round(49 + Math.random() * 400),
            currency: 'USD',
            plan: pick(['pro', 'team', 'enterprise']),
          },
          session_id: sessionId,
        });
      }
    }
  }

  return events;
}

async function ingestEvents(ingestionKey: string, events: CaptureEvent[]) {
  const BATCH = 500;
  let posted = 0;
  for (let i = 0; i < events.length; i += BATCH) {
    const slice = events.slice(i, i + BATCH);
    const res = await fetch(`${INGEST}/i/event`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: ingestionKey, batch: slice }),
    });
    if (!res.ok) throw new Error(`ingest failed: ${res.status} ${await res.text()}`);
    posted += slice.length;
    if (posted % 5000 === 0) logger.info('events posted', { posted });
  }
  logger.info('all events posted', { total: events.length });
}

async function createDashboard(credentials: Credentials) {
  const dash = await fetch(`${DASH}/api/v1/dashboards`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      project_id: credentials.projectId,
      name: 'Product Overview',
      description: 'Growth, conversion and retention at a glance.',
    }),
  });
  if (!dash.ok) throw new Error(`dashboard create failed: ${dash.status}`);
  const dashboard = await dash.json();
  logger.info('dashboard created', { id: dashboard.id });

  const panels = [
    { type: 'overview', title: 'Traffic', config: { granularity: 'day' }, position: 0, width: 12, height: 4 },
    { type: 'metric', title: 'Pageviews', config: { event_name: 'pageview', metric: 'events', granularity: 'day' }, position: 1, width: 6, height: 4 },
    { type: 'metric', title: 'Signups', config: { event_name: 'signup_completed', metric: 'events', granularity: 'day' }, position: 2, width: 6, height: 4 },
    { type: 'funnel', title: 'Activation funnel', config: { steps: ['signup_completed', 'feature_clicked', 'purchase'], window_seconds: 1209600 }, position: 3, width: 12, height: 5 },
    { type: 'retention', title: 'Weekly retention', config: { trigger_event: 'signup_completed', returning_event: 'pageview', period_days: 7, periods: 8 }, position: 4, width: 12, height: 6 },
    { type: 'events', title: 'Recent events', config: { limit: 25 }, position: 5, width: 12, height: 6 },
  ];

  for (const panel of panels) {
    const res = await fetch(`${DASH}/api/v1/dashboards/${dashboard.id}/panels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(panel),
    });
    if (!res.ok) throw new Error(`panel create failed: ${res.status} ${await res.text()}`);
  }
  logger.info('panels created', { count: panels.length });
  return dashboard.id;
}

async function createAlert(credentials: Credentials) {
  const res = await fetch(`${ALERT}/api/v1/rules`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      project_id: credentials.projectId,
      name: 'Signup spike guard',
      metric: 'events',
      event_name: 'signup_completed',
      operator: 'lt',
      threshold: 5,
      window_ms: 86_400_000,
      evaluate_every_ms: 60_000,
      cooldown_ms: 3_600_000,
    }),
  });
  if (!res.ok) throw new Error(`alert create failed: ${res.status} ${await res.text()}`);
  const rule = await res.json();
  logger.info('alert rule created', { id: rule.id });
  return rule.id;
}

async function main() {
  await Promise.all([
    waitFor(AUTH, 'auth'),
    waitFor(INGEST, 'ingestion'),
    waitFor(DASH, 'dashboard-config'),
    waitFor(ALERT, 'alerting'),
  ]);

  logger.info('registering user + project + api keys...');
  const credentials = await registerUser();

  logger.info('generating synthetic events (~90 days)...');
  const users = buildUsers(1500);
  const events = generateEvents(users);
  logger.info('generated events', { total: events.length });

  await ingestEvents(credentials.ingestionKey, events);

  const dashboardId = await createDashboard(credentials);
  await createAlert(credentials);

  logger.info('=== SEED COMPLETE ===');
  logger.info('Demo credentials (also used by the web dashboard):', {
    email: 'see logs above',
    projectId: credentials.projectId,
    queryKey: credentials.queryKey,
    ingestionKey: credentials.ingestionKey,
    dashboardId,
    token: credentials.token,
  });
}

main().catch((err) => {
  logger.error('seed failed', { error: String(err) });
  process.exit(1);
});
