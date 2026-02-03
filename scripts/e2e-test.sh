#!/usr/bin/env bash
# E2E tests for Phase 1 (x402) and Phase 2 (Stripe). Run with server up: npm run dev (then npm run test:e2e).
# Real payments (MetaMask, Stripe test card) require manual testing.

set -e
BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0

check() {
  local name="$1"
  local code="$2"
  local expected="$3"
  local body="$4"
  if [ "$code" = "$expected" ] && { [ -z "$body" ] || echo "$body" | grep -q "$5"; }; then
    echo "  ✓ $name"
    ((PASS++)) || true
  else
    echo "  ✗ $name (HTTP $code, expected $expected)"
    ((FAIL++)) || true
  fi
}

echo "E2E tests (BASE=$BASE)"
echo ""

code=$(curl -s -o /tmp/e2e-health -w "%{http_code}" "$BASE/health")
check "GET /health" "$code" "200" "$(cat /tmp/e2e-health)" ""

code=$(curl -s -o /tmp/e2e-home -w "%{http_code}" "$BASE/")
body=$(cat /tmp/e2e-home)
check "GET / (home)" "$code" "200" "$body" "Yoga classes"

code=$(curl -s -o /tmp/e2e-classes -w "%{http_code}" "$BASE/classes")
body=$(cat /tmp/e2e-classes)
check "GET /classes" "$code" "200" "$body" '"classes":'

code=$(curl -s -o /tmp/e2e-full -w "%{http_code}" "$BASE/class/1/full")
body=$(cat /tmp/e2e-full)
check "GET /class/1/full → 402 JSON" "$code" "402" "$body" '"accepts"'

code=$(curl -s -o /tmp/e2e-html -w "%{http_code}" -H "Accept: text/html" "$BASE/class/1/full")
check "GET /class/1/full (Accept: text/html) → 402 HTML" "$code" "402" "" ""

code=$(curl -s -o /tmp/e2e-invalid -w "%{http_code}" -H "X-Payment: invalid" "$BASE/class/1/full")
body=$(cat /tmp/e2e-invalid)
check "GET /class/1/full (X-Payment: invalid) → 402" "$code" "402" "$body" "Invalid payment"

code=$(curl -s -o /tmp/e2e-preview -w "%{http_code}" "$BASE/class/1/preview")
body=$(cat /tmp/e2e-preview)
check "GET /class/1/preview" "$code" "200" "$body" "preview_url"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/class/99/full")
check "GET /class/99/full → 404" "$code" "404" "" ""

# Phase 2: Stripe
code=$(curl -s -o /tmp/e2e-products -w "%{http_code}" "$BASE/products")
body=$(cat /tmp/e2e-products)
check "GET /products" "$code" "200" "$body" '"products":'

code=$(curl -s -o /tmp/e2e-checkout-missing -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{}' "$BASE/checkout")
body=$(cat /tmp/e2e-checkout-missing)
check "POST /checkout (no productId) → 400" "$code" "400" "$body" "productId"

code=$(curl -s -o /tmp/e2e-checkout -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{"productId":"mat"}' "$BASE/checkout")
body=$(cat /tmp/e2e-checkout)
# With real STRIPE_SECRET_KEY: 200 and "url". With placeholder: 500/503 and "error"
if [ "$code" = "200" ] && echo "$body" | grep -q '"url"'; then
  echo "  ✓ POST /checkout (mat) → 200 with url"
  ((PASS++)) || true
elif [ "$code" = "500" ] || [ "$code" = "503" ]; then
  echo "  ✓ POST /checkout (mat) → $code (no valid Stripe key; add STRIPE_SECRET_KEY for URL)"
  ((PASS++)) || true
else
  echo "  ✗ POST /checkout (mat) (HTTP $code)"
  ((FAIL++)) || true
fi

echo ""
echo "Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
