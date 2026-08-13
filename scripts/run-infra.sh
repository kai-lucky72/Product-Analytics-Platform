#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Start local infrastructure without Docker: redis, postgres, clickhouse.
# Used by start.sh --infra and by the online preview environment.
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Starting redis-server..."
if ! redis-cli ping >/dev/null 2>&1; then
  redis-server --daemonize yes --appendonly yes
  sleep 1
fi
redis-cli ping >/dev/null 2>&1 && echo "redis: OK"

echo "Starting postgres..."
if ! pg_isready -q 2>/dev/null; then
  service postgresql start
  sleep 2
fi
pg_isready -q && echo "postgres: OK"

# Ensure the analytics role and databases exist.
su - postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='analytics'\"" | grep -q 1 \
  || su - postgres -c "psql -c \"CREATE ROLE analytics LOGIN PASSWORD 'analytics'\""
for db in analytics_auth analytics_dashboards; do
  su - postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='$db'\"" | grep -q 1 \
    || su - postgres -c "createdb -O analytics $db"
done

echo "Starting clickhouse..."
if ! clickhouse-client --query "SELECT 1" >/dev/null 2>&1; then
  service clickhouse-server start 2>/dev/null || {
    clickhouse-server --daemonize 2>/dev/null || true
  }
  sleep 3
fi
clickhouse-client --query "SELECT 1" >/dev/null 2>&1 && echo "clickhouse: OK"

echo "Infrastructure ready."
