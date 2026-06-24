# 足球集训助手 - 云端部署指南

## 部署架构

```
┌─────────────────────────────────────────────────────────────┐
│              前端 (GitHub Pages / Vercel)                   │
│  https://username.github.io/football-training-assistant    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    后端 (Render)                             │
│  https://your-render-domain.onrender.com/api               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   数据库 (Supabase)                          │
│  PostgreSQL + Auth + Storage                                │
└─────────────────────────────────────────────────────────────┘
```

## 免费方案选择

| 服务 | 平台 | 免费额度 | 适用场景 |
|------|------|----------|----------|
| 前端托管 | GitHub Pages | 不限带宽，自动HTTPS | 静态网站（推荐） |
| 前端托管 | Vercel | 不限带宽，自动HTTPS | 静态网站 |
| 后端API | Render | 750小时/月，自动HTTPS | Node.js服务 |
| 数据库 | Supabase | 500MB存储，自动备份 | PostgreSQL |

---

## 步骤1：配置Supabase数据库

### 1.1 创建Supabase项目
1. 访问 [Supabase官网](https://supabase.com/) 并注册账号
2. 创建新项目（Project Name任意，Region选择亚洲节点）
3. 等待项目初始化完成（约2分钟）

### 1.2 执行数据库Schema
1. 进入项目后，点击左侧菜单 **SQL Editor**
2. 点击 **New query**
3. 复制 `training-backend/supabase/schema.sql` 的内容粘贴到编辑器
4. 点击 **Run** 执行

### 1.3 获取API凭证
1. 点击左侧菜单 **Settings** -> **API**
2. 记录以下信息：
   - `Project URL`: 在 **Project URL** 字段
   - `service_role key`: 在 **Project API keys** -> **service_role**（保密！）

---

## 步骤2：部署后端到Render

### 2.1 创建Render服务
1. 访问 [Render官网](https://render.com/) 并注册账号
2. 点击 **New** -> **Web Service**
3. 选择 **Build and deploy from a Git repository**
4. 输入你的GitHub仓库地址（确保包含 `training-backend` 目录）

### 2.2 配置构建设置
- **Environment**: Node
- **Build Command**: `cd training-backend && npm install && npm run build`
- **Start Command**: `cd training-backend && npm start`
- **Plan**: Free

### 2.3 设置环境变量
在 **Environment Variables** 中添加：

| 变量名 | 值 |
|--------|----|
| `SUPABASE_URL` | 你的Supabase Project URL |
| `SUPABASE_SERVICE_KEY` | 你的Supabase service_role key |
| `JWT_SECRET` | 随机生成的字符串（用于签名JWT） |
| `CORS_ORIGIN` | 你的Vercel域名（如 `https://your-app.vercel.app`） |
| `PORT` | `10000` |

### 2.4 部署
点击 **Create Web Service** 开始部署，等待完成后记录后端URL（如 `https://your-service.onrender.com`）

---

## 步骤3：部署前端到GitHub Pages（推荐）

### 3.1 配置GitHub仓库设置
1. 访问你的GitHub仓库页面
2. 点击 **Settings** -> **Pages**
3. 在 **Build and deployment** 部分：
   - **Source**: `Deploy from a branch`
   - **Branch**: `gh-pages` / `root`
   - 点击 **Save**

### 3.2 更新部署脚本
编辑 `training-app/package.json`，将 `VITE_API_URL` 替换为你的Render后端URL：

```json
{
  "scripts": {
    "deploy:gh-pages": "VITE_DEPLOY_TARGET=gh-pages VITE_API_URL=https://your-service.onrender.com npm run build && npx --yes gh-pages -d dist"
  }
}
```

### 3.3 部署到GitHub Pages
在本地终端执行：

```bash
cd training-app
npm run deploy:gh-pages
```

### 3.4 验证部署
访问 `https://your-username.github.io/football-training-assistant`

---

## 步骤3（备选）：部署前端到Vercel

如果你可以访问Vercel，可以使用此方案：

### 3.1 创建Vercel项目
1. 访问 [Vercel官网](https://vercel.com/) 并注册账号
2. 点击 **Add New** -> **Project**
3. 选择你的GitHub仓库

### 3.2 配置项目设置
- **Framework**: React
- **Root Directory**: `training-app`
- **Build Command**: `npm run build`

### 3.3 设置环境变量
在 **Environment Variables** 中添加：

| 变量名 | 值 |
|--------|----|
| `VITE_API_URL` | 你的Render后端URL（如 `https://your-service.onrender.com`） |

### 3.4 更新vercel.json
编辑 `training-app/vercel.json`，将API代理指向你的后端：

```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "https://your-service.onrender.com/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### 3.5 部署
点击 **Deploy** 完成部署

---

## 步骤4：验证部署

### 4.1 测试API健康检查
访问 `https://your-service.onrender.com/api/health`，应返回：
```json
{ "ok": true, "supabase": true, "time": "..." }
```

### 4.2 测试前端
访问你的Vercel域名，应该能看到登录页面

---

## 开发环境配置

### 本地运行后端
```bash
cd training-backend
npm install
npm run dev
```

### 本地运行前端
```bash
cd training-app
npm install
cp .env.example .env.local
# 编辑 .env.local 设置 VITE_API_URL=http://localhost:4000
npm run dev
```

---

## 环境变量汇总

### 后端环境变量 (Render)
| 变量 | 说明 |
|------|------|
| `SUPABASE_URL` | Supabase项目URL |
| `SUPABASE_SERVICE_KEY` | Supabase服务密钥 |
| `JWT_SECRET` | JWT签名密钥 |
| `CORS_ORIGIN` | 允许的前端域名 |
| `PORT` | 服务端口（Render固定为10000） |

### 前端环境变量 (Vercel)
| 变量 | 说明 |
|------|------|
| `VITE_API_URL` | 后端API地址 |

---

## 常见问题

### Q: Render免费版服务会休眠吗？
A: 是的，免费版服务在15分钟无请求后会休眠，首次请求可能需要5-10秒唤醒。

### Q: 如何生成安全的JWT_SECRET？
A: 在终端执行：
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Q: 前端部署后API请求失败？
A: 检查：
1. Vercel的环境变量 `VITE_API_URL` 是否正确
2. Render后端是否正常运行
3. CORS_ORIGIN是否包含前端域名

### Q: Supabase连接失败？
A: 检查：
1. `SUPABASE_URL` 和 `SUPABASE_SERVICE_KEY` 是否正确
2. 确保Supabase项目已完成初始化
3. 检查网络防火墙设置

---

## 项目结构

```
Gogogo/
├── training-app/          # 前端应用 (React + TypeScript)
│   ├── src/
│   ├── public/
│   ├── vercel.json        # Vercel配置
│   └── package.json
├── training-backend/      # 后端服务 (Node + Express)
│   ├── src/
│   ├── supabase/
│   │   └── schema.sql     # 数据库Schema
│   ├── render.yaml        # Render配置
│   └── package.json
└── DEPLOYMENT_GUIDE.md    # 部署指南
```
