#!/usr/bin/env bash
# start.sh — boot completo: postgres + deps + migración + seed + API foreground.
# Uso:
#   bash start.sh           # postgres + tagger
#   OLLAMA=1 bash start.sh  # + ollama (IA fallback)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

PID_FILE="$ROOT/.tagger.pid"

log() { printf '\033[1;36m[start]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[start]\033[0m %s\n' "$*" >&2; }

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  err "API ya corre (PID $(cat "$PID_FILE")). Usá restart.sh o stop.sh."
  exit 1
fi
rm -f "$PID_FILE"

# Detectar instancias huérfanas escuchando en 3000 (e.g. de pnpm dev manuales o nohup).
PORT=${PORT:-3000}
if command -v lsof >/dev/null 2>&1; then
  STALE_PIDS=$(lsof -ti tcp:$PORT -sTCP:LISTEN 2>/dev/null || true)
  if [[ -n "$STALE_PIDS" ]]; then
    err "puerto $PORT ocupado por PID(s): $STALE_PIDS — matando antes de arrancar"
    kill -9 $STALE_PIDS 2>/dev/null || true
    sleep 1
  fi
fi
# tsx watch huérfanos sin LISTEN (preflight wrappers)
STALE_TSX=$(pgrep -f "tsx.*watch.*src/main\.ts" 2>/dev/null || true)
if [[ -n "$STALE_TSX" ]]; then
  err "tsx watch huérfanos: $STALE_TSX — limpiando"
  kill -9 $STALE_TSX 2>/dev/null || true
  sleep 1
fi

# .env (auto-genera API_KEY si .env no existe)
if [[ ! -f .env ]]; then
  if [[ ! -f .env.example ]]; then
    err ".env y .env.example no existen"
    exit 1
  fi
  log ".env no existe, generando desde .env.example"
  cp .env.example .env
  # generar API_KEY aleatoria (32 chars hex)
  if command -v openssl >/dev/null 2>&1; then
    NEW_KEY=$(openssl rand -hex 24)
  else
    NEW_KEY=$(head -c 24 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 32)
  fi
  # sustituir API_KEY en .env (portable mac/linux)
  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "s|^API_KEY=.*|API_KEY=$NEW_KEY|" .env
  else
    sed -i "s|^API_KEY=.*|API_KEY=$NEW_KEY|" .env
  fi
  log "API_KEY generada y guardada en .env"
  log "  → $NEW_KEY"
fi

# prereqs
if ! command -v docker >/dev/null 2>&1; then
  err "docker no encontrado en PATH"
  exit 1
fi
if ! command -v pnpm >/dev/null 2>&1; then
  err "pnpm no encontrado. Instalá con: corepack enable pnpm"
  exit 1
fi

# postgres
log "levantando postgres"
docker compose up -d postgres

log "esperando postgres healthy"
for i in {1..30}; do
  status=$(docker compose ps --format json postgres 2>/dev/null | grep -o '"Health":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
  if [[ "$status" == "healthy" ]]; then
    log "postgres healthy"
    break
  fi
  if [[ $i -eq 30 ]]; then
    err "postgres no llegó a healthy en 60s"
    exit 1
  fi
  sleep 2
done

# ollama opcional
if [[ "${OLLAMA:-0}" == "1" ]]; then
  log "levantando ollama (profile ai)"
  docker compose --profile ai up -d ollama
fi

# deps
log "instalando deps"
pnpm install --silent

# migración
log "aplicando migrations"
pnpm db:migrate

# seed idempotente
if [[ -f data/seed.sql ]]; then
  log "cargando seed (idempotente)"
  PG_CONTAINER=$(docker compose ps -q postgres)
  if [[ -n "$PG_CONTAINER" ]]; then
    docker exec -i "$PG_CONTAINER" psql -U tagger -d tagger -q < data/seed.sql >/dev/null
    log "seed cargado"
  else
    err "no pude resolver contenedor postgres para seed"
    exit 1
  fi
else
  log "data/seed.sql no existe (skip seed)"
fi

# API
log "arrancando API foreground (Ctrl+C para detener)"
pnpm dev &
API_PID=$!
echo $API_PID > "$PID_FILE"
cleanup() {
  rm -f "$PID_FILE"
  kill -TERM $API_PID 2>/dev/null || true
  wait $API_PID 2>/dev/null || true
}
trap cleanup EXIT INT TERM
wait $API_PID
