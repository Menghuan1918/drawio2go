# React 组件库

## 概述

基于 React 19 + HeroUI v3 (v3.0.0-beta.1) 构建的 DrawIO 编辑器界面组件，采用复合组件模式。HeroUI v3 特性：React Aria 可访问性、语义化设计系统、GPU 加速动画、树摇优化、完全类型安全。

## 核心组件

### 0. 版本管理组件

#### VersionSidebar.tsx - 版本侧边栏

**Props**: `projectUuid`, `onVersionRestore`, `editorRef`

**核心功能**: 顶部 Header + 版本时间线 + 创建版本对话框、自动刷新（监听 `version-updated`/`wip-updated` 事件）、视图模式同步（主视图/子版本视图）

#### version/VersionCard.tsx - 版本卡片

**Props**: `version`, `isLatest`, `isWIP`, `onRestore`, `defaultExpanded`

**核心功能**:

- 折叠/展开视图（Disclosure 组件）
- SVG 预览（deflate-raw 压缩自动解压）、全屏查看（PageSVGViewer）
- 徽章系统：最新/关键帧/Diff/WIP 草稿
- 操作：导出 DrawIO、回滚版本（WIP 禁用）
- 多页支持：展示页数徽章、缩略图栅格

#### version/VersionTimeline.tsx - 版本时间线

**Props**: `projectUuid`, `versions`, `onVersionRestore`, `onVersionCreated`, `viewMode`, `onViewModeChange`, `onNavigateToSubVersions`

**核心功能**: CSS `::before` 时间轴视觉、WIP 虚线节点、降序排列、受控视图模式、空状态引导

#### version/VersionCompare.tsx - 版本对比

**Props**: `versionA`, `versionB`, `versions`, `isOpen`, `onClose`

**四种布局模式**:

- **split（左右分栏）**: 并排对比
- **stack（上下堆叠）**: 垂直排列
- **overlay（叠加对比）**: 可调透明度
- **smart（智能差异）**: 基于 `data-cell-id` 匹配元素并高亮差异（显示匹配/变更/删除/新增统计）

**交互**: 版本快速切换、同步缩放/平移、键盘导航（ESC/方向键/+/-/0）、全屏弹层

#### version/CreateVersionDialog.tsx - 创建版本对话框

**Props**: `projectUuid`, `isOpen`, `onClose`, `onVersionCreated`, `editorRef`, `parentVersion`

**核心功能**:

- 版本类型切换：主版本（x.y.z）/子版本（x.y.z.h）
- 父版本选择器（自动过滤 WIP 和子版本）
- 表单验证：版本号校验 + 节流重名检查
- SVG 进度显示：通过 `exportAllPagesSVG` 展示"第 X/Y 页"
- 自动建议版本号

#### version/PageSVGViewer.tsx - 多页面 SVG 查看器

**Props**: `version`, `isOpen`, `onClose`, `defaultPageIndex`

**核心功能**: 多页导航（按钮/选择器/键盘）、缩放/平移（Ctrl+滚轮、拖拽）、导出当前页/全部页、全屏/半屏切换

---

### 1. DrawioEditorNative.tsx - 主编辑器

**iframe + PostMessage 实现**

**技术要点**:

- URL: 基于 `drawioBaseUrl` 构建默认参数（`embed=1`/`proto=json`/`spin=1`/`ui=${drawioTheme}`/`libraries=1`/`dark=0|1` 等），再应用用户自定义 `drawioUrlParams`（优先级最高，可覆盖 `ui=` 等）
- 消息协议：`{action: 'load'|'merge'|'export', ...}`
- 安全检查：验证 `event.origin.includes(drawioIdentifier)`（默认 `diagrams.net`）
- merge 回调事件：
  - 失败：`window.dispatchEvent(new CustomEvent("drawio-merge-error", { detail }))`
  - 成功：`window.dispatchEvent(new CustomEvent("drawio-merge-success", { detail }))`
  - detail 会包含 `requestId`、`context.timestamp`，并提供 `errorText`（对象型 error 的可读序列化）

**Ref API**:

- `loadDiagram(xml)`: 发送 `load` 并等待响应
- `mergeDiagram(xml, requestId?)`: 发送 `merge`（透传 requestId），10.5s 超时回退为 `load`
- `exportDiagram()`: 导出 XML
- `exportSVG()`: 导出 SVG（Promise 队列避免串扰）

### 2. UnifiedSidebar.tsx - 统一侧边栏

**Props**: `isOpen`, `activeTab`, `onTabChange`, `onClose`, `currentProjectId`, `projectUuid`, `onVersionRestore`, ...

**核心功能**:

- 可调整宽度（300-800px）+ 持久化（Settings 表）
- CSS 变量 `--sidebar-width` 驱动布局
- HeroUI Tabs 导航：聊天/设置/版本
- 两段式布局：Tab 区 + 内容区

### 3. SettingsSidebar.tsx - 设置侧边栏

**Props**: `onSettingsChange`

**六个面板**:

- **GeneralSettingsPanel**: 语言切换 + 默认文件路径选择（Electron 环境支持 `selectFolder`）
- **DrawioSettingsPanel**: 画布设置（DrawIO Base URL、DrawIO 标识符、默认主题 ui=）
- **ModelsSettingsPanel**: 供应商/模型管理（Accordion 列表、级联删除、Provider 编辑占位）
- **AgentSettingsPanel**: 全局系统提示词（System Prompt）编辑
- **VersionSettingsPanel**: AI 自动版本快照开关（`autoVersionOnAIEdit`）
- **AboutSettingsPanel**: 应用信息与更新检查（`update.autoCheck`）

**特性**: 底部操作条（有修改时显示取消/保存）、供应商切换（OpenAI Responses/Chat Completions/DeepSeek）

### 4. ChatSidebar.tsx - 聊天侧边栏

**Props**: `isOpen`, `onClose`, `currentProjectId?`, `editorRef`, `selectionRef?`

**核心功能**:

- 模块化架构（基于 hooks 和状态机）
- 一体化布局：消息区 + 输入区 + 顶部操作栏（ChatTopActions）
- 画布上下文（Canvas Context）：发送前可选注入 `<drawio_status vertices="X" edges="Y"/>`（仅包含节点/连接线数量）与 `<user_select>`（仅 Electron，来自 `app/page.tsx` 的 `selectionRef`）；仅影响请求 payload，不写入本地历史/存储
- 页面选择器（Page Selector）：支持多选页面，未全选时至少选一页才能发送；通过 `usePageSelection` hook 管理状态
- 绘图技能配置（Skill Settings）：风格（style）和知识类型（knowledge）配置，持久化到存储
- MCP 工具支持：前端工具通过 `electronMcp` 桥接到主进程，支持独立的工具上下文和超时控制
- @ai-sdk/react: `useChat` hook + 流式响应
- Markdown 渲染（react-markdown）
- 工具状态卡片（进行中/成功/失败）
- 模型信息条（图标 + 模型名 + 时间戳）
- 模型选择 Popover（HeroUI ComboBox 分组），按供应商列出模型，流式期间禁用选择
- 自动版本快照（AI 编辑前）：`version.autoVersionOnAIEdit` 设置控制，首次创建默认主版本后跳过子版本避免无差异错误

#### 4.1 聊天子组件（app/components/chat/）

**核心组件**: ModelComboBox、MessageList、MessageItem、MessageContent、ChatInputArea、ChatInputActions

**辅助组件**: EmptyState、ToolCallCard、ThinkingBlock

**统一导出**: `app/components/chat/index.ts`

### 5. ThemeToggle.tsx - 主题切换

**功能**: 深色/浅色模式切换、localStorage 持久化、系统主题检测、平滑动画（300ms）、避免 SSR 闪烁

**实现**:

- 浅色：`class="light" data-theme="drawio2go"`
- 深色：`class="dark" data-theme="drawio2go-dark"`

### 6. TopBar.tsx - 顶部操作栏

**Props**: `selectionLabel`, `currentProjectName`, `onOpenProjectSelector`, `onLoad`, `onSave`, `onExportSVG`, `isSidebarOpen`, `onToggleSidebar`

**布局**:

- 左侧：选区徽章（超长省略 + Tooltip）
- 中部：工程切换按钮（HeroUI Button variant secondary + 文件夹图标）
- 右侧：加载 + 导出下拉菜单（.drawio/.svg）+ ThemeToggle + 侧栏切换（PanelRightOpen/Close）

**环境差异**:

- Electron: 显示 `选中了X个对象`
- 浏览器: 固定文案 `网页无法使用该功能`

### 7. ProjectSelector.tsx - 工程选择模态

**Props**: `isOpen`, `onClose`, `currentProjectId`, `onSelectProject`, `projects`, `isLoading`, `onCreateProject`, `onUpdateProject?`, `onDeleteProject?`

**核心功能**:

- Skeleton 加载态（isLoading 时渲染 3 个占位卡片）
- 空状态引导
- 卡片样式：`Card.Root` + `Card.Content`，激活项加粗边框 + Check 图标
- 操作区：编辑（内联表单）/ 删除（二次确认 ConfirmDialog；当前项目与默认项目禁用并 Tooltip 提示）
- 模态关闭时重置表单

### 8. LanguageSwitcher.tsx - 语言切换器

**Props**: `className?`

**核心功能**:

- HeroUI Select 复合组件，使用 `ListBox.Item` + `Select.Trigger`
- 读取 `i18n.language` 显示当前语言，调用 `i18n.changeLanguage` 即时切换
- 语言选项来自 `localeDisplayNames`，支持 en-US / zh-CN，文案源自 settings 命名空间

### 9. AlertDialogProvider & GlobalAlertDialog

**文件**: `app/components/alert/AlertDialogProvider.tsx`, `app/components/alert/GlobalAlertDialog.tsx`

**用途**:

- 全局单实例告警/确认弹窗，覆盖 window.confirm 与静态警告
- 支持 `danger` / `warning` 状态，异步 `onAction` 自动加载、禁用按钮
- 样式位于 `app/styles/components/alert-dialog.css`，z-index 1450

**API**:

- 使用 `useAlertDialog()` → `{ open, close }`
- `open(payload)` 结构参见 `app/types/alert-dialog.ts`（title/description/actionLabel/cancelLabel/isDismissable/onAction/onCancel）
- 受控模式，按钮事件使用 `onPress`

---

### 10. GlobalUpdateChecker.tsx - 全局更新检查订阅

**文件**: `app/components/GlobalUpdateChecker.tsx`

**用途**:

- 应用启动后即订阅 Electron 主进程广播的 `update:available`（仅 Electron）
- 受 `update.autoCheck` 设置控制（设置变更会实时生效）
- 发现新版本时通过 Toast 通知用户（按 `latestVersion` 去重）
- 应用启动时检测系统提示词是否为历史版本（Web/Electron 均生效），匹配时通过 Toast 提示并支持一键升级到最新提示词

**接入位置**: `app/layout.tsx` 的 `ToastProvider` 内部

---

## HeroUI v3 使用规范

### 复合组件模式

✅ **推荐**:

```typescript
<Card.Root>
  <Card.Header>标题</Card.Header>
  <Card.Content>内容</Card.Content>
</Card.Root>
```

❌ **避免** v2 风格: `<Card title="标题">内容</Card>`

### 语义化 Variants

| Variant     | 用途       | 使用场景         |
| ----------- | ---------- | ---------------- |
| `primary`   | 主要操作   | 保存、提交、确认 |
| `secondary` | 备选操作   | 编辑、查看、导出 |
| `tertiary`  | 消极操作   | 取消、跳过、返回 |
| `danger`    | 破坏性操作 | 删除、重置、清空 |

❌ **避免** v2 风格: `solid`/`flat`/`bordered`

### 事件处理（React Aria 规范）

✅ **推荐**: `<Button onPress={() => {}} />`, `<Switch isDisabled />`, `<Checkbox isSelected />`

❌ **避免**: `onClick`, `disabled`, `checked`

### Tooltip 复合模式

```typescript
<Tooltip.Root>
  <Button>悬停查看提示</Button>
  <Tooltip.Content>这是提示内容</Tooltip.Content>
</Tooltip.Root>
```

### 客户端指令

所有包含用户交互的组件必须添加 `"use client";`

### 无 Provider 要求

HeroUI v3 不需要全局 Provider，直接导入使用：

```typescript
import { Button } from '@heroui/react';
<Button>点击</Button>
```

### 可用组件列表（v3.0.0-beta.1）

**布局**: Card, Surface, Separator, Fieldset
**表单**: Button, Input, TextArea, TextField, Checkbox, CheckboxGroup, RadioGroup, Select, Switch, Slider, InputOTP
**反馈**: Alert, Spinner, Skeleton, Tooltip, Popover
**导航**: Tabs, Link, ListBox
**数据展示**: Avatar, Chip, Kbd, Label, Description
**交互**: Accordion, Disclosure, DisclosureGroup, CloseButton
**表单辅助**: Form, FieldError

---

## 样式主题

- **主色调**: #3388BB (蓝色)
- **设计风格**: 现代扁平化
- **Tailwind CSS**: v4 版本
- **CSS 类规范**: HeroUI BEM 类 + Tailwind 工具类 + CSS 变量（动态主题）

## 开发要点

### 状态管理

- **组件状态**: React useState/useRef
- **持久化**: 统一存储抽象层（useStorageSettings Hook）
- **跨组件通信**: props + 回调函数

### 错误处理

- Try-catch 包装异步操作
- 用户友好的错误提示

## 代码腐化清理记录

### 2025-12-22 清理

**执行的操作**：

- 删除 ChatSidebar 的 `chat:unload:` localStorage 卸载恢复逻辑（死代码）
- 清理 ChatSidebar 的 console 调试输出（改为 logger）

**影响文件**：1 个（ChatSidebar.tsx）

**下次关注**：

- ChatSidebar 仍偏大，可继续拆分状态/视图层以降低耦合
- 统一侧边栏交互的可访问性细节（焦点管理、键盘导航）

### 2025-12-08 清理

**执行的操作**：

- `ProjectSelector` 与 `ToolCallCard` 改用 `onPress`（@react-aria/interactions），统一事件语义。
- `ToolCallCard` 样式抽离到 `app/styles/utilities/tool-calls.css`，组件逻辑更精简。
- `PageSVGViewer` / `VersionCompare` 迁移到新 hooks（`usePanZoomStage`、`useVersionPages`），移除旧版 `version-utils` 依赖。

**影响文件**：约 6 个（ProjectSelector、ToolCallCard、PageSVGViewer、VersionCompare 等）

**下次关注**：

- 排查残留 `onClick` 场景，保持可访问性一致。
- 观察新 hooks 下的缩放/分页性能，必要时增加防抖。

### 2025-12-02 清理（Components 快速清理）

**执行的操作**：

- 删除 FileSettingsPanel 组件及其导出（未被任何 UI 引用）
- 删除未调用的文件操作函数（fileOperations.ts: showOpenDialog/readFile/selectFile）
- 删除未使用的 props（ChatSidebarProps.isOpen/onClose、ChatHistoryView.currentProjectId 等）
- 合并 Select 工具函数重复（5 个组件 → lib/select-utils.ts 统一导入）
- 迁移 console.log/error 到 logger.ts（约 15 个文件，50+ 处调用）
- 修复 MessageList 渲染副作用（setTimeout → useEffect + cleanup）
- 合并 ToolCallCard 复制函数（3 个相似函数 → 1 个通用 handleCopy）

**影响文件**：22 个（+160/-217 行）

**下次关注**：

- ChatSidebar 仍需重构（958 行），建议拆出 useChatSessionsController hook
- 提炼 usePanZoomStage hook（PageSVGViewer + VersionCompare 缩放逻辑重复）
- 封装 useLLMConfig/useOperationToast（配置加载逻辑在 3 处重复）

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

### 2025-11-23 清理（日期与订阅统一）

**执行的操作**：

- `VersionSidebar.tsx` 删除本地 `loadVersions` 状态，改用 `useStorageXMLVersions` 的订阅机制
- 所有日期展示改用 `format-utils.ts`（formatVersionTimestamp/formatConversationDate）
- 聊天与版本子组件（MessageItem/ConversationList/VersionCard/VersionCompare/ProjectSelector）统一日期格式

**影响文件**：9 个文件

**下次关注**：

- 订阅数据与分页/筛选共存时的性能与去抖策略
- 日期格式工具是否需要支持多语言/时区参数

### 2025-11-23 清理

**执行的操作**：

- 删除 `DrawioEditor.tsx` 死代码（整个文件未被使用，唯一引用已被注释）
- 删除 `page.tsx` 中已注释的 `DrawioEditor` 导入
- 更新本文档，移除对已删除组件的描述
- 补充 `toolConstants.ts` 中缺失的 `drawio_overwrite` 工具标签

**影响文件**：3 个（`DrawioEditor.tsx` 已删除, `page.tsx`, `toolConstants.ts`）

**下次关注**：

- `DrawioEditorNative.tsx` 的 `handleMessage` 长函数（163 行）可考虑拆分为事件处理器映射
- 魔法数字（如 10000ms 超时）可提取为命名常量
