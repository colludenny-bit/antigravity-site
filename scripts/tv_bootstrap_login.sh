#!/usr/bin/env bash
set -euo pipefail

URL="${TV_CHART_URL:-${1:-https://www.tradingview.com/chart/}}"
STORAGE_STATE="${TV_STORAGE_STATE:-/Users/denny/Documents/New project/.run/tv-storage-state.json}"
mkdir -p "$(dirname "${STORAGE_STATE}")"

echo "[tv-bootstrap] URL: ${URL}"
echo "[tv-bootstrap] Storage state: ${STORAGE_STATE}"
echo "[tv-bootstrap] Si apre Chromium headful: fai login/configura layout, poi chiudi la finestra."

npx --yes playwright open \
  --browser chromium \
  --save-storage "${STORAGE_STATE}" \
  "${URL}"

echo "[tv-bootstrap] Sessione salvata."
