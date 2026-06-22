#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -d "${TMPDIR:-/tmp}/codex_pg8000_pkg" ]]; then
  export PYTHONPATH="${TMPDIR:-/tmp}/codex_pg8000_pkg:${PYTHONPATH:-}"
fi

if command -v python3 >/dev/null 2>&1; then
  python3 scripts/starlim_repair_audit.py
elif command -v python >/dev/null 2>&1; then
  python scripts/starlim_repair_audit.py
else
  echo "Python 3 no esta disponible" >&2
  exit 2
fi
