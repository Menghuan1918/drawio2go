# DrawIO2Go - AI 代理开发指南

## 项目概述

基于 Electron + Next.js + HeroUI 构建的跨平台 DrawIO 编辑器应用。

### 核心技术栈

- **前端框架**: Next.js 15 (App Router) + React 19
- **UI 库**: HeroUI v3 (Beta) - 复合组件模式
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
│   ├── chat/                     # 聊天组件模块化架构（12个子组件）
│   └── settings/                 # 设置相关子组件
├── lib/                # 工具库 [详细文档 → app/lib/AGENTS.md]
│   ├── drawio-tools.ts          # DrawIO XML 操作工具集
│   ├── drawio-ai-tools.ts       # DrawIO AI 工具调用接口
│   ├── drawio-xml-service.ts    # DrawIO XML 转接层（XPath 查询）
│   ├── tool-executor.ts         # 工具执行路由器
│   ├── llm-config.ts            # LLM 配置工具（已废弃）
│   └── storage/                 # 统一存储抽象层
│       ├── adapter.ts           # 存储适配器抽象类
│       ├── indexeddb-storage.ts # IndexedDB 实现（Web）
│       ├── sqlite-storage.ts    # SQLite 实现（Electron）
│       ├── storage-factory.ts   # 存储实例工厂
│       └── types.ts             # 存储层类型定义
├── types/              # 类型定义 [详细文档 → app/types/AGENTS.md]
│   ├── chat.ts                  # 聊天相关类型
│   ├── drawio-tools.ts          # DrawIO 工具类型
│   ├── socket-protocol.ts       # Socket.IO 协议类型
│   └── global.d.ts              # 全局类型声明
├── hooks/              # React Hooks [详细文档 → app/hooks/AGENTS.md]
│   ├── useDrawioSocket.ts       # Socket.IO 通讯 Hook
│   ├── useStorageSettings.ts    # 设置持久化 Hook
│   ├── useStorageProjects.ts    # 项目管理 Hook
│   ├── useStorageConversations.ts   # 会话管理 Hook
│   └── useStorageXMLVersions.ts     # XML 版本管理 Hook
├── api/                # API 路由
│   ├── chat/                    # 聊天 API 路由
│   └── test/                    # 测试 API 路由
├── styles/             # 模块化样式系统
│   ├── base/                    # 基础样式（reset、变量）
│   ├── components/              # 组件样式
│   ├── layout/                  # 布局样式
│   ├── themes/                  # 主题样式
│   └── utilities/               # 工具样式
├── page.tsx            # 主页面
├── layout.tsx          # 根布局
└── globals.css         # 全局样式入口

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

### 3. 统一存储架构

- **存储抽象层**: `app/lib/storage/` - 适配器模式统一存储接口
- **自动适配**:
  - **Electron**: SQLite 数据库（通过 better-sqlite3）
  - **Web**: IndexedDB（通过 idb）
- **存储表结构**:
  - `Projects`: 项目元数据（uuid, name, description）
  - `XMLVersions`: XML 版本管理（项目关联，语义化版本）
  - `Conversations`: 聊天会话（标题、消息、时间戳）
  - `Settings`: 应用设置（LLM 配置、默认路径、侧边栏宽度等）
- **React Hooks**: 封装统一存储访问（useStorageSettings、useStorageProjects 等）
- **保存策略**: 自动保存到统一存储层，手动导出到文件系统

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

## 开发命令

使用pnpm作为包管理系统

```bash
pnpm run dev              # Socket.IO + Next.js 开发服务器 (http://localhost:3000)
pnpm run electron:dev     # Electron + Socket.IO + Next.js 开发模式
pnpm run build            # 构建 Next.js 应用
pnpm run start            # 生产环境启动 (Socket.IO + Next.js)
pnpm run electron:build   # 构建 Electron 应用 (输出到 dist/)
pnpm lint                 # ESLint 检查 + TypeScript 类型检查
pnpm format               # 使用 Prettier 格式化所有代码
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

| 模块            | 路径                       | 主要内容                              |
| --------------- | -------------------------- | ------------------------------------- |
| **React 组件**  | `app/components/AGENTS.md` | 所有 UI 组件的详细 API 和使用规范     |
| **React Hooks** | `app/hooks/AGENTS.md`      | 统一存储 Hooks 与 Socket.IO 通讯 Hook |
| **XML 工具集**  | `app/lib/AGENTS.md`        | DrawIO XML 操作、存储层架构完整文档   |
| **类型定义**    | `app/types/AGENTS.md`      | TypeScript 类型的完整说明             |
| **桌面应用**    | `electron/AGENTS.md`       | Electron 配置、安全策略和调试指南     |

## 最近更新

### 2025-11 统一存储架构重构

- **适配器模式**: 抽象存储接口，自动适配 SQLite（Electron）和 IndexedDB（Web）
- **核心文件**:
  - `app/lib/storage/adapter.ts` - 存储适配器抽象类
  - `app/lib/storage/sqlite-storage.ts` - SQLite 实现
  - `app/lib/storage/indexeddb-storage.ts` - IndexedDB 实现
  - `app/lib/storage/storage-factory.ts` - 存储工厂（运行时检测环境）
- **统一 Hooks**: `useStorageSettings`、`useStorageProjects`、`useStorageConversations`、`useStorageXMLVersions`
- **表结构**: Projects、XMLVersions、Conversations、Settings
- **迁移策略**: 从 localStorage 迁移到统一存储层，保持向后兼容

### 2025-11 Socket.IO 工具调用架构

- **通讯机制**: Socket.IO 双向通讯，后端同步等待前端执行结果
- **执行流程**: AI 调用工具 → Socket.IO 转发到前端 → 前端执行 → 返回结果给 AI
- **核心文件**:
  - `server.js` - Socket.IO 服务器
  - `app/lib/tool-executor.ts` - 工具路由
  - `app/hooks/useDrawioSocket.ts` - 前端 Hook

### 2025-11 底部选区状态显示

- **Electron**: 主进程向 DrawIO iframe 注入监听器，实时通过 postMessage 回传选中对象数量，底部工具栏在 GitHub 按钮右侧展示为 `选中了X个对象`
- **Web**: 受浏览器沙箱限制，底部状态文案显示 `网页无法使用该功能`
- **相关文件**:
  - `electron/main.js`、`electron/preload.js` - 注入与 IPC 通道
  - `app/components/DrawioEditorNative.tsx` - 处理选区消息
  - `app/components/BottomBar.tsx` - 显示状态文案
  - `app/page.tsx` - 组合状态数据

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

_最后更新: 2025-11-07_
