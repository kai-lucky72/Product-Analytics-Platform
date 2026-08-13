#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# One-command local bootstrap for the self-hosted analytics platform.
#
#   ./start.sh            run everything (assumes infra is already up)
#   ./start.sh --infra    also start redis + postgres + clickhouse
#   ./start.sh --seed     run everything, then seed with synthetic data
#
# The web dashboard is the exposed entry point (port 5173). Its dev server
# reverse-proxies /auth, /i and /api/v1/* to the backend microservices, so a
# single preview port is enough.
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")"

export NODE_ENV="${NODE_ENV:-development}"
export JWT_SECRET="${JWT_SECRET:-dev-secret-change-in-production}"

if [[ "${1:-}" == "--infra" ]]; then
  echo "Starting infrastructure (redis, postgres, clickhouse)..."
  ./scripts/run-infra.sh
fi

echo "Initializing databases..."
npx tsx scripts/init-db.ts

echo "Starting services in background..."
npx concurrently \
  -n auth,ingest,stream,query,alert,dash,web \
  -c blue,green,yellow,magenta,cyan,white,red \
  "npm run dev -w @analytics/auth" \
  "npm run dev -w @analytics/ingestion" \
  "npm run dev -w @analytics/stream-processor" \
  "npm run dev -w @analytics/query-api" \
  "npm run dev -w @analytics/alerting" \
  "npm run dev -w @analytics/dashboard-config" \
  "npm run dev -w @analytics/web"

trap 'echo "Stopping services..."; kill 0' EXIT
