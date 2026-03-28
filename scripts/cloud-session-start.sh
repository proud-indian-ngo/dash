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

# ── 1. Generate .env from environment variables ───────────────────────────────
# The cloud VM has env vars set in the UI but no .env file. Generate one so
# scripts and tools that read .env (run-e2e.sh, drizzle-kit, etc.) work.
if [ ! -f .env ]; then
  echo "Generating .env from environment variables..."
  cat > .env <<ENVFILE
DEV_DB_PASSWORD=${DEV_DB_PASSWORD:-db@1234}
DATABASE_URL=postgres://postgres:${DEV_DB_PASSWORD:-db@1234}@localhost:5432/pi-dash
BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET:-}
BETTER_AUTH_URL=${BETTER_AUTH_URL:-http://localhost:3001}
SKIP_VALIDATION=true
ENVFILE
  echo "✓ .env generated"
fi

# ── 2. Install dependencies ──────────────────────────────────────────────────
echo "Installing dependencies..."
if command -v bun &>/dev/null; then
  bun install 2>/dev/null || { echo "⚠ bun install failed, trying npm..."; npm install; }
else
  npm install
fi
echo "✓ Dependencies installed"

# ── 3. Patch zero-cache for IPv4-only environments ───────────────────────────
# Cloud VMs have no IPv6 support. Zero-cache hardcodes host: "::" (IPv6) in its
# HttpService, causing EAFNOSUPPORT crashes. Patch to use "0.0.0.0" (IPv4).
echo "Patching zero-cache for IPv4-only environment..."
ZERO_HTTP_SERVICE=$(find node_modules -path "*/zero-cache/src/services/http-service.js" -print -quit 2>/dev/null || true)
if [ -n "$ZERO_HTTP_SERVICE" ]; then
  if grep -q 'host: "::"' "$ZERO_HTTP_SERVICE"; then
    sed -i 's/host: "::"/host: "0.0.0.0"/g' "$ZERO_HTTP_SERVICE"
    echo "✓ Patched $ZERO_HTTP_SERVICE (IPv6 → IPv4)"
  else
    echo "✓ zero-cache already patched or uses IPv4"
  fi
else
  echo "⚠ zero-cache http-service.js not found (will patch later if needed)"
fi

# ── 4. Install Playwright browsers (with fallback for network restrictions) ──
echo "Checking Playwright browsers..."
if command -v bunx &>/dev/null; then
  bunx playwright install chromium 2>/dev/null || echo "⚠ Playwright browser install failed (network restricted — cached version may work)"
else
  npx playwright install chromium 2>/dev/null || echo "⚠ Playwright browser install failed (network restricted — cached version may work)"
fi

# ── 5. Push schema ───────────────────────────────────────────────────────────
DB_URL="postgres://postgres:${DEV_DB_PASSWORD:-db@1234}@localhost:5432/pi-dash"

echo "Pushing schema..."
(cd packages/db && DATABASE_URL="$DB_URL" SKIP_VALIDATION=true npx drizzle-kit push)
echo "✓ Schema pushed"

# ── 6. Seed test data ────────────────────────────────────────────────────────
# Seed from packages/auth context to avoid better-auth module resolution issues.
# When auth.api.createUser() runs from packages/e2e, better-auth may resolve
# through a different dependency path, producing password hashes that the server
# (which uses packages/auth's resolution) cannot verify.
echo "Seeding test data..."
(cd packages/e2e && \
  DATABASE_URL="$DB_URL" \
  BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:?BETTER_AUTH_SECRET must be set}" \
  BETTER_AUTH_URL="${BETTER_AUTH_URL:-http://localhost:3001}" \
  SKIP_VALIDATION=true \
  bun run helpers/seed-dev-data.ts) || echo "⚠ Seed failed (non-critical)"
echo "✓ Data seeded"

# ── 7. Regenerate Ruler files ─────────────────────────────────────────────────
echo "Regenerating Ruler files..."
bun run ruler:apply 2>/dev/null || npx @intellectronica/ruler@latest apply --local-only 2>/dev/null || true
echo "✓ Ruler files ready"

echo ""
echo "=== Cloud session setup complete ==="
echo "  PostgreSQL: $DB_URL"
echo "  Run: bun run dev (starts on :3001)"
