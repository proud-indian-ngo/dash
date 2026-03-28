#!/bin/bash
# Setup script for Claude Code Cloud environments.
# Paste this script's contents into claude.ai/code → Environment Settings → Setup Script.
#
# The cloud VM has PostgreSQL 16 pre-installed. We use it directly (PG 18 apt
# repo is blocked by the cloud proxy). PG 16 is compatible for dev purposes.
#
# Environment variables to set in claude.ai/code UI:
#   DEV_DB_PASSWORD=db@1234
#   BETTER_AUTH_SECRET=<your-secret>
#   BETTER_AUTH_URL=http://localhost:3001
#   SKIP_VALIDATION=true

set -euo pipefail

echo "=== Pi-Dash Cloud Environment Setup ==="

# ── 1. Start PostgreSQL ────────────────────────────────────────────────────────
PG_VERSION=$(psql --version 2>/dev/null | grep -oE '[0-9]+' | head -1 || echo "0")

if ! pg_isready -U postgres 2>/dev/null; then
  echo "Starting PostgreSQL $PG_VERSION..."
  service postgresql start 2>/dev/null || pg_ctlcluster "$PG_VERSION" main start 2>/dev/null || true
  sleep 2
fi
echo "✓ PostgreSQL $PG_VERSION running"

# ── 2. Configure PostgreSQL ──────────────────────────────────────────────────
echo "Configuring PostgreSQL..."

# Set password
su - postgres -c "psql -c \"ALTER USER postgres PASSWORD '${DEV_DB_PASSWORD:-db@1234}'\"" 2>/dev/null || \
  psql -U postgres -c "ALTER USER postgres PASSWORD '${DEV_DB_PASSWORD:-db@1234}'" 2>/dev/null || true

# Enable logical replication (required for Zero) and increase connections
su - postgres -c "psql -c \"ALTER SYSTEM SET wal_level = 'logical'\"" 2>/dev/null || \
  psql -U postgres -c "ALTER SYSTEM SET wal_level = 'logical'" 2>/dev/null || true
su - postgres -c "psql -c \"ALTER SYSTEM SET max_connections = 300\"" 2>/dev/null || \
  psql -U postgres -c "ALTER SYSTEM SET max_connections = 300" 2>/dev/null || true

# Restart to apply wal_level change (requires restart, not just reload)
service postgresql restart 2>/dev/null || pg_ctlcluster "$PG_VERSION" main restart 2>/dev/null || true
sleep 2

# Create database
su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname = 'pi-dash'\" | grep -q 1 || psql -c 'CREATE DATABASE \"pi-dash\"'" 2>/dev/null || \
  psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'pi-dash'" | grep -q 1 || \
  psql -U postgres -c 'CREATE DATABASE "pi-dash"' 2>/dev/null || true

echo "✓ PostgreSQL configured (wal_level=logical, max_connections=300)"

# ── 3. Install dependencies ──────────────────────────────────────────────────
echo "Installing dependencies..."
# Bun has known proxy issues in cloud — fall back to npm if bun fails
if command -v bun &>/dev/null; then
  bun install 2>/dev/null || { echo "⚠ bun install failed (proxy issue?), trying npm..."; npm install; }
else
  npm install
fi
echo "✓ Dependencies installed"

# ── 4. Push schema ───────────────────────────────────────────────────────────
DB_URL="postgres://postgres:${DEV_DB_PASSWORD:-db@1234}@localhost:5432/pi-dash"

echo "Pushing schema..."
(cd packages/db && DATABASE_URL="$DB_URL" SKIP_VALIDATION=true npx drizzle-kit push)
echo "✓ Schema pushed"

# ── 5. Seed dev data ─────────────────────────────────────────────────────────
echo "Seeding dev data..."
(cd packages/e2e && \
  DATABASE_URL="$DB_URL" \
  BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:?BETTER_AUTH_SECRET must be set}" \
  BETTER_AUTH_URL="${BETTER_AUTH_URL:-http://localhost:3001}" \
  SKIP_VALIDATION=true \
  bun run helpers/seed-dev-data.ts) || echo "⚠ Seed failed (non-critical)"
echo "✓ Data seeded"

# ── 6. Regenerate Ruler files ─────────────────────────────────────────────────
echo "Regenerating Ruler files..."
bun run ruler:apply 2>/dev/null || npx @intellectronica/ruler@latest apply --local-only 2>/dev/null || true
echo "✓ Ruler files ready"

echo ""
echo "=== Cloud setup complete ==="
echo "  PostgreSQL: $DB_URL"
echo "  Run: bun run dev (starts on :3001)"
