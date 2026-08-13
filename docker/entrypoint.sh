#!/bin/sh
set -e
# Runs a single backend service. SERVICE_NAME (build arg / env) selects which.
SERVICE=${SERVICE_NAME:-auth}
cd /app
exec node_modules/.bin/ts-node --transpile-only -P tsconfig.base.json "services/${SERVICE}/src/main.ts"
