#!/bin/bash

# Configuration
FRONTEND_PORT=3000
BACKEND_PORT=8000
EXPECTED_BACKEND_PATH="backend/server.py"

echo "🏥 KARION LOCAL DOCTOR"
echo "======================"

# 1. Check Frontend Port
if lsof -i :$FRONTEND_PORT > /dev/null; then
    echo "✅ Frontend running on port $FRONTEND_PORT"
else
    echo "❌ Frontend NOT running on port $FRONTEND_PORT"
    EXIT_CODE=1
fi

# 2. Check Backend Port
if lsof -i :$BACKEND_PORT > /dev/null; then
    echo "✅ Backend running on port $BACKEND_PORT"
else
    echo "❌ Backend NOT running on port $BACKEND_PORT"
    EXIT_CODE=1
fi

# 3. Check Backend Process Path
# Find the python process running server.py
BACKEND_PID=$(lsof -t -i :$BACKEND_PORT)
if [ -n "$BACKEND_PID" ]; then
    MAX_RETRIES=3
    CMD=$(ps -p $BACKEND_PID -o comm= 2>/dev/null || ps -p $BACKEND_PID | tail -n 1)
    if [[ "$CMD" == *"$EXPECTED_BACKEND_PATH"* ]]; then
        echo "✅ Backend running from correct path: $EXPECTED_BACKEND_PATH"
    else
        echo "⚠️  Backend might be running from unexpected path:"
        echo "   Current: $CMD"
        echo "   Expected: $EXPECTED_BACKEND_PATH"
        # Not failing for now, just warning as wrapper scripts might mask this
    fi
fi

# 4. Check Backend Readiness
echo "Testing Backend Readiness..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$BACKEND_PORT/api/ready)
if [ "$HTTP_STATUS" == "200" ]; then
    echo "✅ Backend API is READY (200 OK)"
else
    echo "❌ Backend API is NOT READY. Status: $HTTP_STATUS"
    EXIT_CODE=1
fi

echo "======================"
if [ -z "$EXIT_CODE" ]; then
    echo "🎉 All Systems Go!"
    exit 0
else
    echo "🔥 Issues Detected!"
    exit 1
fi
