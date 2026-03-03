#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_DIR="$ROOT_DIR/.run/local-stack"
FRONTEND_SCREEN="kairon_frontend"
BACKEND_SCREEN="kairon_backend"

if (screen -list 2>&1 || true) | grep -Eq "\\.${FRONTEND_SCREEN}[[:space:]]"; then
  screen -S "$FRONTEND_SCREEN" -X quit || true
  echo "Terminata screen $FRONTEND_SCREEN"
fi
if (screen -list 2>&1 || true) | grep -Eq "\\.${BACKEND_SCREEN}[[:space:]]"; then
  screen -S "$BACKEND_SCREEN" -X quit || true
  echo "Terminata screen $BACKEND_SCREEN"
fi

# fallback: chiude eventuali processi rimasti sulle porte standard
for port in 3000 8000; do
  pids="$(lsof -t -iTCP:$port -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${pids:-}" ]]; then
    kill $pids >/dev/null 2>&1 || true
    echo "Liberata porta $port (PID: $pids)"
  fi
done

echo "Stack locale fermato."
