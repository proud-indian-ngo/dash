#!/usr/bin/env bash
# Builds the E2E web server through Turbo's remote cache. CI shards and the
# pre-push hook both run this, so the same commit gives the same task hash and
# CI restores the build a local push already made. Every build input is fixed
# here; HERMETIC_ENV keeps .env files out of it.
set -euo pipefail
cd "$(dirname "$0")/.."

export HERMETIC_ENV=1
export NODE_ENV=production
export SKIP_VALIDATION=true
export VITE_E2E=true
export VITE_ZERO_URL=http://localhost:4848
export VITE_CDN_URL=http://localhost:3099
export BETTER_AUTH_URL=http://localhost:3099
export BETTER_AUTH_SECRET=ci-test-secret-value-at-least-32-chars-long
export CORS_ORIGIN=http://localhost:3099
export TURBO_TELEMETRY_DISABLED=1
export TURBO_API=https://turbo.ducktors.dev
export TURBO_TOKEN=turbotokenoss
export TURBO_TEAM=pi-dash

exec node_modules/.bin/turbo run build:e2e --filter=web "$@"
