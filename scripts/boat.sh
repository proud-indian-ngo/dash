#!/bin/bash
# boat.dev sandboxes for pi-dash.
#
#   bash scripts/boat.sh snapshot          build or refresh the "pi-dash" saved snapshot
#   bash scripts/boat.sh start [branch]    start a sandbox on a branch (default master; one not on
#                                          origin is created from master) with the app running
#   bash scripts/boat.sh forward <id>      forward the app (:3001) and Zero (:4848) to this machine
#   bash scripts/boat.sh verify [--pr <n>] [--shots <file>] [spec ...]
#                                          PR evidence for the pushed HEAD: runs the specs (default:
#                                          those the branch adds or changes) recorded, and with
#                                          --shots captures before and after screenshots in two
#                                          sandboxes at once; --pr puts it in the PR's description
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


# Runs in a sandbox: checks out $1, then captures $2 (before|after) screens
# when a shots file was copied in, and runs the E2E arguments in $3 (spec
# paths and Playwright flags), recorded; $4 is the specs, comma-separated.
# Leaves everything for the report in /tmp/evidence.
verify_cmd() {
  cat <<EOF
set -euo pipefail
cd ~/pi-dash
before=\$(git rev-parse HEAD)
git fetch -q origin '$1'
git checkout -q --detach '$1'
bun install --frozen-lockfile
# A no-op unless the branch's Playwright is newer than the snapshot's.
bunx playwright install --only-shell chromium >/dev/null
until pg_isready -qh localhost; do sleep 1; done
git diff --quiet "\$before" HEAD -- packages/db/src/migrations || bun run db:migrate >/dev/null
mkdir -p /tmp/evidence
if [ -f .evidence/shots.ts ]; then
  $(dev_up)
  bun .evidence/capture.ts .evidence/shots.ts /tmp/evidence/$2 $2
  bun run dev:kill >/dev/null
fi
if [ -n '$3' ]; then
  mkdir -p /tmp/evidence/e2e
  # The production server, as in CI: Vite dev compiles each route on its first
  # visit, slowly enough here to fail first attempts. E2E_EXCLUSIVE_LAST keeps
  # the specs that run last, alone, to those named.
  E2E_VIDEO=1 E2E_EXCLUSIVE_LAST='$4' PLAYWRIGHT_JSON_OUTPUT_NAME=/tmp/evidence/e2e/results.json \
    bash packages/e2e/run-e2e.sh $3 --reporter=line,json || true
  cd packages/e2e
  find test-results -name '*.webm' -exec cp --parents {} /tmp/evidence/e2e/ \;
fi
EOF
}

# Starts a sandbox for one side of `verify`, runs verify_cmd and copies
# /tmp/evidence back into $5. The sandbox is deleted either way.
verify_side() {
  local side=$1 sha=$2 specs=$3 shots=$4 out=$5 id
  id=$(boat new --from "$SNAPSHOT" --name "pi-dash-evidence-$side" --json | ready_id)
  test -n "$id"
  # shellcheck disable=SC2064 # the trap runs after `id` goes out of scope
  trap "boat delete '$id' --yes --json >/dev/null" EXIT
  if [ -n "$shots" ]; then
    boat exec "$id" -- bash -c 'mkdir -p ~/pi-dash/.evidence' >/dev/null
    for file in "$REPO_ROOT/scripts/evidence/capture.ts" "$REPO_ROOT/scripts/evidence/types.ts"; do
      boat scp "$file" "$id:pi-dash/.evidence/" >/dev/null
    done
    boat scp "$shots" "$id:pi-dash/.evidence/shots.ts" >/dev/null
  fi
  echo "$side: running in $id..."
  local named
  named=$(tr ' ' '\n' <<<"$specs" | grep '\.spec\.ts$' | sed 's|^tests/||' | paste -sd, - || true)
  # --json prints one object with stdout and exitCode for a quick command, and
  # streams frames for a long one: output chunks, then the exit code.
  boat exec "$id" --timeout 3000 --json -- bash -c "$(verify_cmd "$sha" "$side" "$specs" "$named")" >"$out/$side.json" || true
  jq -j 'if .type then (select(.type == "stdout" or .type == "stderr") | .data) else (.stdout // "") + (.stderr // "") end' \
    "$out/$side.json" >"$out/$side.log"
  if [ "$(jq -rs 'map(select(has("exitCode"))) | last | .exitCode' "$out/$side.json")" != 0 ]; then
    echo "$side: failed in $id." >&2
    return 1
  fi
  boat scp -r "$id:/tmp/evidence/." "$out/" >/dev/null
  echo "$side: done."
}

case "${1:-}" in
  verify)
    shift
    pr= shots=
    while [ $# -gt 0 ]; do
      case "$1" in
        --pr) pr=$2; shift 2 ;;
        --shots) shots=$(cd "$(dirname "$2")" && pwd)/$(basename "$2"); shift 2 ;;
        *) break ;;
      esac
    done
    git fetch -q origin master
    head=$(git rev-parse HEAD)
    if [ -z "$(git branch -r --contains "$head")" ]; then
      echo "Push $head first: the sandboxes check it out from origin." >&2
      exit 1
    fi
    base=$(git merge-base origin/master "$head")
    # Specs: those named, else every spec the branch adds or changes.
    specs="$*"
    if [ -z "$specs" ]; then
      specs=$(git diff --name-only --diff-filter=AM "$base" "$head" -- packages/e2e/tests |
        grep '\.spec\.ts$' | sed 's|^packages/e2e/||' | tr '\n' ' ' || true)
    fi
    if [ -z "$specs" ] && [ -z "$shots" ]; then
      echo "Nothing to show: pass --shots for screens, or E2E specs to run." >&2
      exit 1
    fi
    out="${TMPDIR:-/tmp}/pi-dash-evidence/$head"
    rm -rf "$out"
    mkdir -p "$out"
    pids=()
    if [ -n "$shots" ]; then
      (verify_side before "$base" "" "$shots" "$out") &
      pids+=($!)
    fi
    (verify_side after "$head" "$specs" "$shots" "$out") &
    pids+=($!)
    status=0
    for pid in "${pids[@]}"; do wait "$pid" || status=1; done
    if [ "$status" != 0 ]; then
      echo "A sandbox failed. Logs: $out/*.log" >&2
      tail -30 "$out"/*.log >&2
      exit 1
    fi
    if [ -n "$pr" ]; then
      gh pr view "$pr" --repo "$REPO" --json body --jq .body >"$out/pr-body.md"
    fi
    bun "$REPO_ROOT/scripts/evidence/report.ts" "$out" "$base" "$head"
    if [ -z "$pr" ]; then
      echo "Evidence: $out/evidence.md. Add it to a PR's description with --pr <number>."
      exit 0
    fi
    args=()
    while read -r file; do args+=(--attach "$file"); done <"$out/attachments.txt"
    (cd "$out" && gh pr edit "$pr" --repo "$REPO" --body-file evidence.md "${args[@]}" >/dev/null)
    # A local path left in the description is a file that didn't upload.
    if gh pr view "$pr" --repo "$REPO" --json body --jq .body | grep -qE '\]\((before|after|e2e)/'; then
      echo "Some evidence files didn't upload; see the PR description." >&2
      exit 1
    fi
    echo "Evidence added to the description of PR #$pr."
    ;;
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
    sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
