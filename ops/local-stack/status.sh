#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FRONTEND_SCREEN="kairon_frontend"
BACKEND_SCREEN="kairon_backend"

check_port() {
  local name="$1"
  local port="$2"
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "OK   $name su :$port"
  else
    echo "DOWN $name su :$port"
  fi
}

check_port "frontend" 3000
check_port "backend " 8000

code="$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/ready || true)"
if [[ "$code" == "200" ]]; then
  echo "OK   backend readiness /api/ready"
else
  echo "DOWN backend readiness /api/ready (HTTP $code)"
fi

echo "Doctor completo:"
cd "$ROOT_DIR/frontend" && npm run doctor:local

echo "Screen sessions:"
if (screen -list 2>&1 || true) | grep -Eq "\\.${FRONTEND_SCREEN}[[:space:]]"; then
  echo "OK   screen $FRONTEND_SCREEN"
else
  echo "DOWN screen $FRONTEND_SCREEN"
fi
if (screen -list 2>&1 || true) | grep -Eq "\\.${BACKEND_SCREEN}[[:space:]]"; then
  echo "OK   screen $BACKEND_SCREEN"
else
  echo "DOWN screen $BACKEND_SCREEN"
fi
