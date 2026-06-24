#!/bin/bash
set -e

echo "=== User 1 login ==="
T1=$(curl -s -X POST http://localhost:4000/api/auth/mock -H "Content-Type: application/json" -d '{"nickname":"张三"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "Token for 张三: ${T1:0:30}..."

echo "=== User 2 login ==="
T2=$(curl -s -X POST http://localhost:4000/api/auth/mock -H "Content-Type: application/json" -d '{"nickname":"李四"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "Token for 李四: ${T2:0:30}..."

echo ""
echo "=== User 1 creates template ==="
curl -s -X POST http://localhost:4000/api/templates -H "Authorization: Bearer $T1" -H "Content-Type: application/json" -d '{"name":"张三的模板"}'
echo ""

echo ""
echo "=== User 2 creates template ==="
curl -s -X POST http://localhost:4000/api/templates -H "Authorization: Bearer $T2" -H "Content-Type: application/json" -d '{"name":"李四的模板"}'
echo ""

echo ""
echo "=== User 1 lists templates (should only see own) ==="
curl -s http://localhost:4000/api/templates -H "Authorization: Bearer $T1"
echo ""

echo ""
echo "=== User 2 lists templates (should only see own) ==="
curl -s http://localhost:4000/api/templates -H "Authorization: Bearer $T2"
echo ""

echo ""
echo "=== Cross-check: User 1 tries to see User 2's data ==="
echo "User 1 sees: $(curl -s http://localhost:4000/api/templates -H 'Authorization: Bearer $T1')"
echo "User 2 sees: $(curl -s http://localhost:4000/api/templates -H 'Authorization: Bearer $T2')"
