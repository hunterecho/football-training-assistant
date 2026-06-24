# =============================================
# Supabase 配置指引
# =============================================
# 本指南将指导您从零开始配置 Supabase 后端服务。
# 完成后，您的应用将拥有持久化存储和多用户数据隔离功能。
# =============================================


## 步骤 1：注册并创建 Supabase 项目

1. 访问 [https://supabase.com](https://supabase.com)
2. 使用 GitHub 账号登录（最简单）
3. 点击 **"New Project"**
4. 填写信息：
   - **Name**：`coach-train`（或任意名称）
   - **Database Password**：生成一个强密码并保存好
   - **Region**：选择 `Northeast Asia (Tokyo)` 或 `Singapore`（亚洲延迟最低）
5. 点击 **"Create new project"**，等待 1-2 分钟初始化


## 步骤 2：获取 API 凭证

1. 进入项目后，左侧菜单点击 **"Settings"**（齿轮图标）
2. 点击 **"API"**
3. 复制以下两个值（稍后填入 `.env` 文件）：
   - **Project URL**：类似 `https://xxxxxxxx.supabase.co`
   - **service_role key**：以 `sb_secret_` 开头（⚠️ 此密钥仅后端使用，切勿提交到 Git）


## 步骤 3：创建数据库表结构

1. 左侧菜单点击 **"SQL Editor"**
2. 点击 **"New Query"**
3. 打开本项目的 `training-backend/supabase/schema.sql` 文件
4. 复制全部 SQL 代码，粘贴到 Supabase SQL Editor
5. 点击 **"Run"** 按钮执行
6. 这将创建 4 个表（users/templates/plans/purchases）和 RLS 安全策略


## 步骤 4：配置本地环境变量

在 `training-backend/` 目录下创建 `.env` 文件（从 `.env.example` 复制）：

```bash
cd training-backend
cp .env.example .env
```

编辑 `.env` 文件：

```env
# Supabase 项目 URL（从步骤 2 获取）
SUPABASE_URL=https://xxxxxxxx.supabase.co

# Supabase service_role 密钥（从步骤 2 获取）
# ⚠️ 此密钥仅用于后端服务器，不要暴露给前端
SUPABASE_SERVICE_KEY=sb_secret_xxxxxxxxxxxxxxxxxxxx

# 后端服务端口
PORT=4000

# JWT 签名密钥（用于签发登录 token，建议修改为随机字符串）
# 生成方式：node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=your-secret-key-change-this

# 允许的前端地址
# 开发环境：http://localhost:5173
# 生产环境：您的前端部署域名
CORS_ORIGIN=http://localhost:5174
```


## 步骤 5：启动后端服务

```bash
cd training-backend
npm run dev
```

启动成功后会看到：
```
[backend] listening on http://localhost:4000
[backend] supabase configured
```

对比之前的 `NOT configured (mock mode)`，现在显示 `configured` 表示已连接成功。


## 步骤 6：测试验证

### 启动前端
```bash
cd training-app
npm run dev
```

### 功能验证清单
- [ ] 用 A 用户登录，创建模板
- [ ] 退出登录，用 B 用户登录，确认看不到 A 的模板
- [ ] 再登录 A，确认自己的模板仍然存在（持久化验证）
- [ ] 重启后端服务后，数据仍然保留（持久化验证）


## 常见问题排查

### Q: 启动时显示 "supabase NOT configured"
A: 检查 `.env` 文件是否存在，`SUPABASE_URL` 和 `SUPABASE_SERVICE_KEY` 是否正确填写。

### Q: 登录成功但创建模板失败（403 权限错误）
A: 说明 RLS 策略生效了但上下文设置失败。请确认：
   1. `schema.sql` 中的 `set_user_id` 函数已创建
   2. 后端使用的是 `service_role key`（不是 anon key）

### Q: 数据仍然存在于 mock 模式（重启后不丢失）
A: 这是正常的！如果 Supabase 配置正确，后端会自动使用 Supabase；如果配置缺失则回退到 mock 模式。

### Q: 如何切换回 mock 模式（清空所有数据）
A: 暂时清空 `.env` 文件中的 `SUPABASE_URL` 和 `SUPABASE_SERVICE_KEY` 即可。


## 生产部署建议

### Vercel 部署后端（推荐）
1. 在 Supabase 的 Settings -> API 中获取生产凭证
2. 将后端代码推送到 GitHub
3. 在 Vercel 导入项目
4. 在 Vercel 的 Environment Variables 中配置所有 `.env` 变量
5. 部署完成后，将 CORS_ORIGIN 改为前端生产域名

### 腾讯云/阿里云部署
1. 使用 PM2 或 Docker 托管后端进程
2. Nginx 反向代理 4000 端口
3. HTTPS 证书（可用 Let's Encrypt 免费获取）


## 安全提示

- ⚠️ **永远不要** 将 `service_role key` 提交到 Git 仓库
- ⚠️ **永远不要** 在前端代码中使用 `service_role key`
- ✅ 前端仅使用 `anon public` key（本次实现中前端不直接连 Supabase，无需配置）
- ✅ 定期轮换 JWT_SECRET
