#!/usr/bin/env bash
# Dump comercios_catalogo desde DB local y restaurar en prod.
# Usa el container postgres local para pg_dump y psql (no requiere psql en host).
#
# Uso:
#   PROD_DATABASE_URL='postgres://user:pass@host:5432/db' bash scripts/dump-catalogo-prod.sh
#
# Modo default: APPEND (no borra prod).
# Reset prod antes de cargar: WIPE_PROD=1 bash scripts/dump-catalogo-prod.sh

set -euo pipefail

LOCAL_CONTAINER="${LOCAL_CONTAINER:-tagger-postgres-1}"
LOCAL_DB="${LOCAL_DB:-tagger}"
LOCAL_USER="${LOCAL_USER:-tagger}"
DUMP_FILE="${DUMP_FILE:-./comercios_catalogo.sql}"
WIPE_PROD="${WIPE_PROD:-0}"

if [[ -z "${PROD_DATABASE_URL:-}" ]]; then
  echo "ERROR: setear PROD_DATABASE_URL" >&2
  exit 1
fi

echo "==> dump local: ${LOCAL_CONTAINER}/${LOCAL_DB}.comercios_catalogo"
docker exec "${LOCAL_CONTAINER}" pg_dump \
  -U "${LOCAL_USER}" \
  -d "${LOCAL_DB}" \
  --data-only \
  --table=comercios_catalogo \
  --no-owner \
  --no-privileges \
  > "${DUMP_FILE}"

filas=$(grep -c '^' "${DUMP_FILE}" || true)
echo "    archivo: ${DUMP_FILE} (${filas} líneas SQL)"

echo "==> prod target: $(echo "${PROD_DATABASE_URL}" | sed 's|//[^@]*@|//***@|')"

# Helper: corre psql en container temporal apuntando a prod.
run_psql_prod() {
  docker run --rm -i \
    -e PGSSLMODE="${PGSSLMODE:-prefer}" \
    postgres:16-alpine \
    psql "${PROD_DATABASE_URL}" -v ON_ERROR_STOP=1 "$@"
}

if [[ "${WIPE_PROD}" == "1" ]]; then
  echo "==> WIPE_PROD=1 → TRUNCATE comercios_catalogo en prod"
  echo "TRUNCATE comercios_catalogo RESTART IDENTITY CASCADE;" | run_psql_prod
fi

echo "==> restore en prod (envuelto en BEGIN/COMMIT)"
{
  echo "BEGIN;"
  cat "${DUMP_FILE}"
  echo "COMMIT;"
} | run_psql_prod

echo "==> verificación count prod"
echo "SELECT count(*) AS total FROM comercios_catalogo;" | run_psql_prod

echo "==> OK"
