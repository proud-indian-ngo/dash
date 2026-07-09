#!/bin/bash

port_listener_pids() {
  lsof -nP -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null || true
}

stop_port_processes() {
  local port="$1"
  local pids

  pids="$(port_listener_pids "$port")"
  if [ -z "$pids" ]; then
    return
  fi

  echo "Stopping listener processes on port $port: $pids"
  kill -TERM $pids 2>/dev/null || true
  sleep 1

  pids="$(port_listener_pids "$port")"
  if [ -n "$pids" ]; then
    echo "Force-stopping listener processes on port $port: $pids"
    kill -KILL $pids 2>/dev/null || true
    sleep 1
  fi

  pids="$(port_listener_pids "$port")"
  if [ -n "$pids" ]; then
    echo "ERROR: listener processes still hold port $port: $pids"
    return 1
  fi
}

cleanup_on_exit() {
  local exit_code=$?

  trap - EXIT
  if ! cleanup && [ "$exit_code" -eq 0 ]; then
    exit_code=1
  fi
  exit "$exit_code"
}
