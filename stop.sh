#!/usr/bin/env bash
# stop.sh — detiene API y postgres. Volúmenes preservados.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

PID_FILE="$ROOT/.tagger.pid"

log() { printf '\033[1;33m[stop]\033[0m %s\n' "$*"; }

if [[ -f "$PID_FILE" ]]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    log "deteniendo API PID $PID"
    kill "$PID" 2>/dev/null || true
    # esperar hasta 10s
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

# matar procesos huérfanos tsx watch que pudieron quedar
pkill -f 'tsx watch src/main.ts' 2>/dev/null || true

if command -v docker >/dev/null 2>&1; then
  log "deteniendo postgres (volumen preservado)"
  docker compose stop postgres 2>/dev/null || true
fi

log "stop completo"
