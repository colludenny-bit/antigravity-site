#!/bin/bash

BASE_URL="http://localhost:8000/api"
EMAIL="smoke_test_$(date +%s)@example.com"
PASSWORD="Password123!"
NAME="Smoke Test User"

echo "🚬 KARION SMOKE TEST - LOGIN"
echo "============================"

# 1. Register
echo "1. Registering user $EMAIL..."
REGISTER_RES=$(curl -s -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\", \"name\": \"$NAME\"}")

TOKEN=$(echo $REGISTER_RES | python3 -c "import sys, json; print(json.load(sys.stdin).get('access_token', ''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
    echo "❌ Registration Failed"
    echo "Response: $REGISTER_RES"
    exit 1
else
    echo "✅ Registration Success. Token acquired."
fi

# 2. Login (Double check)
echo "2. Verifying Login..."
LOGIN_RES=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\"}")

TOKEN_LOGIN=$(echo $LOGIN_RES | python3 -c "import sys, json; print(json.load(sys.stdin).get('access_token', ''))" 2>/dev/null)

if [ -n "$TOKEN_LOGIN" ]; then
    echo "✅ Login Success"
else
    echo "❌ Login Failed"
    echo "Response: $LOGIN_RES"
    exit 1
fi

# 3. Check /auth/me
echo "3. Verifying /auth/me..."
ME_RES=$(curl -s -X GET "$BASE_URL/auth/me" \
  -H "Authorization: Bearer $TOKEN_LOGIN")

ME_EMAIL=$(echo $ME_RES | python3 -c "import sys, json; print(json.load(sys.stdin).get('email', ''))" 2>/dev/null)

if [ "$ME_EMAIL" == "$EMAIL" ]; then
    echo "✅ /auth/me Success. Identity confirmed."
else
    echo "❌ /auth/me Failed"
    echo "Response: $ME_RES"
    exit 1
fi

echo "============================"
echo "🎉 SMOKE TEST PASSED"
exit 0
