#!/bin/bash
# SessionStart hook for Claude Code Cloud environments.
# Runs every session with $CLAUDE_PROJECT_DIR available.
# Only executes in cloud (CLAUDE_CODE_REMOTE=true), skipped locally.

# Skip if not running in cloud
if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi

set -euo pipefail

cd "$CLAUDE_PROJECT_DIR"

echo "=== Pi-Dash Cloud Session Setup ==="

# ── 1. Install dependencies ──────────────────────────────────────────────────
echo "Installing dependencies..."
if command -v bun &>/dev/null; then
  bun install 2>/dev/null || { echo "⚠ bun install failed, trying npm..."; npm install; }
else
  npm install
fi
echo "✓ Dependencies installed"

# ── 2. Push schema ───────────────────────────────────────────────────────────
DB_URL="postgres://postgres:${DEV_DB_PASSWORD:-db@1234}@localhost:5432/pi-dash"

echo "Pushing schema..."
(cd packages/db && DATABASE_URL="$DB_URL" SKIP_VALIDATION=true npx drizzle-kit push)
echo "✓ Schema pushed"

# ── 3. Seed dev data ─────────────────────────────────────────────────────────
echo "Seeding dev data..."
(cd packages/e2e && \
  DATABASE_URL="$DB_URL" \
  BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:?BETTER_AUTH_SECRET must be set}" \
  BETTER_AUTH_URL="${BETTER_AUTH_URL:-http://localhost:3001}" \
  SKIP_VALIDATION=true \
  bun run helpers/seed-dev-data.ts) || echo "⚠ Seed failed (non-critical)"
echo "✓ Data seeded"

# ── 4. Regenerate Ruler files ─────────────────────────────────────────────────
echo "Regenerating Ruler files..."
bun run ruler:apply 2>/dev/null || npx @intellectronica/ruler@latest apply --local-only 2>/dev/null || true
echo "✓ Ruler files ready"

echo ""
echo "=== Cloud session setup complete ==="
echo "  PostgreSQL: $DB_URL"
echo "  Run: bun run dev (starts on :3001)"
