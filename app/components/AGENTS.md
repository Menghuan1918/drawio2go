# React 组件库

## 概述

基于 React 19 + HeroUI v3 (Alpha) 构建的 DrawIO 编辑器界面组件，采用复合组件模式。

## 核心组件

### 0. 版本管理组件

#### VersionSidebar.tsx - 版本侧边栏主组件

**版本管理主界面** - 集成 WIP 指示器、版本时间线和创建版本对话框

##### Props

```typescript
interface VersionSidebarProps {
  projectUuid: string | null; // 项目 UUID
  onVersionRestore?: (versionId: string) => void; // 版本回滚回调
}
```

##### 特性

- **现代化顶部 Header**: History 图标 + 标题 + 描述信息 + "保存版本" CTA 按钮
- **空状态卡片**: 未选择项目时显示引导信息
- **自动刷新**: 监听 `version-updated` 事件自动重新加载版本列表
- **错误处理**: 加载失败时显示错误状态和重试按钮

#### version/WIPIndicator.tsx - WIP 工作区指示器

**当前活跃工作区信息卡片** - 显示 WIP 版本和实时保存状态

##### Props

```typescript
interface WIPIndicatorProps {
  projectUuid: string;
  versions: XMLVersion[]; // 版本列表（从中查找 WIP 版本）
}
```

##### 特性

- **卡片式设计**: Activity 图标 + WIP 徽章 + 版本号标识
- **三段式布局**: `wip-indicator__body/top/meta` CSS 结构
- **元数据展示**: 最后更新时间 + 实时保存状态
- **事件响应**: 监听 `wip-updated` 事件自动刷新

#### version/VersionCard.tsx - 版本卡片（折叠式）

**单个版本展示卡片** - 默认折叠，点击展开查看完整信息

##### Props

```typescript
interface VersionCardProps {
  version: XMLVersion;
  isLatest?: boolean; // 是否为最新版本
  onRestore?: (versionId: string) => void; // 回滚回调
  defaultExpanded?: boolean; // 默认是否展开
}
```

##### 特性

- **折叠视图**: 显示版本号 + 徽章（最新/关键帧/Diff）+ 时间
- **展开视图**: 显示完整信息（名称、描述、元数据、操作按钮）
- **Disclosure 组件**: 使用 HeroUI v3 Disclosure 实现折叠展开
- **操作按钮**: 导出 DrawIO 文件 + 回滚到此版本
- **徽章系统**:
  - 最新徽章（绿色）
  - 关键帧徽章（黄色，Key 图标）
  - Diff 徽章（紫色，GitBranch 图标 + 链深度）

#### version/VersionTimeline.tsx - 版本时间线

**版本历史时间线列表** - 主轴 + 节点视觉展示

##### Props

```typescript
interface VersionTimelineProps {
  projectUuid: string;
  versions: XMLVersion[]; // 版本列表（WIP 已过滤）
  onVersionRestore?: (versionId: string) => void;
  onVersionCreated?: () => void;
}
```

##### 特性

- **时间线视觉**: CSS `::before` 绘制主轴，卡片节点连接
- **WIP 过滤**: 自动过滤掉 WIP 版本（0.0.0）
- **空状态**: 无历史版本时显示引导信息
- **降序排列**: 最新版本在顶部

#### version/CreateVersionDialog.tsx - 创建版本对话框

**创建新版本的模态对话框** - 输入版本信息并保存快照

##### Props

```typescript
interface CreateVersionDialogProps {
  projectUuid: string;
  isOpen: boolean;
  onClose: () => void;
  onVersionCreated?: () => void;
}
```

##### 特性

- **模态对话框**: HeroUI v3 Modal 组件
- **表单验证**: 版本号、名称、描述输入
- **自动版本号**: 基于现有版本自动建议下一个版本号
- **异步保存**: 调用存储层 API 创建版本快照
- **事件通知**: 创建成功后触发 `version-updated` 事件

---

### 1. DrawioEditorNative.tsx

**主要 DrawIO 编辑器** - 原生 iframe + PostMessage 实现

#### 技术实现

- **iframe URL**: `https://embed.diagrams.net/?embed=1&proto=json&ui=kennedy`
- **通信协议**: PostMessage API
- **安全检查**: 验证 `event.origin.includes('diagrams.net')`
- **状态管理**: useRef 追踪 XML 变化
- **导出能力**: 支持 `exportDiagram()` (XML) 与 `exportSVG()` (SVG)，均通过 postMessage 的 `{ action: 'export', format }` 调用

#### 消息协议

```typescript
// 发送消息
{action: 'load', xml: string, autosave: true}
{action: 'merge', xml: string}
{action: 'export', format: 'xml' | 'svg'}

// 接收消息
{event: 'init'|'save'|'autosave'|'export'|'merge'|'load'|'drawio-selection', ...}
```

#### Props

```typescript
interface DrawioEditorNativeProps {
  initialXml?: string; // 初始 XML 数据
  onSave?: (xml: string) => void; // 保存回调
}

#### Ref API

- `loadDiagram(xml: string): Promise<void>`：向 iframe 发送 `load`，并在收到 `load` 事件后 resolve（用于多页面导出等需要顺序等待的场景）
- `mergeDiagram(xml: string)`：发送 `merge`，10s 超时自动回退为 `load`
- `exportDiagram(): Promise<string>`：导出 XML
- `exportSVG(): Promise<string>`：导出 SVG，内部维护 Promise 队列避免多个导出响应串扰
```

### 2. DrawioEditor.tsx

**备用编辑器** - react-drawio 组件实现

当原生 iframe 方案不可用时使用，提供基本兼容性。

### 3. UnifiedSidebar.tsx

**统一侧边栏容器** - 可调整宽度 + 多 Tab 顶部导航

#### 特性

- **可调整宽度**: 拖拽左边缘调整 (300-800px)
- **持久化**: 宽度保存到统一存储层（Settings 表）
- **CSS 变量**: `--sidebar-width` 动态更新，并驱动主容器 padding-right
- **HeroUI Tabs 导航**: 聊天 / 设置 / 版本 Tab 采用 HeroUI `Tabs` + `Tabs.Panel` 复合结构，`selectedKey` 受控于父级的 `activeTab`
- **样式约定**: `sidebar-tabs-shell` 包裹整套 Tabs，`sidebar-tab-strip` 负责顶部粘性背景，`sidebar-tab-item` 使用 `data-selected` 状态切换
- **两段式布局**: Tab 区与内容区分层，内容区高度 = `100% - var(--sidebar-tabs-height)`

#### Props

```typescript
type SidebarTab = "chat" | "settings" | "version";

interface UnifiedSidebarProps {
  isOpen: boolean;
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  onClose: () => void;
  onSettingsChange?: (settings: { defaultPath: string }) => void;
  currentProjectId?: string;
  projectUuid?: string | null;
  onVersionRestore?: (versionId: string) => void;
}
```

### 4. SettingsSidebar.tsx

**设置侧边栏内容** - 应用配置界面

#### 特性

- **无标题栏设计**: 删除顶部标题和关闭按钮
- **智能浮动按钮**: 仅在有修改时右下角浮现保存/取消按钮
- **自动检测修改**: 对比当前值与已保存值
- **供应商选择**: 支持 OpenAI Responses、Chat Completions 与 DeepSeek 兼容接口切换
- **扁平化设计**: 无分隔线，简化视觉

#### Props

```typescript
interface SettingsSidebarProps {
  isOpen: boolean; // 是否打开
  onClose: () => void; // 关闭回调
  onSettingsChange?: (settings: { defaultPath: string }) => void; // 设置变更
}
```

### 5. ChatSidebar.tsx

**聊天侧边栏主组件** - AI 助手界面的主入口组件（已重构为模块化架构）

#### 特性

- **模块化架构**: 重构为12个独立子组件，职责单一，便于维护
- **一体化布局**: 无分隔线，上方消息区 + 下方输入区
- **圆角输入框**: 支持图像上传提示
- **按钮组布局**:
  - 左侧：新建聊天、历史对话（仅图标 + Tooltip）
  - 右侧：版本管理、文件上传（仅图标 + Tooltip）、发送（图标+文本）
- **@ai-sdk/react**: 使用 useChat hook
- **配置加载**: 结合 `useLLMConfig` Hook 自动附带 LLM 配置请求 `/api/chat`
- **流式响应**: 通过 `/api/chat` 调用 AI SDK，支持工具调用与流式输出
- **Markdown 渲染**: 使用 `react-markdown` 将 AI 响应转成富文本，支持代码块、列表、引用与链接
- **工具状态卡片**: 工具调用以状态卡片展示，支持进行中/成功/失败提示，并可点击展开查看输入与输出详情
- **消息布局**: 用户消息保留气泡样式，AI 回复连同工具卡片占满整个侧边栏且无底色
- **模型信息条**: 每条用户/AI 消息左上角展示 Lucide 图标 + 模型名 + 时间戳，依赖消息 metadata

#### Props

```typescript
interface ChatSidebarProps {
  isOpen: boolean; // 是否打开
  onClose: () => void; // 关闭回调
}
```

### 5.1. 聊天组件模块 (app/components/chat/)

**模块化聊天组件集** - 从 ChatSidebar 拆分出的12个独立组件

#### 核心组件

- **ChatSessionHeader**: 会话头部，显示标题和操作按钮
- **ChatSessionMenu**: 会话选择和操作菜单
- **MessageList**: 消息列表容器组件
- **MessageItem**: 单个消息项组件
- **MessageContent**: 消息内容渲染组件（支持 Markdown）
- **ChatInputArea**: 输入区域组件
- **ChatInputActions**: 输入操作按钮组件

#### 辅助组件

- **EmptyState**: 空状态展示组件
- **ErrorBanner**: 基于 HeroUI `Alert` 的错误提示横幅，带刷新按钮
- **ToolCallCard**: 工具调用状态卡片组件
- **ThinkingBlock**: AI 思考框组件（展示推理过程）

#### 常量和工具

- **constants/**: 工具常量和 Markdown 组件定义
- **utils/**: 工具函数和文件操作函数

#### 统一导出

所有组件通过 `app/components/chat/index.ts` 统一导出，提供清晰的导入接口。

### 6. TopBar.tsx

**顶部操作栏** - 紧凑信息 + 操作汇聚区

#### Props

```typescript
interface TopBarProps {
  selectionLabel?: string; // 左侧选区指示信息
  currentProjectName?: string; // 中部工程切换按钮标题
  onOpenProjectSelector?: () => void; // 打开工程选择器
  onLoad?: () => void; // 加载 DrawIO 文件
  onSave?: () => void; // 保存 DrawIO 文件
  isSidebarOpen: boolean; // 统一侧栏是否展开
  onToggleSidebar: () => void; // 顶栏最右 icon 按钮，收起/展开侧栏
}
```

#### 交互特性

- 左侧选区徽章实时渲染 `selectionLabel`，超长文本自动省略并带 Tooltip
- 工程按钮居中占据剩余空间，采用 HeroUI `Button`（variant secondary）+ 文件夹图标
- 右侧包含加载/保存按钮 + 仅图标按钮（PanelRightOpen/Close）切换统一侧栏
- 顶栏高度控制在 `var(--top-bar-height)`，使用 Material 扁平边框，滚动时 `position: sticky`
- **Electron 环境**: 选区文本实时显示 `选中了X个对象`
- **浏览器环境**: 安全限制下固定文案 `网页无法使用该功能`

### 7. ProjectSelector.tsx

**工程选择模态** - 选择当前工程或新建工程的集中入口

#### Props

```typescript
interface ProjectSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  currentProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  projects: Project[];
  isLoading: boolean; // 加载工程列表时触发 Skeleton 占位
  onCreateProject: (name: string, description?: string) => void;
}
```

#### 行为说明

- **Skeleton 加载态**: `isLoading` 为 `true` 时渲染 3 个 HeroUI `Skeleton` 卡片，不展示真实列表
- **空状态**: 无工程时显示 `empty-state-card` 引导用户新建工程
- **卡片样式**: 使用 `Card.Root` + `Card.Content`，激活项加粗边框 / Lucide `Check` 图标
- **表单重置**: 模态关闭时重置输入框，避免残留
- **按钮规范**: 交互按钮统一使用 HeroUI `Button` 并通过 `onPress` 处理

## HeroUI v3 使用规范

### 复合组件模式

- ✅ 使用 `Card.Root`, `Card.Header`, `Card.Content` 等
- ❌ 不使用扁平化 props 如 `Card title="..."`

### 事件处理

- ✅ 使用 `onPress` 代替 `onClick`
- ✅ 带交互的组件必须添加 `"use client"`

### Tooltip 组件

```typescript
<TooltipRoot>
  <Button>...</Button>
  <TooltipContent>提示内容</TooltipContent>
</TooltipRoot>
```

### 无 Provider 要求

HeroUI v3 不需要全局 Provider 包裹，直接使用即可。

## 样式主题

### 主题色彩

- **主色调**: #3388BB (蓝色)
- **设计风格**: 现代扁平化
- **Tailwind CSS v4**: 必须使用 v4 版本

### CSS 类规范

- 使用 HeroUI 提供的 BEM 类
- Tailwind 工具类用于布局和间距
- CSS 变量用于动态主题切换

## 开发要点

### 客户端指令

所有包含用户交互的组件必须添加：

```typescript
"use client";
```

### 状态管理

- **组件状态**: React useState/useRef
- **持久化**: 统一存储抽象层（通过 useStorageSettings Hook）
- **跨组件通信**: props + 回调函数

### 错误处理

- Try-catch 包装异步操作
- 用户友好的错误提示
- 降级方案（如 DrawioEditor 备用方案）
