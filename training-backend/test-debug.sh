#!/bin/bash
echo "=== Login User 1 ==="
L1=$(curl -s -X POST http://localhost:4000/api/auth/mock -H "Content-Type: application/json" -d '{"nickname":"张三"}')
echo "$L1"
T1=$(echo "$L1" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "Token T1=$T1"
echo ""

echo "=== Login User 2 ==="
L2=$(curl -s -X POST http://localhost:4000/api/auth/mock -H "Content-Type: application/json" -d '{"nickname":"李四"}')
echo "$L2"
T2=$(echo "$L2" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "Token T2=$T2"
echo ""

echo "=== Decode tokens ==="
python3 -c "
import base64,json
for i,t in enumerate(['$T1','$T2'],1):
    parts=t.split('.')
    payload=json.loads(base64.urlsafe_b64decode(parts[1]+'=='))
    print(f'T{i} payload: {payload}')
"
echo ""

echo "=== User 1 list ==="
echo "T1: $(curl -s http://localhost:4000/api/templates -H "Authorization: Bearer $T1")"
echo ""
echo "=== User 2 list ==="
echo "T2: $(curl -s http://localhost:4000/api/templates -H "Authorization: Bearer $T2")"
