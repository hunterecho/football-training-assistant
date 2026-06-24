# 智能运动姿态检测与纠正系统

基于AI人体姿态估计与计算机视觉技术的轻量级运动辅助工具。

## 技术栈

### 前端
- React 18
- TypeScript
- TailwindCSS 3
- Redux Toolkit
- React Router 6

### 后端
- Node.js 18
- Express
- TypeScript
- MongoDB
- JWT
- Cloudinary (文件存储)
- Stripe (支付)

## 项目结构

```
├── backend/                 # 后端服务
│   ├── src/
│   │   ├── controllers/     # 控制器
│   │   ├── services/        # 业务服务
│   │   ├── models/          # 数据库模型
│   │   ├── routes/          # 路由定义
│   │   ├── middleware/      # 中间件
│   │   ├── config/          # 配置文件
│   │   ├── utils/           # 工具函数
│   │   └── server.ts        # 入口文件
│   ├── package.json
│   └── tsconfig.json
├── frontend/                # 前端应用
│   ├── src/
│   │   ├── components/      # 组件
│   │   ├── pages/           # 页面
│   │   ├── store/           # Redux状态管理
│   │   ├── api/             # API封装
│   │   ├── hooks/           # 自定义hooks
│   │   ├── types/           # TypeScript类型
│   │   ├── App.tsx          # 应用入口
│   │   └── main.tsx         # 渲染入口
│   ├── package.json
│   └── tsconfig.json
└── README.md
```

## 环境配置

### 后端配置

1. 进入后端目录：
```bash
cd backend
```

2. 安装依赖：
```bash
npm install
```

3. 配置环境变量（编辑 `.env` 文件）：
```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/pose-detection
JWT_SECRET=your-secret-key-here-change-in-production
JWT_EXPIRES_IN=24h
CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret
STRIPE_SECRET_KEY=your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=your-stripe-webhook-secret
```

### 前端配置

1. 进入前端目录：
```bash
cd frontend
```

2. 安装依赖：
```bash
npm install
```

## 运行项目

### 开发模式

1. 启动MongoDB数据库（确保已安装MongoDB）

2. 启动后端服务：
```bash
cd backend
npm run dev
```

3. 启动前端开发服务器：
```bash
cd frontend
npm start
```

### 生产模式

1. 构建前端：
```bash
cd frontend
npm run build
```

2. 构建后端：
```bash
cd backend
npm run build
npm start
```

## API接口

### 认证接口
- `POST /api/auth/verify-code` - 发送验证码
- `POST /api/auth/login` - 手机号验证码登录
- `GET /api/auth/me` - 获取当前用户

### 动作库接口
- `GET /api/libraries` - 获取动作库列表
- `GET /api/libraries/:id` - 获取动作库详情
- `PUT /api/libraries/:id` - 更新动作库
- `DELETE /api/libraries/:id` - 删除动作库

### 视频分析接口
- `POST /api/analysis/upload` - 上传视频并分析
- `GET /api/analysis/:id` - 获取分析报告
- `GET /api/analysis/user/list` - 获取用户分析历史

### 支付接口
- `POST /api/payment/create-intent` - 创建支付意向
- `GET /api/payment/history` - 获取支付历史

### 教练接口
- `POST /api/coach/apply` - 申请成为教练
- `POST /api/coach/libraries` - 创建动作库
- `GET /api/coach/libraries` - 获取教练动作库
- `GET /api/coach/stats` - 获取教练统计数据

### 管理后台接口
- `GET /api/admin/coaches` - 获取教练列表
- `POST /api/admin/coaches/:id/approve` - 审核教练
- `GET /api/admin/libraries` - 获取动作库列表
- `POST /api/admin/libraries/:id/approve` - 审核动作库
- `POST /api/admin/libraries/:id/reject` - 拒绝动作库
- `GET /api/admin/finance/report` - 获取财务报表

## 用户角色

1. **普通用户**：学习动作、纠正错误
2. **教练/导师**：创建动作库、获取收益
3. **运营管理员**：审核内容、管理平台

## 功能特性

### C端（用户端）
- 手机号验证码登录
- 公共免费动作库浏览
- 视频上传与AI分析
- 左右双屏对比播放
- 关节角度分析报告
- 对称性分析
- 异常检测与改善建议

### B端（教练端）
- 动作库创建工具
- 视频上传接口
- 容差阈值设定
- 商品定价配置
- 极简数据看板（销量、收益）

### 运营后台
- 教练资质审核
- 动作库审核管理
- 财务报表导出

## 商业模型

- **免费层**：官方公共动作库，降低体验门槛
- **单次解锁**：按次计费（3元~15元/个）
- **抽成比例**：平台30% : 教练70%
- **阶梯激励**：月销售额>5000元，平台抽成降至20%

## 开发说明

### 登录测试

由于验证码服务需要短信服务商支持，开发环境下验证码会打印到控制台。

1. 在登录页面输入手机号（如：13800138000）
2. 点击"获取验证码"
3. 在控制台找到打印的验证码（6位数字）
4. 输入验证码完成登录

### 测试账户

- **管理员账户**：设置 `role: 'admin'` 可访问管理后台
- **教练账户**：设置 `role: 'coach'` 可访问教练中心

## 许可证

MIT License
