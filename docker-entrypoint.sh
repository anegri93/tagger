#!/bin/sh
set -e

echo "[entrypoint] running migrations..."
node dist/scripts/migrate.js

echo "[entrypoint] running seed (idempotente)..."
node dist/scripts/seed.js

echo "[entrypoint] starting API..."
exec node dist/main.js
