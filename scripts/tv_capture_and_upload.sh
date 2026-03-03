#!/usr/bin/env bash
set -euo pipefail

ASSET="${ASSET:-${1:-}}"
if [[ -z "${ASSET}" ]]; then
  echo "Usage: ASSET=XAUUSD TV_CHART_URL='https://www.tradingview.com/chart/...' ./scripts/tv_capture_and_upload.sh"
  exit 1
fi

BACKEND_URL="${BACKEND_URL:-http://localhost:8000}"
TV_CHART_URL="${TV_CHART_URL:-}"
if [[ -z "${TV_CHART_URL}" ]]; then
  echo "Missing TV_CHART_URL environment variable"
  exit 1
fi

TV_STORAGE_STATE="${TV_STORAGE_STATE:-/Users/denny/Documents/New project/.run/tv-storage-state.json}"
OUT_DIR="${TV_OUT_DIR:-/Users/denny/Documents/New project/.run/tv-captures/${ASSET}}"
mkdir -p "${OUT_DIR}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SHOT_PATH="${OUT_DIR}/${ASSET}-${STAMP}.png"
WAIT_MS="${TV_WAIT_MS:-9000}"
SELECTOR="${TV_SCREEN_SELECTOR:-}"

CAPTURE_CMD=(npx --yes playwright screenshot
  --browser chromium
  --wait-for-timeout "${WAIT_MS}"
  --full-page
)
if [[ -f "${TV_STORAGE_STATE}" ]]; then
  CAPTURE_CMD+=(--load-storage "${TV_STORAGE_STATE}")
fi
if [[ -n "${SELECTOR}" ]]; then
  CAPTURE_CMD+=(--wait-for-selector "${SELECTOR}")
fi
CAPTURE_CMD+=("${TV_CHART_URL}" "${SHOT_PATH}")

echo "[tv-capture] Capturing ${ASSET}..."
"${CAPTURE_CMD[@]}"

if [[ ! -f "${SHOT_PATH}" ]]; then
  echo "[tv-capture] screenshot not created"
  exit 1
fi

UPLOAD_URL="${BACKEND_URL%/}/api/market/svp/screenshot/upload"
SECRET="${SVP_WEBHOOK_SECRET:-}"

echo "[tv-capture] Upload -> ${UPLOAD_URL}"
if [[ -n "${SECRET}" ]]; then
  curl -fsS -X POST "${UPLOAD_URL}" \
    -H "x-svp-secret: ${SECRET}" \
    -F "asset=${ASSET}" \
    -F "source=TV_AUTOMATION" \
    -F "note=auto_capture" \
    -F "file=@${SHOT_PATH};type=image/png" >/dev/null
else
  curl -fsS -X POST "${UPLOAD_URL}" \
    -F "asset=${ASSET}" \
    -F "source=TV_AUTOMATION" \
    -F "note=auto_capture" \
    -F "file=@${SHOT_PATH};type=image/png" >/dev/null
fi

echo "[tv-capture] done: ${SHOT_PATH}"
