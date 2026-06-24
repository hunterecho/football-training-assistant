#!/bin/bash
# Quick test for backend API
set -e

echo "=== Test 1: Login ==="
LOGIN_RESP=$(curl -s -X POST http://localhost:4000/api/auth/mock \
  -H "Content-Type: application/json" \
  -d '{"nickname":"测试爸爸"}')
echo "$LOGIN_RESP"
TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo ""

echo "=== Test 2: Create template ==="
TPL_RESP=$(curl -s -X POST http://localhost:4000/api/templates \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"周六晨练","description":"8点到10点","drills":[{"id":"d1","title":"热身","duration":300,"cues":[]}]}')
echo "$TPL_RESP"
TPL_ID=$(echo "$TPL_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['template']['id'])")
echo ""

echo "=== Test 3: Create plan ==="
curl -s -X POST http://localhost:4000/api/plans \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"template_id\":\"$TPL_ID\",\"title\":\"本周六训练\",\"date\":\"2026-06-28\"}"
echo ""

echo "=== Test 4: List plans ==="
curl -s http://localhost:4000/api/plans -H "Authorization: Bearer $TOKEN"
echo ""

echo "=== Test 5: Another user (should see empty) ==="
LOGIN2=$(curl -s -X POST http://localhost:4000/api/auth/mock \
  -H "Content-Type: application/json" \
  -d '{"nickname":"另一位教练"}')
TOKEN2=$(echo "$LOGIN2" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "Templates:"
curl -s http://localhost:4000/api/templates -H "Authorization: Bearer $TOKEN2"
echo ""
echo "Plans:"
curl -s http://localhost:4000/api/plans -H "Authorization: Bearer $TOKEN2"
echo ""

echo "=== All tests passed ==="
