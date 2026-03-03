#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY_BIN="$ROOT_DIR/.venv/bin/python"

if [[ ! -x "$PY_BIN" ]]; then
  echo "ERROR: Python venv non trovata in $PY_BIN"
  exit 1
fi

echo "== Pytest =="
"$PY_BIN" -m pytest -q "$ROOT_DIR/backend/tests" "$ROOT_DIR/test_tv.py" "$ROOT_DIR/test_api_reproduction.py"

echo "== Frontend Build =="
(
  cd "$ROOT_DIR/frontend"
  npm run build
)

echo "== Security Audit =="
bash "$ROOT_DIR/scripts/security-audit.sh"

echo "== Pre-push Checks OK =="
