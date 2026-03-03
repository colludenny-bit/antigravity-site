#!/usr/bin/env bash
set -euo pipefail

ASSET="${ASSET:-${1:-}}"
if [[ -z "${ASSET}" ]]; then
  echo "Usage: ASSET=XAUUSD TV_CHART_URL='https://www.tradingview.com/chart/...' ./scripts/tv_capture_daemon.sh"
  exit 1
fi

INTERVAL_SEC="${TV_INTERVAL_SEC:-900}"
if ! [[ "${INTERVAL_SEC}" =~ ^[0-9]+$ ]]; then
  echo "TV_INTERVAL_SEC must be integer seconds"
  exit 1
fi

echo "[tv-daemon] start asset=${ASSET} interval=${INTERVAL_SEC}s"
while true; do
  if ! "/Users/denny/Documents/New project/scripts/tv_capture_and_upload.sh" "${ASSET}"; then
    echo "[tv-daemon] cycle failed at $(date -u +%FT%TZ)"
  fi
  sleep "${INTERVAL_SEC}"
done
