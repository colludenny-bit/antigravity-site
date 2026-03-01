#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8000}"
EMAIL="${OPS_VERIFY_EMAIL:-ops_verify_karion@example.com}"
PASSWORD="${OPS_VERIFY_PASSWORD:-Password123!}"
NAME="${OPS_VERIFY_NAME:-Ops Verify}"

echo "== Karion Ops Verify =="
echo "Base URL: $BASE_URL"

READY="$(curl -fsS "$BASE_URL/api/ready")"
echo "ready: $READY"

TOKEN="$(curl -sS -X POST "$BASE_URL/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"$NAME\"}" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("access_token",""))')"

if [[ -z "$TOKEN" ]]; then
  TOKEN="$(curl -sS -X POST "$BASE_URL/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
    | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("access_token",""))')"
fi

if [[ -z "$TOKEN" ]]; then
  echo "ERROR: unable to obtain auth token"
  exit 1
fi

echo "token_ok: yes"

COLLECTION="$(curl -fsS "$BASE_URL/api/system/collection/status" -H "Authorization: Bearer $TOKEN")"
INTEGRITY="$(curl -fsS "$BASE_URL/api/system/data-integrity" -H "Authorization: Bearer $TOKEN")"
MAINTENANCE="$(curl -fsS -X POST "$BASE_URL/api/system/storage/maintenance" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}')"

echo "collection: $COLLECTION"
echo "integrity: $INTEGRITY"
echo "maintenance: $MAINTENANCE"
echo "== Ops Verify OK =="

