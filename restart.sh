#!/usr/bin/env bash
# restart.sh — stop + start.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

log() { printf '\033[1;35m[restart]\033[0m %s\n' "$*"; }

log "stop fase"
"$ROOT/stop.sh"

log "start fase"
"$ROOT/start.sh"
