#!/usr/bin/env bash
# stop.sh — detiene API + servicios docker (postgres). Volúmenes preservados.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

PID_FILE="$ROOT/.tagger.pid"
USER_ID=$(id -u)

log() { printf '\033[1;33m[stop]\033[0m %s\n' "$*"; }

# 1. API por PID file
if [[ -f "$PID_FILE" ]]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    log "deteniendo API PID $PID"
    kill "$PID" 2>/dev/null || true
    for i in {1..10}; do
      kill -0 "$PID" 2>/dev/null || break
      sleep 1
    done
    if kill -0 "$PID" 2>/dev/null; then
      log "forzando kill -9 $PID"
      kill -9 "$PID" 2>/dev/null || true
    fi
  else
    log "API no corre (PID $PID stale)"
  fi
  rm -f "$PID_FILE"
else
  log "no hay PID file"
fi

# 2. huérfanos del usuario (scope -U evita matar procesos de otros)
pkill -U "$USER_ID" -f 'tsx.*watch.*src/main.ts' 2>/dev/null || true
pkill -U "$USER_ID" -f 'node.*dist/main.js' 2>/dev/null || true

# 3. puerto 3000
if command -v lsof >/dev/null 2>&1; then
  PORT_PID=$(lsof -ti:3000 -sTCP:LISTEN 2>/dev/null || true)
  if [[ -n "$PORT_PID" ]]; then
    log "liberando puerto 3000 (PID $PORT_PID)"
    kill -9 $PORT_PID 2>/dev/null || true
  fi
fi

# 4. docker compose
if command -v docker >/dev/null 2>&1; then
  log "deteniendo docker compose (postgres)"
  docker compose down --remove-orphans 2>/dev/null || true
fi

log "stop completo"
