#!/usr/bin/env bash
# start.sh — levanta postgres, instala deps, corre migración + seeds, arranca API en foreground (logs en consola).
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
# limpiar PID stale
rm -f "$PID_FILE"

if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    log ".env no existe, copiando desde .env.example"
    cp .env.example .env
    err "Editá .env (especialmente API_KEY) y volvé a correr start.sh"
    exit 1
  else
    err ".env y .env.example no existen"
    exit 1
  fi
fi

if ! command -v docker >/dev/null 2>&1; then
  err "docker no encontrado en PATH"
  exit 1
fi
if ! command -v pnpm >/dev/null 2>&1; then
  err "pnpm no encontrado. Instalá con: corepack enable pnpm"
  exit 1
fi

log "levantando postgres (docker compose)"
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

log "instalando deps"
pnpm install --silent

log "aplicando migración"
pnpm db:migrate

log "cargando catálogos (loaders)"
pnpm db:load:all || log "loaders parciales (continúa)"

log "arrancando API en foreground (Ctrl+C para detener)"
echo $$ > "$PID_FILE"
trap 'rm -f "$PID_FILE"' EXIT
exec pnpm dev
