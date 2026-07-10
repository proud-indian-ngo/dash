#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=process-cleanup.sh
source "$SCRIPT_DIR/process-cleanup.sh"

PORT=""
PORT_FILE="$(mktemp "${TMPDIR:-/tmp}/pi-dash-e2e-port.XXXXXX")"
LISTENER_PID=""
CLIENT_PID=""

cleanup() {
  if [ -n "$CLIENT_PID" ]; then
    kill -KILL "$CLIENT_PID" 2>/dev/null || true
    wait "$CLIENT_PID" 2>/dev/null || true
  fi
  if [ -n "$LISTENER_PID" ]; then
    kill -KILL "$LISTENER_PID" 2>/dev/null || true
    wait "$LISTENER_PID" 2>/dev/null || true
  fi
  rm -f "$PORT_FILE"
}
trap cleanup EXIT

PORT_FILE="$PORT_FILE" bun -e '
  process.on("SIGTERM", () => {});
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response("ok"),
  });
  await Bun.write(process.env.PORT_FILE, String(server.port));
  setInterval(() => {}, 1_000);
' &
LISTENER_PID=$!

for _ in $(seq 1 50); do
  if [ -s "$PORT_FILE" ] && kill -0 "$LISTENER_PID" 2>/dev/null; then
    break
  fi
  sleep 0.1
done

if [ ! -s "$PORT_FILE" ] || ! kill -0 "$LISTENER_PID" 2>/dev/null; then
  echo "ERROR: test listener failed to start"
  exit 1
fi

PORT="$(<"$PORT_FILE")"
if [ "$(port_listener_pids "$PORT")" != "$LISTENER_PID" ]; then
  echo "ERROR: test does not own the listener on port $PORT"
  exit 1
fi

PORT="$PORT" bun -e '
  await Bun.connect({
    hostname: "127.0.0.1",
    port: Number(process.env.PORT),
    socket: {
      data() {},
      error() {},
      close() {},
    },
  });
  setInterval(() => {}, 1_000);
' &
CLIENT_PID=$!

for _ in $(seq 1 50); do
  if lsof -nP -a -p "$CLIENT_PID" -iTCP:"$PORT" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done
lsof -nP -a -p "$CLIENT_PID" -iTCP:"$PORT" >/dev/null

stop_port_processes "$PORT"
wait "$LISTENER_PID" 2>/dev/null || true
LISTENER_PID=""

if ! kill -0 "$CLIENT_PID" 2>/dev/null; then
  echo "ERROR: connected client was terminated"
  exit 1
fi

if lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "ERROR: listener still holds port $PORT"
  exit 1
fi

assert_exit_status() {
  local expected="$1"
  local original="$2"
  local cleanup_status="$3"
  local actual

  set +e
  CLEANUP_STATUS="$cleanup_status" bash -c '
    source "$1"
    cleanup() { return "$CLEANUP_STATUS"; }
    trap cleanup_on_exit EXIT
    exit "$2"
  ' bash "$SCRIPT_DIR/process-cleanup.sh" "$original"
  actual=$?
  set -e

  if [ "$actual" -ne "$expected" ]; then
    echo "ERROR: exit $original with cleanup $cleanup_status returned $actual, expected $expected"
    exit 1
  fi
}

assert_exit_status 0 0 0
assert_exit_status 1 0 1
assert_exit_status 7 7 0
assert_exit_status 7 7 1

echo "process and exit cleanup tests passed"
