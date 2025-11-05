# DrawIO2Go - AI 代理开发指南

## 项目概述

基于 Electron + Next.js + HeroUI 构建的跨平台 DrawIO 编辑器应用。

### 核心技术栈
- **前端框架**: Next.js 15 (App Router) + React 19
- **UI 库**: HeroUI v3 (Alpha) - 复合组件模式
- **样式**: Tailwind CSS v4 (⚠️ 必须 v4，v3 不兼容)
- **DrawIO 集成**: 原生 iframe 实现
- **桌面应用**: Electron 38.x
- **语言**: TypeScript
- **主题**: 现代扁平化设计，Material Design风格 (#3388BB 蓝色主题)

### 项目结构
```
app/
├── components/         # React 组件库 [详细文档 → app/components/AGENTS.md]
│   ├── DrawioEditorNative.tsx    # DrawIO 编辑器（原生 iframe + PostMessage）
│   ├── BottomBar.tsx             # 底部工具栏
│   ├── UnifiedSidebar.tsx        # 统一侧边栏容器
│   ├── SettingsSidebar.tsx       # 设置侧边栏
│   ├── ChatSidebar.tsx           # 聊天侧边栏主组件（@ai-sdk/react）
│   └── chat/                     # 聊天组件模块化架构（12个子组件）
├── lib/                # 工具库 [详细文档 → app/lib/AGENTS.md]
│   ├── drawio-tools.ts          # DrawIO XML 操作工具集
│   ├── drawio-ai-tools.ts       # DrawIO AI 工具调用接口
│   └── tool-executor.ts         # 工具执行路由器
├── types/              # 类型定义 [详细文档 → app/types/AGENTS.md]
├── hooks/              # React Hooks
├── api/chat/           # 聊天 API 路由
├── page.tsx            # 主页面
└── globals.css         # 全局样式

electron/               # 桌面应用 [详细文档 → electron/AGENTS.md]
server.js              # Socket.IO 服务器 + Next.js 集成
```

## 开发准则

### 1. HeroUI v3 使用规范
- **复合组件**: 使用 `Card.Root`, `Card.Header`, `Card.Content` 等
- **事件处理**: 使用 `onPress` 代替 `onClick`
- **客户端指令**: 带交互的组件必须添加 `"use client"`
- **无 Provider**: HeroUI v3 不需要全局 Provider 包裹

### 2. Tailwind CSS v4 配置
- ⚠️ 必须使用 v4 版本（v3 不兼容）
- `globals.css` 使用 `@import "tailwindcss"`
- PostCSS 配置使用 `@tailwindcss/postcss`

### 3. 状态持久化
- **localStorage**: `currentDiagram`, `defaultPath`, `sidebarWidth`
- **React State**: 组件内临时状态
- **保存策略**: 自动保存到 localStorage，手动保存到文件系统

### 4. 包开发信息获取
- **首选 context7**: 获取任何第三方包的开发信息时，必须优先使用 `context7` MCP 工具
- **工作流程**: 先调用 `resolve-library-id` 获取包ID，再调用 `get-library-docs` 获取最新文档
- **适用场景**: 新增包、使用包的API、版本升级、遇到兼容性问题时

### 5. Socket.IO 工具调用架构
- **DrawIO 工具**: 通过 Socket.IO 转发到前端执行（需要浏览器环境）
- **其他工具**: 可直接在后端执行（未来扩展接口）
- **执行流程**:
  1. AI 调用工具 → `drawio-ai-tools.ts` 的 `execute` 函数
  2. `executeToolOnClient` 生成 requestId，通过 Socket.IO 发送到前端
  3. 前端 `useDrawioSocket` Hook 接收请求，执行实际操作
  4. 前端通过 Socket.IO 返回结果
  5. 后端 Promise resolve，返回结果给 AI
- **超时机制**: 默认 30 秒，可配置
- **错误处理**: 前端执行失败会返回详细错误信息给 AI

### 6. 检查测试
- 主动调用`pnpm lint`获得语法错误检查信息，避免在编译时才处理语法错误
- 完成相关任务后，使用`web-function-tester`子代理进行页面功能测试

## 开发命令

使用pnpm作为包管理系统

```bash
pnpm run dev              # Socket.IO + Next.js 开发服务器 (http://localhost:3000)
pnpm run electron:dev     # Electron + Socket.IO + Next.js 开发模式
pnpm run build            # 构建 Next.js 应用
pnpm run start            # 生产环境启动 (Socket.IO + Next.js)
pnpm run electron:build   # 构建 Electron 应用 (输出到 dist/)
```

⚠️ **重要**: 不能使用 `next dev` 命令，必须使用 `pnpm run dev` 启动自定义服务器（包含 Socket.IO）

## 常见问题

### HeroUI v3 相关
- v3 仍在 alpha 阶段，警告正常
- 使用 `context7` MCP 工具查询最新 API
- 需要 React 19+ 和 Tailwind CSS v4

### Electron 问题
- DrawIO 不显示？详见 `electron/AGENTS.md`

## 子包文档导航

| 模块 | 路径 | 主要内容 |
|------|------|----------|
| **React 组件** | `app/components/AGENTS.md` | 所有 UI 组件的详细 API 和使用规范 |
| **XML 工具集** | `app/lib/AGENTS.md` | DrawIO XML 操作的完整工具文档 |
| **类型定义** | `app/types/AGENTS.md` | TypeScript 类型的完整说明 |
| **桌面应用** | `electron/AGENTS.md` | Electron 配置、安全策略和调试指南 |

## 最近更新

### 2025-11 Socket.IO 工具调用架构
- **通讯机制**: Socket.IO 双向通讯，后端同步等待前端执行结果
- **执行流程**: AI 调用工具 → Socket.IO 转发到前端 → 前端执行 → 返回结果给 AI
- **核心文件**:
  - `server.js` - Socket.IO 服务器
  - `app/lib/tool-executor.ts` - 工具路由
  - `app/hooks/useDrawioSocket.ts` - 前端 Hook

### 2025-11 聊天组件模块化架构
- 将大型 `ChatSidebar.tsx` 重构为 12 个独立组件
- 统一导出通过 `app/components/chat/index.ts`
- 职责单一，便于测试和维护

### 2025-11 OpenAI Compatible 支持
- 支持 OpenAI Reasoning 模型（o1/o3）
- 支持通用 OpenAI 兼容服务（LM Studio、本地模型等）
- 支持 DeepSeek API

## 项目仓库

**GitHub**: https://github.com/Menghuan1918/drawio2go

---

*最后更新: 2025-11-04*
