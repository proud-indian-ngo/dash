#!/bin/bash
# boat.dev sandboxes for pi-dash.
#
#   bash scripts/boat.sh snapshot          build or refresh the "pi-dash" saved snapshot
#   bash scripts/boat.sh start [branch]    start a sandbox on a branch (default master; one not on
#                                          origin is created from master) with the app running
#   bash scripts/boat.sh forward <id>      forward the app (:3001) and Zero (:4848) to this machine
#
# The snapshot holds CI's Bun with its install cache, a clone at ~/pi-dash,
# Playwright's headless Chromium, a dev-only .env and a migrated, seeded dev
# database in a system Postgres 18 that is up at boot, so skip `bun run db:start`
# there. E2E still starts its own containers. node_modules is left out: an
# install from the cache is faster than restoring it, and is never stale.
# Refresh the snapshot nightly so the cache and database stay near master.
# Seeded logins are in scripts/seed.ts.
# Stop any local `bun run dev` before forwarding.
set -euo pipefail

SNAPSHOT=pi-dash
REPO=proud-indian-ngo/dash
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export BOAT_NO_UPDATE=1

ready_id() { jq -r 'select(.event == "ready") | .id'; }

# Starts `bun run dev` in the background and waits for the app and Zero.
dev_up() {
  cat <<'EOF'
nohup bun run dev > /tmp/dev.log 2>&1 &
for _ in $(seq 1 180); do
  if curl -so /dev/null localhost:3001/login && curl -sfo /dev/null localhost:4848/; then
    exit_ok=1
    break
  fi
  sleep 1
done
[ "${exit_ok:-}" = 1 ] || { tail -40 /tmp/dev.log; exit 1; }
EOF
}

provision() {
  local bun_version
  bun_version=$(grep -m1 -oE 'bun-version: "[^"]+"' "$REPO_ROOT/.github/workflows/ci.yml" | cut -d'"' -f2)
  cat <<EOF
set -euo pipefail
curl -fsSL https://bun.sh/install | bash -s 'bun-v$bun_version' >/dev/null
sudo ln -sf "\$HOME/.bun/bin/bun" /usr/local/bin/bun
sudo ln -sf "\$HOME/.bun/bin/bun" /usr/local/bin/bunx

git config --global user.name '$(git -C "$REPO_ROOT" config user.name)'
git config --global user.email '$(git -C "$REPO_ROOT" config user.email)'
gh auth setup-git
git clone -q --filter=blob:none 'https://github.com/$REPO.git' ~/pi-dash
cd ~/pi-dash
printf 'node_modules/\n' > .boatignore
echo .boatignore >> .git/info/exclude
bun install --frozen-lockfile
bunx playwright install --with-deps --only-shell chromium

# The dev database runs as a system service, configured like
# packages/db/docker-compose.yml, so it is up as soon as the sandbox boots.
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -fsSo /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt \$(. /etc/os-release && echo "\$VERSION_CODENAME")-pgdg main" |
  sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
sudo apt-get update -q >/dev/null
sudo DEBIAN_FRONTEND=noninteractive apt-get install -yq postgresql-18 >/dev/null
db_password=\$(openssl rand -hex 16)
sudo -u postgres psql -qc "ALTER SYSTEM SET wal_level = logical" \
  -c "ALTER SYSTEM SET max_connections = 300" \
  -c "ALTER USER postgres PASSWORD '\$db_password'" \
  -c 'CREATE DATABASE "pi-dash"'
sudo systemctl restart postgresql

# Dev-only values for what .env.sample leaves blank but the app requires.
cp .env.sample .env
set_env() { sed -i "s|^\$1=.*|\$1=\"\$2\"|" .env; }
set_env DEV_DB_PASSWORD "\$db_password"
set_env ZERO_REPLICA_FILE "\$HOME/.zero-replica.db"
set_env BETTER_AUTH_SECRET "\$(openssl rand -hex 32)"
set_env EVENT_SIGNUP_LINK_SECRET "\$(openssl rand -hex 32)"
set_env DATA_ENCRYPTION_KEY "\$(openssl rand -base64 32)"
set_env ZERO_ADMIN_PASSWORD "\$(openssl rand -hex 16)"
set_env VITE_CDN_URL http://localhost:3001/cdn
for key in AVATAR_FALLBACK_SEED GRAVATAR_API_KEY R2_ACCOUNT_ID R2_ACCESS_KEY R2_SECRET_ACCESS_KEY \
  WHATSAPP_WEBHOOK_SECRET VOUCHER_ORG_NAME VOUCHER_ORG_ADDRESS VOUCHER_ORG_PHONE VOUCHER_ORG_EMAIL \
  VOUCHER_ORG_REGISTRATION VOUCHER_FINANCE_ADMIN_NAME; do
  set_env "\$key" dev
done

until pg_isready -qh localhost; do sleep 1; done
bun run db:migrate >/dev/null
bun run seed >/dev/null

# One dev run fills Zero's replica.
$(dev_up)
bun run dev:kill >/dev/null

sudo apt-get clean
sudo rm -rf /var/lib/apt/lists/*
EOF
}

start_cmd() {
  cat <<EOF
set -euo pipefail
cd ~/pi-dash
before=\$(git rev-parse HEAD)
git fetch -q --prune origin
if git rev-parse -q --verify 'origin/$1' >/dev/null; then
  git checkout -q -B '$1' 'origin/$1'
else
  git checkout -q -B '$1' origin/master
fi
bun install --frozen-lockfile
until pg_isready -qh localhost; do sleep 1; done
git diff --quiet "\$before" HEAD -- packages/db/src/migrations || bun run db:migrate >/dev/null
$(dev_up)
EOF
}


case "${1:-}" in
  snapshot)
    id=$(boat new --name pi-dash-snapshot --ttl 7200 --json | ready_id)
    test -n "$id"
    trap 'boat delete "$id" --yes --json >/dev/null' EXIT
    echo "Provisioning $id..."
    boat exec "$id" --timeout 1800 --stream -- bash -c "$(provision)"
    boat snapshot "$id" "$SNAPSHOT"
    echo "Saved snapshot $SNAPSHOT."
    ;;
  start)
    branch="${2:-master}"
    id=$(boat new --from "$SNAPSHOT" --name "pi-dash-$branch" --json | ready_id)
    test -n "$id"
    boat exec "$id" --timeout 600 --stream -- bash -c "$(start_cmd "$branch")"
    echo "Ready: $id. Open it with: bash scripts/boat.sh forward $id"
    ;;
  forward)
    id="${2:?sandbox id}"
    boat forward "$id" --remote 4848 &
    trap 'kill $!' EXIT
    echo "App on http://localhost:3001"
    boat forward "$id" --remote 3001
    ;;
  *)
    sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
