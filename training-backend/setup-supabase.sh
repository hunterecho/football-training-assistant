#!/bin/bash
# =============================================
# Supabase 环境初始化脚本
# 用法：bash setup-supabase.sh
# =============================================

set -e

echo "============================================="
echo " 足球集训应用 - Supabase 环境初始化"
echo "============================================="
echo ""

# 检查是否已安装 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 请先安装 Node.js (https://nodejs.org)"
    exit 1
fi

# 检查是否已安装依赖
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
fi

# 检查 .env 文件
if [ ! -f ".env" ]; then
    echo "📝 创建 .env 文件..."
    cp .env.example .env
    echo "✅ 已创建 .env 文件"
    echo ""
else
    echo "✅ .env 文件已存在"
fi

# 生成 JWT_SECRET
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
if grep -q "JWT_SECRET=change-me-to-a-random-string" .env || grep -q "JWT_SECRET=dev-secret-change-me" .env; then
    echo "🔑 生成随机 JWT_SECRET..."
    sed -i '' "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" .env
    echo "✅ JWT_SECRET 已更新"
fi

# 检查是否配置了 Supabase
if grep -q "your-supabase-project-url" .env || grep -q "SUPABASE_URL=$" .env; then
    echo ""
    echo "⚠️  您尚未配置 Supabase 连接信息！"
    echo ""
    echo "请按以下步骤操作："
    echo ""
    echo "1. 访问 https://supabase.com 并创建项目"
    echo "2. 打开项目的 SQL Editor，执行 supabase/schema.sql 中的 SQL"
    echo "3. 将 Project URL 和 Service Role Key 填入 .env 文件"
    echo ""
    echo "详细步骤请查看: SUPABASE_SETUP.md"
    echo ""
    echo "配置完成后，运行: npm run dev"
    echo ""
    echo "--- 当前将使用 mock 模式（内存存储，重启后清空）---"
    echo ""
else
    echo "✅ Supabase 已配置"
    echo ""
    echo "🚀 启动后端服务..."
    echo ""
    npm run dev
fi
