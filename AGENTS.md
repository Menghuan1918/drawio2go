# DrawIO2Go - AI 代理开发指南

## 项目概述

基于 Electron + Next.js + HeroUI 构建的跨平台 DrawIO 编辑器应用。

### 核心技术栈

- **前端框架**: Next.js 15 (App Router) + React 19
- **UI 库**: HeroUI v3 (v3.0.0-beta.1) - 基于 React Aria Components 的复合组件模式
- **样式**: Tailwind CSS v4 (⚠️ 必须 v4，v3 不兼容)
- **AI 集成**: AI SDK v6 (Vercel AI SDK)
- **DrawIO 集成**: 原生 iframe 实现
- **桌面应用**: Electron 38.x
- **语言**: TypeScript
- **主题**: 现代扁平化设计，Material Design风格 (#3388BB 蓝色主题)

### HeroUI v3 核心特性

- **语义化设计**: 使用 primary/secondary/tertiary 替代 solid/flat/bordered
- **可访问性优先**: 基于 React Aria Components，内置 WCAG 2.1 AA 合规性
- **复合组件模式**: 灵活组合、深度自定义，而非扁平化 props
- **GPU 加速动画**: 原生 CSS 动画替代 Framer Motion，性能更优
- **树摇优化**: 仅打包使用的组件，减小包体积
- **AI 友好**: 为 AI 辅助开发设计的 API 和文档结构
- **完全类型安全**: TypeScript 全覆盖，IntelliSense 支持

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
│   ├── TopBar.tsx                # 顶栏组件（含国际化）
│   ├── UnifiedSidebar.tsx        # 统一侧边栏容器
│   ├── SettingsSidebar.tsx       # 设置侧边栏
│   ├── ChatSidebar.tsx           # 聊天侧边栏主组件（AI SDK v6）
│   ├── VersionSidebar.tsx        # 版本侧边栏主组件
│   ├── chat/                     # 聊天组件模块化架构（17个子组件）
│   │   ├── Composer.tsx          # 输入区域（含 Skill 按钮、页面选择器）
│   │   └── AGENTS.md             # 聊天模块详细文档
│   ├── settings/                 # 设置相关子组件（含国际化）
│   │   └── AGENTS.md             # 设置模块详细文档
│   ├── toast/                    # Toast 通知组件系统
│   │   └── AGENTS.md             # Toast 模块详细文档
│   ├── version/                  # 版本管理子组件
│   │   ├── AGENTS.md             # 版本模块详细文档
│   │   ├── VersionCard.tsx       # 版本卡片（折叠式）
│   │   ├── VersionTimeline.tsx   # 版本时间线
│   │   ├── VersionCompare.tsx    # 版本对比全屏弹层
│   │   ├── CreateVersionDialog.tsx # 创建版本对话框
│   │   ├── PageSVGViewer.tsx     # 多页 SVG 查看器
│   │   └── diff-engine/          # 差异计算引擎模块
│   └── AGENTS.md                 # 组件库完整文档
├── i18n/               # 国际化配置 [详细文档 → app/i18n/AGENTS.md]
│   ├── config.ts                 # i18n 配置文件
│   ├── client.ts                 # i18next 初始化（动态加载 JSON）
│   └── hooks.ts                  # 类型安全 i18n Hooks
├── lib/                # 工具库 [详细文档 → app/lib/AGENTS.md]
│   ├── drawio-tools.ts          # DrawIO XML 操作工具集
│   ├── drawio-xml-utils.ts      # DrawIO XML 归一化与解压工具
│   ├── frontend-tools.ts        # 前端工具执行（DrawIO read/edit_batch，顺序执行）
│   ├── svg-export-utils.ts      # 多页面 SVG 导出工具
│   ├── svg-smart-diff.ts        # SVG 智能差异对比引擎
│   ├── config-utils.ts          # LLM 配置规范化工具（含 Skill 配置）
│   ├── compression-utils.ts     # 压缩/解压工具（pako）
│   ├── version-utils.ts         # 版本号解析与排序工具
│   ├── utils.ts                 # 通用工具函数
│   ├── storage/                 # 统一存储抽象层 [详细文档 → app/lib/storage/AGENTS.md]
│   │   ├── adapter.ts           # 存储适配器抽象类
│   │   ├── indexeddb-storage.ts # IndexedDB 实现（Web）
│   │   ├── sqlite-storage.ts    # SQLite 实现（Electron）
│   │   ├── storage-factory.ts   # 存储实例工厂
│   │   ├── current-project.ts   # 当前工程 ID 持久化工具
│   │   ├── xml-version-engine.ts # XML 版本恢复引擎（Diff 重放）
│   │   ├── page-metadata.ts     # 页面元数据提取工具
│   │   ├── page-metadata-validators.ts # 元数据校验（页面数、SVG 体积等）
│   │   ├── constants.ts         # 常量定义（WIP_VERSION 等）
│   │   ├── constants-shared.js  # 跨环境共享常量
│   │   ├── default-diagram-xml.js # 默认空白图表 XML
│   │   ├── types.ts             # 存储层类型定义
│   │   ├── AGENTS.md            # 存储层详细文档
│   │   └── index.ts             # 统一导出
│   └── AGENTS.md                 # 工具库完整文档
├── types/              # 类型定义 [详细文档 → app/types/AGENTS.md]
│   ├── chat.ts                  # 聊天相关类型
│   ├── drawio-tools.ts          # DrawIO 工具类型
│   ├── socket.ts                # 工具调用基础类型（与传输层解耦）
│   └── global.d.ts              # 全局类型声明
├── hooks/              # React Hooks [详细文档 → app/hooks/AGENTS.md]
│   ├── useStorageSettings.ts    # 设置持久化 Hook
│   ├── useStorageProjects.ts    # 项目管理 Hook
│   ├── useCurrentProject.ts     # 当前工程管理 Hook（超时保护 + 自动兜底）
│   ├── useStorageConversations.ts   # 会话管理 Hook
│   ├── useStorageXMLVersions.ts     # XML 版本管理 Hook
│   ├── useVersionCompare.ts     # 版本对比状态管理 Hook
│   └── useDrawioEditor.ts       # DrawIO 编辑器操作封装 Hook
├── api/                # API 路由
│   ├── ai-proxy/                # 纯 AI 代理端点（仅转发，不含业务逻辑）
│   ├── health/                  # 健康检查（在线心跳）
│   └── test/                    # 测试 API 路由
├── config/              # 配置文件
│   └── skill-elements.json      # 绘图技能配置（主题、知识库元素）
├── styles/             # 模块化样式系统 [详细文档 → app/styles/AGENTS.md]
│   ├── base/                    # 基础样式（reset、变量）
│   ├── components/              # 组件样式
│   ├── layout/                  # 布局样式
│   ├── themes/                  # 主题样式
│   └── utilities/               # 工具样式
├── page.tsx            # 主页面
├── layout.tsx          # 根布局（含国际化初始化）
└── globals.css         # 全局样式入口

public/
└── locales/            # 翻译资源（en-US, zh-CN，按需扩展 ja-JP）

electron/               # 桌面应用 [详细文档 → electron/AGENTS.md]
server.js              # Next.js 自定义 HTTP 服务器
```

## 开发准则

### 1. HeroUI v3 使用规范

#### 设计原则（10条核心原则）

1. **语义化意图优于视觉样式**: 使用 primary/secondary/tertiary 表达层级，而非 solid/flat/bordered 描述外观
2. **可访问性为基础**: 基于 React Aria Components，内置 WCAG 2.1 AA 合规性
3. **组合优于配置**: 复合组件允许重排、自定义或省略部分，而非扁平化 props
4. **渐进式披露**: 从简单开始，仅在需要时添加复杂性
5. **可预测行为**: 所有组件遵循一致的模式（size、variant、className、data 属性）
6. **类型安全优先**: 完整的 TypeScript 支持，IntelliSense 和编译时错误检测
7. **样式与逻辑分离**: `@heroui/styles` 可独立用于任何框架或纯 HTML
8. **卓越的开发者体验**: 清晰的 API、描述性错误、AI 友好的文档
9. **完全可自定义**: 开箱即用的美观默认样式，可通过 CSS 变量或 BEM 类完全改造
10. **开放且可扩展**: 使用 `asChild`、variant 函数或自定义包装器扩展组件

#### 复合组件模式（Composition Over Configuration）

- ✅ **使用复合组件**: `Card.Root`, `Card.Header`, `Card.Content` 等
- ✅ **命名导出**: 也可使用命名导出如 `<Card><CardHeader /></Card>`
- ❌ **避免扁平 props**: 不使用 `<Card title="..." />` 等 v2 风格

#### 语义化变量（Semantic Intent Over Visual Style）

- ✅ **语义化变量**: `variant="primary"` / `"secondary"` / `"tertiary"` / `"danger"`
- ❌ **避免视觉描述**: 不使用 `"solid"` / `"flat"` / `"bordered"` (v2 风格)
- **用途说明**:
  - `primary`: 主要操作，推动流程前进（每个上下文 1 个）
  - `secondary`: 备选操作（可多个）
  - `tertiary`: 取消、跳过等消极操作
  - `danger`: 破坏性操作（删除、重置等）

#### 事件处理与状态

- ✅ **使用 `onPress`**: 替代 `onClick`（React Aria 统一规范）
- ✅ **使用 `isDisabled`**: 替代 `disabled`
- ✅ **使用 `isSelected`**: 替代 `checked` / `selected`
- ✅ **客户端指令**: 带交互的组件必须添加 `"use client"`

#### 无 Provider 要求

- HeroUI v3 不需要全局 Provider 包裹，直接导入使用即可

#### 可用组件（34个，v3.0.0-beta.1）

Accordion, Alert, Avatar, Button, Card, Checkbox, CheckboxGroup, Chip, CloseButton, Description, Disclosure, DisclosureGroup, FieldError, Fieldset, Form, Input, InputOTP, Kbd, Label, Link, ListBox, Popover, RadioGroup, Select, Separator, Skeleton, Slider, Spinner, Surface, Switch, Tabs, TextArea, TextField, Tooltip

> **注意**: 部分 v2 组件可能在 v3 beta 中尚未提供，v3 正在积极开发中

#### HeroUI v3 vs v2 对比

| 方面           | v2                              | v3                                     |
| -------------- | ------------------------------- | -------------------------------------- |
| **动画**       | Framer Motion                   | CSS + GPU 加速                         |
| **组件模式**   | 单组件 + 多 props               | 复合组件                               |
| **Variants**   | 视觉化（solid, bordered, flat） | 语义化（primary, secondary, tertiary） |
| **样式**       | 部分支持 Tailwind v4            | 完全支持 Tailwind v4                   |
| **可访问性**   | 优秀（React Aria）              | 优秀（React Aria）                     |
| **包体积**     | 较大（Bundle）                  | 更小（树摇优化）                       |
| **自定义难度** | 中等（基于 Props）              | 简单（复合组件 + 原生 CSS）            |

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
- **详细文档**: 见 `app/lib/storage/AGENTS.md`

### 3.1 国际化系统（Milestone 2-6）

- **支持语言**: 中文（zh-CN）、英文（en-US）、日文（ja-JP）
- **技术栈**: i18next + react-i18next
- **翻译资源**: `public/locales/` 目录存放各语言翻译文件（JSON 格式）
- **已完成国际化模块**:
  - **Milestone 2**: 语言切换器与通用设置面板
  - **Milestone 3 & 4**: 顶栏与项目选择器国际化
  - **Milestone 5**: 侧边栏国际化（聊天、设置、版本）
  - **Milestone 6**: 设置模块国际化（完整面板和选项）
  - **最近更新**: Skill 配置、页面选择器、画布上下文国际化
- **详细文档**: 见 `app/i18n/AGENTS.md`

### 4. 包开发信息获取

- **首选 context7**: 获取任何第三方包的开发信息时，必须优先使用 `context7` MCP 工具
- **工作流程**: 先调用 `resolve-library-id` 获取包ID，再调用 `get-library-docs` 获取最新文档
- **适用场景**: 新增包、使用包的API、版本升级、遇到兼容性问题时

### 5. 工具调用架构（v1.2：前端顺序执行 + HTTP/BFF）

- **目标**: 后端不再执行任何 DrawIO 工具；工具执行迁移到前端（浏览器/ Electron 渲染进程）。
- **当前形态**:
  - `/api/ai-proxy`：纯 HTTP/BFF 代理转发（不注入 DrawIO 工具）+ AI SDK v6
  - `frontend-tools.ts`：前端执行 `drawio_read` / `drawio_edit_batch`（顺序执行，遇错即停）
  - `app/components/ChatSidebar.tsx`：前端接收 tool-call（`useChat.onToolCall`）并调用 `frontend-tools.ts` 执行，然后把结果回传给对话流
  - **页面选择器**：支持多页面图表的分页操作，用户可选择 AI 操作生效的页面范围
  - **画布上下文注入**：自动注入 `<drawio_status>` 标签（节点/连线数量），App 环境还会注入 `<user_select>` 标签（鼠标选中元素 ID）
- **工具变更**:
  - ✅ `drawio_read`：读取图表（支持 filter/id/xpath 查询，支持页面过滤）
  - ✅ `drawio_edit_batch`：批量编辑图表（顺序执行，第一个失败时停止，支持页面过滤）
  - ❌ `drawio_overwrite`：已移除（2025-12-27），功能已合并到 `drawio_edit_batch` 的顺序执行逻辑
- **（已废弃并删除）Socket.IO 工具调用架构**：v1.1 起不再提供/连接 Socket.IO，相关文档仅保留为历史背景。

### 6. 检查测试

- 务必主动调用`npm run lint`获得语法错误检查信息，避免在编译时才处理语法错误
- Vitest / Vite 测试环境中如需引用 Node 内置模块，优先使用 `node:` 前缀（如 `node:buffer`），避免被浏览器 polyfill 误替换

## 代码腐化清理记录

### 2025-12-08 清理（阶段6）

**执行的操作**：

- 死代码清理：移除 `resetDomParserCache`，精简 `DrawioEditBatchRequest`，清除 ModelsSettingsPanel 过时 TODO。
- 重复合并：UUID 生成、版本格式化、错误消息提取集中到通用工具；存储事件分派/超时常量下沉；Electron Buffer 与 SQL 占位符工具化；ToolCallCard 样式抽出到 utilities。
- 一致性：组件事件统一 `onPress`（ToolCallCard/ProjectSelector/PageSVGViewer）；新增 `buildXmlError/buildToolError`；存储超时提示补齐国际化；`useChatLock` 的 clientIdRef 改为 `useEffect` 初始化；`exportConversations` 复用 SQL 语句。
- 重大重构：提炼 `usePanZoomStage` / `useVersionPages`；PageSVGViewer 与 VersionCompare 迁移到新 hooks；删除 `components/version/version-utils.ts` 下沉到 lib；新增 `blob-utils.ts` 统一二进制转换。
- 依赖：新增 `@react-aria/interactions` 支持 `usePress`。

**影响文件**：约 25 个（跨 components/hooks/lib/electron/storage）

**下次关注**：

- 观察新 hooks 对版本/对比场景的性能与可访问性回归。
- 跟踪 usePress 引入后是否还有遗留 onClick 或事件冒泡问题。

### 2025-12-05 清理（Milestone 8）

**执行的操作**：

- 样式系统统一：移除组件内联样式，补齐缺失的 CSS 变量引用，集中到样式文件
- 性能优化：自动保存加防抖，嵌套渲染分段更新，日志系统统一输出，AI 版本快照路径降噪
- 代码质量：TypeScript/ESLint 全量通过，消除警告与悬挂类型

**影响文件**：约 20+ 个文件

**下次关注**：

- 补充可访问性专项（见遗留问题清单）
- 继续压缩渲染关键路径的无关重渲染
- 观察自动保存防抖对极端场景的稳定性

### 2025-12-02 清理（Components 模块）

**执行的操作**：

- 删除未使用组件 FileSettingsPanel 及其导出
- 删除未调用的 Electron 函数（showOpenDialog/readFile/selectFile）
- 删除未使用的 props（ChatSidebarProps.isOpen/onClose、ChatHistoryView.currentProjectId 等）
- 合并 HeroUI Select 工具函数重复（5 处 → 1 处），新增 lib/select-utils.ts
- 迁移所有 console.log/error 到统一日志系统 logger.ts（15+ 文件，50+ 处）
- 修复 MessageList 渲染副作用（setTimeout → useEffect）
- 合并 ToolCallCard 重复的复制函数（3 个 → 1 个通用函数）

**影响文件**：22 个文件，+160/-217 行

**下次关注**：

- ChatSidebar 仍需重构（958 行，耦合度高），建议拆分 useChatSessionsController hook
- 提炼 usePanZoomStage hook（PageSVGViewer 和 VersionCompare 重复缩放逻辑）
- 封装 useLLMConfig 和 useOperationToast（3 处配置加载逻辑重复）
- 统一 onClick → onPress，符合 HeroUI v3 可访问性规范
- 统一 React 导入方式（混用 `import React` 和解构导入）

---

### 2025-11-24 清理

**执行的操作**：

- 删除未实现的 TODO 函数（ChatSidebar.tsx）、未使用的国际化资源、空目录
- 新增 DOM 缓存工具（dom-parser-cache.ts），统一 Parser/Serializer 缓存
- 新增 UUID 生成工具（utils.generateProjectUUID），移除重复实现
- 新增会话数据服务（chat-session-service.ts），ChatSidebar 从 1088 行减至 745 行
- 新增会话存储订阅机制（conversation-created/updated/deleted、messages-updated 事件）
- 修复默认工程创建路径，统一使用 prepareXmlContext + persistWipVersion 管线
- 新增统一日志工具（logger.ts），移除 useCurrentProject 中的 emoji 日志
- 统一错误处理与超时策略（8 秒超时，runStorageTask + withTimeout）
- XML 规范化集中到 writers 管线，移除重复调用
- 用 HeroUI Alert 替代原生 alert，提取魔术值到常量

**影响文件**：约 25 个文件

**下次关注**：

- ChatSidebar 可进一步拆分动作/视图层，目标 500 行以内
- 考虑为存储层添加统一的事务/批处理接口

## 开发命令

使用 npm 作为包管理系统（因 Electron 打包兼容性需求）

```bash
npm run dev              # 自定义 server.js + Next.js 开发服务器 (http://localhost:3000)
npm run electron:dev     # Electron + Next.js 开发模式
npm run build            # 构建 Next.js 应用
npm run start            # 生产环境启动（自定义 server.js + Next.js）
npm run electron:build   # 构建 Electron 应用 (输出到 dist/)
npm run lint             # ESLint 检查 + TypeScript 类型检查
npm run format           # 使用 Prettier 格式化所有代码
```

⚠️ **重要**: 不能使用 `next dev` 命令，必须使用 `npm run dev` 启动自定义 `server.js`。

## CI/CD 自动发布

项目配置了 GitHub Actions 自动构建和发布 Electron 应用（`.github/workflows/release.yml`）。

### 触发方式

1. **Tag 触发**: 推送 `v*` 格式的 tag 自动触发构建和发布

   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. **手动触发**: 在 GitHub Actions 页面手动运行，可指定版本号

### 构建矩阵

| 平台    | 构建产物                  |
| ------- | ------------------------- |
| Linux   | AppImage, deb             |
| Windows | NSIS 安装包, Portable exe |
| macOS   | DMG, ZIP                  |

### 发布说明

- 版本号含 `alpha`、`beta` 或 `rc` 时自动标记为 Pre-release
- 自动生成 Release Notes（基于 commit 历史）
- macOS 签名需配置 `CSC_LINK` 和 `CSC_KEY_PASSWORD` secrets（可选）

## 常见问题

### HeroUI v3 相关

- v3 已进入 Beta 阶段（v3.0.0-beta.1），API 趋于稳定
- 使用 `context7` MCP 工具查询最新 API 和组件文档
- 需要 React 19+ 和 Tailwind CSS v4
- 基于 React Aria Components，内置完整的可访问性支持

### Electron 问题

- DrawIO 不显示？详见 `electron/AGENTS.md`

## 子包文档导航

| 模块            | 路径                                | 主要内容                                  |
| --------------- | ----------------------------------- | ----------------------------------------- |
| **React 组件**  | `app/components/AGENTS.md`          | 所有 UI 组件的详细 API 和使用规范         |
| **聊天模块**    | `app/components/chat/AGENTS.md`     | 聊天组件系统（17个子组件）详细文档        |
| **设置模块**    | `app/components/settings/AGENTS.md` | 设置面板和国际化详细文档                  |
| **Toast 通知**  | `app/components/toast/AGENTS.md`    | 全局 Toast 通知组件系统详细文档           |
| **版本管理**    | `app/components/version/AGENTS.md`  | 版本控制、对比和时间线详细文档            |
| **国际化配置**  | `app/i18n/AGENTS.md`                | 多语言支持、翻译资源和配置详细文档        |
| **存储层**      | `app/lib/storage/AGENTS.md`         | 统一存储架构、SQLite/IndexedDB 适配器文档 |
| **React Hooks** | `app/hooks/AGENTS.md`               | 统一存储 Hooks 与 AI/网络相关 Hooks       |
| **样式系统**    | `app/styles/AGENTS.md`              | 设计令牌、Material Design 规范、最佳实践  |
| **XML 工具集**  | `app/lib/AGENTS.md`                 | DrawIO XML 操作、工具集完整文档           |
| **类型定义**    | `app/types/AGENTS.md`               | TypeScript 类型的完整说明                 |
| **桌面应用**    | `electron/AGENTS.md`                | Electron 配置、安全策略和调试指南         |

## 最近更新

### Skill 配置系统与工具优化（2025-12-27）

**Skill 配置功能**

- 新增绘图技能（Skill）配置系统：支持主题风格（现代/学术/极简/自定义）+ 知识库（通用/流程图/UML/云服务）动态组合
- 系统提示词支持 `{{theme}}` / `{{knowledge}}` 占位符，根据用户选择动态注入
- 配置存储在 `app/config/skill-elements.json`，支持热加载和扩展
- 优化配色策略：优先遵从用户提供的调色板/品牌色，否则使用风格默认配色

**工具调用架构优化**

- 移除 `drawio_overwrite` 工具（功能已合并到 `drawio_edit_batch`）
- `drawio_edit_batch` 重构为顺序执行（遇到第一个失败时停止），提升可预测性和错误处理
- 新增页面选择器功能：支持多页面图表的分页操作，用户可选择 AI 操作生效的页面范围
- 精简系统提示词与画布上下文注入，降低 token 消耗（约 30% 减少）

**AI SDK 升级**

- 升级到 AI SDK v6，支持更多原生供应商（Anthropic、Gemini）
- 改进流式输出性能和错误处理机制
- 支持 Reasoning 模型的思考过程展示

**影响文件**：约 10 个文件

**下次关注**：

- 观察 Skill 配置对不同模型的 token 消耗影响
- 监控顺序执行对工具调用失败率的改善效果
- 考虑为页面选择器添加批量操作快捷方式

### 模块化文档与国际化完善（2025-11-30）

**子模块 AGENTS.md 创建**

- 新增 `app/components/chat/AGENTS.md` - 聊天组件系统完整文档
- 新增 `app/components/settings/AGENTS.md` - 设置面板和国际化文档
- 新增 `app/components/toast/AGENTS.md` - 全局 Toast 通知系统文档
- 新增 `app/components/version/AGENTS.md` - 版本管理和对比文档
- 新增 `app/lib/storage/AGENTS.md` - 统一存储架构详细文档
- 新增 `app/i18n/AGENTS.md` - 国际化配置和多语言支持文档

**项目架构优化**

- 将 `storage` 模块独立为 `app/lib/storage/`，确保存储层文档清晰
- 新增 `app/i18n/` 模块，包含多语言配置（zh-CN, en-US, ja-JP）
- 各组件子模块（chat、settings、toast、version）均已完成国际化适配

**文档导航更新**

- 根目录 AGENTS.md 更新"子包文档导航"表格，新增 6 个模块文档链接
- 项目结构树形图更新，反映最新的模块拆分和国际化集成

### XML 处理与安全增强（2025-11-20 ~ 2025-11-23）

**XML 合并错误处理与自动回滚**

- AI 工具调用失败时自动回滚到操作前状态
- 新增 `drawio-xml-utils.ts`：XML 归一化与 DrawIO 压缩格式自动解压
- 支持 deflate-raw 压缩的 mxGraphModel 自动识别与解压

**聊天历史管理优化**

- 聊天历史视图增强：支持会话预览、时间分组
- 新增 `ChatHistoryView.tsx` 组件
- 会话列表虚拟滚动优化（@tanstack/react-virtual）

**跨项目安全隔离**

- 严格的项目级数据隔离：所有存储操作校验 `project_uuid`
- 防止跨项目数据泄露的安全边界检查

### 主题系统增强（2025-11-17 ~ 2025-11-19）

**主题切换功能**

- 新增 `ThemeToggle` 组件：太阳/月亮图标切换深色/浅色模式
- localStorage 持久化 + 系统主题检测（`prefers-color-scheme`）
- 避免闪烁的初始化脚本（`layout.tsx` 中内联）
- 集成到 `TopBar` 组件右上角工具栏

**主题色彩现代化**

- 主色调使用 OKLCH 色彩空间，提升饱和度和对比度
- 深色模式优化：亮度提升确保可读性
- 语义化颜色增强：Success/Warning/Danger/Info 更鲜艳
- 边框系统强化：新增 `--border-focus` 状态（65% 透明度）
- 阴影系统升级：模糊半径翻倍（4/8/16/32px），透明度梯度优化
- 现代 UI 效果：新增 `--accent-gradient` 渐变和 `--glass-effect` 玻璃形态

**设置面板增强**

- 新增 `VersionSettingsPanel` 组件：控制 AI 编辑自动版本快照策略
- 设置侧边栏支持多面板 Tab 切换（文件/LLM/版本）
- 统一导出：`app/components/settings/index.ts`

### 核心架构（2025-11）

**统一存储系统**

- 适配器模式统一 SQLite（Electron）和 IndexedDB（Web）接口
- 版本控制：UUID 主键 + 关键帧/Diff 混合存储（diff-match-patch）
- WIP 草稿独立管理：永久关键帧，时间戳实时更新，独立于 Diff 链路
- 工程管理增强：超时保护、严格模式兼容、自动兜底机制

**（历史）Socket.IO 工具调用架构（已废弃并删除）**

- 该链路已在 v1.1 架构中废弃并删除：前端不再连接 Socket.IO，后端也不再提供 Socket.IO 服务或执行 DrawIO 工具。

**LLM 集成**

- OpenAI Compatible 支持（Reasoning 模型 o1/o3、LM Studio、DeepSeek）
- Anthropic Claude 原生支持（AI SDK v6）
- Google Gemini 原生支持（AI SDK v6）
- 聊天消息带模型标记（`model_name` 字段）
- 系统提示词支持 Skill 配置动态注入（`{{theme}}` / `{{knowledge}}` 占位符）

### 版本管理系统（2025-11-12 ~ 2025-11-17）

**UI 现代化**

- Material Design 规范：4/8/12px 圆角、4 层阴影系统、4px 基准间距
- 扁平化设计：移除渐变、干扰性动画（脉冲/浮动）
- 紧凑化布局：折叠式版本卡片、时间线视觉优化
- 文本语义化变量：`--text-primary/secondary/tertiary`

**多页面 SVG 支持**

- 存储扩展：`page_count`、`page_names`、`preview_svg`、`pages_svg` 字段
- 全屏查看器：懒加载、键盘快捷键、滚轮缩放、拖拽平移
- 缩略图全屏查看：所有版本（单页/多页）的缩略图均可点击放大，悬停显示放大图标
- 可访问性：`role="button"`、键盘 Enter/Space 支持

**版本对比可视化**

- 智能差异模式（`smart` 视图）：基于 `data-cell-id` 自动匹配差异元素
  - 自动分类：匹配/变更/删除/新增
  - 视觉归一化：自动缩放对齐不同尺寸 SVG
  - 混合模式高亮：`mix-blend-mode` + `filter` 实现差异可视化
  - 覆盖率统计：匹配元素百分比
- 全屏对比弹层：左右/上下/叠加三种布局，同步缩放/平移
- 快速对比入口：最新 vs 上一版本快捷按钮

**版本操作增强**

- 版本动态切换：侧栏直接切换到历史版本编辑
- SVG 导出增强：自定义选项、多页面导出优化

### 智能对比算法（2025-11-17）

- `app/lib/svg-smart-diff.ts` 现会收集所有匹配/变更的 `data-cell-id` 元素，通过临时挂载到 DOM 后的 `getBBox()` 汇总真实包围盒。
- 基于包围盒尺寸动态计算等比缩放因子（0.25x ~ 4x），以保持两侧差异视图在统一坐标系内尽量重叠。
- 在统一的归一化画布上根据包围盒中心点求取平均目标中心，对两个版本分别添加平移补偿，将核心差异区域自动对齐。

### 界面交互优化（2025-11-13 ~ 2025-11-14）

**顶栏与侧栏重构**

- 顶栏统一操作区：选区指示器（左）+ 工程切换（中）+ 保存/侧栏切换（右）
- 统一侧栏多 Tab：聊天/设置/版本切换（HeroUI `Tabs` 实现）
- 选区状态显示：Electron 实时显示选中对象数量（Web 受限）

**HeroUI v3 组件迁移**

- Alert 组件：聊天错误提示标准化
- Skeleton 占位：统一加载状态（ProjectSelector、MessageList、Version Timeline）
- Tabs 组件：侧栏标签页切换

**聊天界面优化**

- 组件模块化：拆分为 12 个独立组件（`app/components/chat/`）
- 全宽 AI 回复布局 + 气泡式用户消息
- 模型信息条：Lucide 图标 + 模型名 + 时间戳

### 关键修复（2025-11-16）

**DrawIO 初始化加载**

- 修复 iframe 加载阻塞问题（e33efb5 之后）
- 新增 `pendingLoadQueue`：iframe 未 ready 时缓存请求，`init` 后自动回放
- 状态对齐：`loadProjectXml` 返回已加载 XML，保证保存/回滚场景一致性

### 统一存储层更新（2025-11-17）

- **对话 API**：`getConversationsByXMLVersion` 全面下线，所有会话按 `project_uuid` 维度查询，前端 Hook 与 Electron IPC 均已同步。
- **页面元数据校验**：新增 `app/lib/storage/page-metadata-validators.ts`，统一 `page_count`、`page_names` 解析规则与 SVG Blob（8MB）体积校验，IndexedDB/SQLite 复用同一逻辑。
- **Schema 初始化（2025-12-07 破坏性更新）**：
  - 迁移体系下线，v1 即当前完整 Schema（含 sequence_number、conversation_sequences、is_streaming/streaming_since）（已于 2025-12-08 恢复迁移机制，见下节）
  - IndexedDB / SQLite 在初始化阶段直接建表，`pragma user_version` 固定为 1
  - 需要结构变更时直接提升版本号并重建（允许清库，暂无迁移脚本）

### 迁移体系恢复（2025-12-08）

- 恢复存储迁移目录：`app/lib/storage/migrations/indexeddb`、`electron/storage/migrations`
- IndexedDB：upgrade 回调使用 `runIndexedDbMigrations`，V1 迁移包含 settings/projects/xml_versions/conversations/messages/conversation_sequences，补回 `source_version_id` 及消息序列索引，幂等可重复执行
- SQLite：基于 `PRAGMA user_version` 的 `runSQLiteMigrations`，V1 迁移创建全部表、索引（含 `source_version_id`）、外键约束，保持 WAL 与外键开启
- 现有用户库版本仍为 1，如需应用迁移可删除本地库重新初始化（未来版本将基于此体系增量迭代）

_最后更新: 2025-12-27_
