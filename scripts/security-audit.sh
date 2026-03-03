#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run/security-audit"
AUDIT_VENV="$RUN_DIR/.venv"
BACKEND_REQ="$ROOT_DIR/backend/requirements.txt"
ROOT_REQ="$ROOT_DIR/requirements.txt"
DEV_REQ="$ROOT_DIR/requirements-dev.txt"
FRONTEND_DIR="$ROOT_DIR/frontend"

pick_python() {
  for bin in python3.12 python3.11 python3.10 python3; do
    if command -v "$bin" >/dev/null 2>&1; then
      echo "$bin"
      return 0
    fi
  done
  return 1
}

prepare_filtered_requirements() {
  local src="$1"
  local out="$2"
  # `emergentintegrations` is private and not resolvable from public indexes.
  # We exclude it only from public CVE audit input.
  grep -Ev '^[[:space:]]*emergentintegrations([<>=!~].*)?$' "$src" > "$out"
}

PY_BIN="${AUDIT_PYTHON:-$(pick_python)}"

mkdir -p "$RUN_DIR"
if [[ ! -x "$AUDIT_VENV/bin/python" ]]; then
  "$PY_BIN" -m venv "$AUDIT_VENV"
fi

"$AUDIT_VENV/bin/python" -m pip install --quiet --upgrade pip pip-audit

ROOT_REQ_FILTERED="$RUN_DIR/requirements.filtered.txt"
DEV_REQ_FILTERED="$RUN_DIR/requirements-dev.filtered.txt"
BACKEND_REQ_FILTERED="$RUN_DIR/backend-requirements.filtered.txt"

prepare_filtered_requirements "$ROOT_REQ" "$ROOT_REQ_FILTERED"
prepare_filtered_requirements "$DEV_REQ" "$DEV_REQ_FILTERED"
prepare_filtered_requirements "$BACKEND_REQ" "$BACKEND_REQ_FILTERED"

echo "== Python Security Audit (public dependencies) =="
"$AUDIT_VENV/bin/pip-audit" -r "$ROOT_REQ_FILTERED"
"$AUDIT_VENV/bin/pip-audit" -r "$DEV_REQ_FILTERED"
"$AUDIT_VENV/bin/pip-audit" -r "$BACKEND_REQ_FILTERED"

echo "== Node Security Audit (production dependencies) =="
(
  cd "$FRONTEND_DIR"
  npm audit --omit=dev --audit-level=low
)

echo "== Security Audit OK =="
