#!/usr/bin/env bash
# stop.sh — detiene API + todos los servicios docker (postgres, ollama si activo). Volúmenes preservados.
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

# matar procesos huérfanos tsx/pnpm
pkill -f 'src/main.ts' 2>/dev/null || true
pkill -f 'tsx.*watch' 2>/dev/null || true
pkill -f 'pnpm dev' 2>/dev/null || true
# liberar puerto 3000 si quedó algo escuchando
if command -v lsof >/dev/null 2>&1; then
  PORT_PID=$(lsof -ti:3000 2>/dev/null || true)
  if [[ -n "$PORT_PID" ]]; then
    log "liberando puerto 3000 (PID $PORT_PID)"
    kill -9 $PORT_PID 2>/dev/null || true
  fi
fi

if command -v docker >/dev/null 2>&1; then
  log "deteniendo todos los servicios docker compose (postgres, ollama, api si corren)"
  # --profile ai cubre ollama; sin profile baja postgres y api solamente.
  docker compose --profile ai down 2>/dev/null || docker compose down 2>/dev/null || true
fi

log "stop completo"
