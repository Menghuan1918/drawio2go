# DrawIO2Go - AI 代理开发指南

重要的事情说三遍：
!重要：目前项目还未上线，处于内部开发阶段，不需要考虑兼容旧代码，直接执行破坏性更新
!重要：目前项目还未上线，处于内部开发阶段，不需要考虑兼容旧代码，直接执行破坏性更新
!重要：目前项目还未上线，处于内部开发阶段，不需要考虑兼容旧代码，直接执行破坏性更新

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

### 设计系统规范

> 详细文档请参考 `app/styles/AGENTS.md`

**设计令牌（Design Tokens）**:

- **圆角**: 4px (小) / 8px (标准) / 12px (大)
- **间距**: 4px 基准（4/8/16/24/32px）
- **阴影**: Material Design 4 层阴影系统
- **动画**: 150ms (快) / 200ms (标准) / 300ms (慢)

**核心原则**:

- ✅ 使用 CSS 变量 (`var(--radius)`, `var(--shadow-2)`)
- ✅ 扁平化设计，避免渐变和复杂效果
- ✅ 简单交互反馈，避免干扰性动画（脉冲、浮动）
- ❌ 禁止硬编码颜色、尺寸和阴影值

### 项目结构

```
app/
├── components/         # React 组件库 [详细文档 → app/components/AGENTS.md]
│   ├── DrawioEditorNative.tsx    # DrawIO 编辑器（原生 iframe + PostMessage）
│   ├── TopBar.tsx                # 顶栏组件
│   ├── UnifiedSidebar.tsx        # 统一侧边栏容器
│   ├── SettingsSidebar.tsx       # 设置侧边栏
│   ├── ChatSidebar.tsx           # 聊天侧边栏主组件（@ai-sdk/react）
│   ├── VersionSidebar.tsx        # 版本侧边栏主组件
│   ├── chat/                     # 聊天组件模块化架构（12个子组件）
│   ├── settings/                 # 设置相关子组件
│   └── version/                  # 版本管理子组件
│       ├── WIPIndicator.tsx      # WIP 工作区指示器
│       ├── VersionCard.tsx       # 版本卡片（折叠式）
│       ├── VersionTimeline.tsx   # 版本时间线
│       └── CreateVersionDialog.tsx # 创建版本对话框
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
├── styles/             # 模块化样式系统 [详细文档 → app/styles/AGENTS.md]
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

| 模块            | 路径                       | 主要内容                                 |
| --------------- | -------------------------- | ---------------------------------------- |
| **React 组件**  | `app/components/AGENTS.md` | 所有 UI 组件的详细 API 和使用规范        |
| **React Hooks** | `app/hooks/AGENTS.md`      | 统一存储 Hooks 与 Socket.IO 通讯 Hook    |
| **样式系统**    | `app/styles/AGENTS.md`     | 设计令牌、Material Design 规范、最佳实践 |
| **XML 工具集**  | `app/lib/AGENTS.md`        | DrawIO XML 操作、存储层架构完整文档      |
| **类型定义**    | `app/types/AGENTS.md`      | TypeScript 类型的完整说明                |
| **桌面应用**    | `electron/AGENTS.md`       | Electron 配置、安全策略和调试指南        |

## 最近更新

### 2025-11-16 WIP 草稿独立存储强化

- **草稿隔离**：WIP (0.0.0) 永远视为关键帧，不会被纳入关键帧 + Diff 链路，也不会作为计算 Diff 的源版本。
- **时间戳刷新**：每次自动保存或 AI 工具写入 WIP 时都会刷新 `created_at`，确保侧栏的最后更新时间可实时反映当前草稿。
- **AI 工具对齐**：`drawio-tools.ts` 的保存/替换 API 直接写入 WIP 草稿，不再生成额外的 `latest` 版本号，行为与统一存储 Hook 保持一致。
- **跨端一致性**：IndexedDB/Electron (SQLite) 均支持更新 WIP 的 `created_at`，Electron 端补齐了 `updateXMLVersion` IPC 能力。

### 2025-11-14 HeroUI 复杂组件迁移

- **HeroUI Alert**：聊天输入区的 `ErrorBanner` 改为 HeroUI `Alert` 复合组件，移除自定义 `.error-banner` 样式并提供刷新按钮操作。
- **Skeleton 占位**：ProjectSelector、MessageList、Version Timeline/WIP 等加载态统一接入 HeroUI `Skeleton`，避免再显示纯文字的 loading EmptyState。
- **统一侧栏 Tabs**：`UnifiedSidebar` 切换至 HeroUI `Tabs` 结构，`sidebar-tabs` 自定义样式删除，新增 `sidebar-tab-strip/sidebar-tab-item` 等类来适配 HeroUI 复合组件。
- **版本侧边栏体验**：版本时间线在加载阶段展示骨架屏，卡片列表与 Header 样式保持一致。
- **相关文件**：
  - `app/components/chat/ErrorBanner.tsx`, `app/components/chat/MessageList.tsx`
  - `app/components/ProjectSelector.tsx`, `app/components/UnifiedSidebar.tsx`
  - `app/components/VersionSidebar.tsx`, `app/components/version/VersionTimeline.tsx`
  - `app/styles/layout/sidebar.css`, `app/styles/components/version-timeline.css`, `app/styles/utilities/components.css`
  - `.claude/task/v0.2/heroui/milestone-4-complex-components.md`

### 2025-11-13 顶栏与侧栏交互重构

- **顶栏统一操作区**:
  - 选区指示器移至最左侧，实时展示对象数量
  - 工程切换按钮置于中间并支持全宽点击区域
  - 加载/保存按钮靠右，新增图标按钮可一键收起/展开侧栏
- **统一侧栏多 Tab 化**:
  - 聊天/设置/版本切换采用紧凑 Tab，固定在侧栏顶部（2025-11-14 起基于 HeroUI `Tabs` 实现）
  - 侧栏宽度记忆与拖拽逻辑保持不变，可在 Tabs 间即时切换
- **布局同步**:
  - 左侧工作区在侧栏展开时自动预留宽度，顶栏与编辑器对齐
  - 相关样式已迁移到 `top-bar` 与新版 `sidebar-tab-*` 类，移除底栏布局
- **相关文件**:
  - `app/components/TopBar.tsx`
  - `app/components/UnifiedSidebar.tsx`
  - `app/page.tsx`
  - `app/styles/layout/container.css`, `app/styles/layout/sidebar.css`

### 2025-11-13 版本管理 UI 现代化外观升级

- **版本侧边栏现代化**:
  - 新增信息描述区：History 图标 + 标题 + 副标题说明
  - 空状态卡片优化：History 图标 + 引导文案
  - 悬浮 CTA 按钮：Save 图标 + "保存版本" 主色按钮
  - 顶部 Header 采用信息区 + 操作按钮分栏布局
- **WIP 指示器卡片式升级**:
  - 卡片式信息区：Activity 图标 + WIP 徽章 + 版本号
  - 元数据行：实时保存状态 + 最后更新时间
  - 三段式布局：`wip-indicator__body/top/meta` 结构
- **历史版本时间线优化**:
  - 主轴 + 节点视觉：CSS `::before` 绘制时间线
  - 紧凑折叠卡片：默认折叠显示版本号+徽章+时间
  - 版本卡片分栏：操作按钮右上排列，底部元信息展示
  - Disclosure 折叠组件：点击展开查看完整信息
- **文本语义化变量**:
  - 新增 `--text-primary/secondary/tertiary` 颜色变量
  - 统一全局文本色彩引用规范
- **相关文件**:
  - `app/components/VersionSidebar.tsx` - 版本侧边栏主组件
  - `app/components/version/WIPIndicator.tsx` - WIP 指示器
  - `app/components/version/VersionCard.tsx` - 版本卡片
  - `app/components/version/VersionTimeline.tsx` - 版本时间线
  - `app/styles/components/version-*.css` - 版本管理样式

### 2025-11-12 版本管理 UI Material Design 优化

- **设计系统规范化**:
  - 统一圆角至 4px/8px/12px 三档标准
  - 建立 Material Design 标准阴影层级（4层：1/2/4/8）
  - 添加标准间距系统（4px 基准）
  - 修正动画变量命名（duration 替代错误的 transition-slow）
- **版本组件优化**:
  - 移除干扰性动画（脉冲、浮动、上移效果）
  - 统一徽章样式规范（Latest/关键帧/差异）
  - 扁平化背景设计，去除渐变效果
  - 对话框使用 Material Design 标准背景模糊（4px）
- **样式系统文档**:
  - 创建 `app/styles/AGENTS.md` 完整设计系统文档
  - 记录所有设计令牌、使用场景和最佳实践
  - 包含 Tailwind CSS v4 + HeroUI v3 集成指南
- **相关文件**:
  - `app/styles/base/variables.css` - 核心设计令牌
  - `app/styles/components/version-*.css` - 版本管理组件样式

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

### 2025-11 顶栏选区状态显示

- **Electron**: 主进程向 DrawIO iframe 注入监听器，实时通过 postMessage 回传选中对象数量，顶栏左侧状态区域展示为 `选中了X个对象`
- **Web**: 受浏览器沙箱限制，顶栏状态文案显示 `网页无法使用该功能`
- **相关文件**:
  - `electron/main.js`、`electron/preload.js` - 注入与 IPC 通道
  - `app/components/DrawioEditorNative.tsx` - 处理选区消息
  - `app/components/TopBar.tsx` - 显示状态文案
  - `app/page.tsx` - 组合状态数据

### 2025-11 聊天组件模块化架构

- 将大型 `ChatSidebar.tsx` 重构为 12 个独立组件
- 统一导出通过 `app/components/chat/index.ts`
- 职责单一，便于测试和维护

### 2025-11 聊天界面与模型标记

- 聊天消息新增模型信息：`messages` 表增加 `model_name` 字段，Web IndexedDB 版本固定为 2（需要手动清空旧数据），SQLite 直接假设新结构（无自动迁移）
- `ChatSidebar` 在消息层面写入 `model_name` 元数据，确保用户消息与 AI 回复都能追溯到当时的模型
- AI 回复区域改为全宽布局，无底色覆盖整个侧边栏；用户消息仍保持气泡样式
- 新增左上角信息条（Lucide 图标 + 模型名 + 时间戳），与工具调用卡片共用全宽布局

### 2025-11 版本控制重构

- `xml_versions` 表主键从自增 ID 改为 UUID，`source_version_id` 同步使用 UUID
- 引入关键帧 + Diff 混合存储：`diff-match-patch` 字符串保存差异，差异率 >70% 或链长 >10 自动刷新关键帧
- `metadata` JSON 预留字段已加入（当前写入 `null`，供后续扩展）
- 首版本统一使用 `00000000-0000-0000-0000-000000000000` 作为父版本标记

### 2025-11 OpenAI Compatible 支持

- 支持 OpenAI Reasoning 模型（o1/o3）
- 支持通用 OpenAI 兼容服务（LM Studio、本地模型等）
- 支持 DeepSeek API

## 项目仓库

**GitHub**: https://github.com/Menghuan1918/drawio2go

---

_最后更新: 2025-11-14_
