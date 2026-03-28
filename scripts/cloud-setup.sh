#!/bin/bash
# Setup script for Claude Code Cloud environments (system-level only).
# Paste this script's contents into claude.ai/code → Environment Settings → Setup Script.
#
# This script runs as root BEFORE the project is available. It only configures
# system-level services (PostgreSQL). Project setup (deps, schema, seed) is
# handled by the SessionStart hook in .claude/settings.json, which has access
# to $CLAUDE_PROJECT_DIR.
#
# Environment variables to set in claude.ai/code UI:
#   DEV_DB_PASSWORD=db@1234
#   BETTER_AUTH_SECRET=<your-secret>
#   BETTER_AUTH_URL=http://localhost:3001
#   SKIP_VALIDATION=true

set -euo pipefail

echo "=== Pi-Dash Cloud Setup (system) ==="

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
echo "=== System setup complete ==="
