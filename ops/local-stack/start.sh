#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/backend"
RUN_DIR="$ROOT_DIR/.run/local-stack"
FRONTEND_LOG="$RUN_DIR/frontend.log"
BACKEND_LOG="$RUN_DIR/backend.log"
FRONTEND_PORT=3000
BACKEND_PORT=8000
FRONTEND_SCREEN="kairon_frontend"
BACKEND_SCREEN="kairon_backend"

mkdir -p "$RUN_DIR"

is_listening() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

wait_http_200() {
  local url="$1"
  local timeout_seconds="${2:-30}"
  local elapsed=0
  while (( elapsed < timeout_seconds )); do
    code="$(curl -s -o /dev/null -w "%{http_code}" "$url" || true)"
    if [[ "$code" == "200" ]]; then
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  return 1
}

backend_ready() {
  local code
  code="$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$BACKEND_PORT/api/ready" || true)"
  [[ "$code" == "200" ]]
}

kill_port_listener() {
  local port="$1"
  local pids
  pids="$(lsof -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${pids:-}" ]]; then
    kill $pids >/dev/null 2>&1 || true
    sleep 1
  fi
}

start_backend() {
  if is_listening "$BACKEND_PORT"; then
    if backend_ready; then
      echo "Backend gia attivo e pronto su :$BACKEND_PORT"
      return 0
    fi
    echo "Porta $BACKEND_PORT occupata ma backend non pronto: riavvio..."
    kill_port_listener "$BACKEND_PORT"
  fi

  local py_bin="$ROOT_DIR/.venv/bin/python"
  if [[ ! -x "$py_bin" ]]; then
    py_bin="python3"
  fi

  echo "Avvio backend su :$BACKEND_PORT ..."
  screen -dmS "$BACKEND_SCREEN" bash -lc "cd \"$ROOT_DIR\" && \"$py_bin\" \"$BACKEND_DIR/server.py\" >>\"$BACKEND_LOG\" 2>&1"
}

start_frontend() {
  if is_listening "$FRONTEND_PORT"; then
    echo "Frontend gia attivo su :$FRONTEND_PORT"
    return 0
  fi

  echo "Avvio frontend su :$FRONTEND_PORT ..."
  screen -dmS "$FRONTEND_SCREEN" bash -lc "cd \"$FRONTEND_DIR\" && npm run dev -- --host 0.0.0.0 --port $FRONTEND_PORT >>\"$FRONTEND_LOG\" 2>&1"
}

start_backend
start_frontend

echo "Verifica readiness..."
if ! wait_http_200 "http://localhost:$BACKEND_PORT/api/ready" 45; then
  echo "Backend non pronto. Ultime righe log:"
  tail -n 60 "$BACKEND_LOG" || true
  exit 1
fi

if ! wait_http_200 "http://localhost:$FRONTEND_PORT/" 45; then
  echo "Frontend non pronto. Ultime righe log:"
  tail -n 60 "$FRONTEND_LOG" || true
  exit 1
fi

echo "OK: stack locale attivo."
echo "Frontend: http://localhost:$FRONTEND_PORT"
echo "Backend : http://localhost:$BACKEND_PORT/api/ready"
echo "Stato   : bash \"$ROOT_DIR/ops/local-stack/status.sh\""
