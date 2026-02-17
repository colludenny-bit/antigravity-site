#!/bin/bash
REPO_PATH="/Users/denny/Library/Mobile Documents/com~apple~CloudDocs/kk code 1/Anty-G-cl-rep"
cd "$REPO_PATH" || exit 1

echo "=== CONTEXT ==="
pwd
git rev-parse --show-toplevel
git branch --show-current
git status --short

echo ""
echo "=== FILES EXPECTED ==="
test -f "scripts/local-doctor.sh" && echo "local-doctor.sh OK" || echo "local-doctor.sh MISSING"
test -f "scripts/smoke-login.sh" && echo "smoke-login.sh OK" || echo "smoke-login.sh MISSING"
test -f "frontend/src/services/api.js" && echo "api.js OK" || echo "api.js MISSING"

echo ""
echo "=== QUICK CONTENT CHECK ==="
echo "--- local-doctor.sh (first 10 lines) ---"
head -n 10 "scripts/local-doctor.sh"
echo "--- smoke-login.sh (first 10 lines) ---"
head -n 10 "scripts/smoke-login.sh"
echo "--- api.js (first 10 lines) ---"
head -n 10 "frontend/src/services/api.js"

echo ""
echo "=== PACKAGE SCRIPTS CHECK ==="
grep -nE "doctor:local|smoke:local" "frontend/package.json"

echo ""
echo "=== BACKEND READY CHECK ==="
grep -nE "/api/ready|db_connected|demo_mode" "backend/server.py"
echo "Requesting /api/ready..."
curl -s -i "http://localhost:8000/api/ready"

echo ""
echo "=== DIFF CHECK ==="
git diff --name-only
echo "--- AuthContext.js diff (first 20 lines) ---"
git diff -- "frontend/src/contexts/AuthContext.js" | head -n 20
echo "--- AuthPage.jsx diff (first 20 lines) ---"
git diff -- "frontend/src/components/pages/AuthPage.jsx" | head -n 20
echo "--- server.py diff (first 20 lines) ---"
git diff -- "backend/server.py" | head -n 20

echo ""
echo "=== EXEC CHECK ==="
bash "scripts/local-doctor.sh"
bash "scripts/smoke-login.sh"
