# React 组件库

## 概述

基于 React 19 + HeroUI v3 (Alpha) 构建的 DrawIO 编辑器界面组件，采用复合组件模式。

## 核心组件

### 0. 版本管理组件

#### VersionSidebar.tsx - 版本侧边栏主组件

**版本管理主界面** - 集成版本时间线和创建版本对话框（WIP 已并入时间轴）

##### Props

```typescript
interface VersionSidebarProps {
  projectUuid: string | null; // 项目 UUID
  onVersionRestore?: (versionId: string) => void; // 版本回滚回调
  editorRef: React.RefObject<DrawioEditorRef | null>; // 透传原生编辑器实例，供创建版本时导出 SVG
}
```

##### 特性

- **现代化顶部 Header**: History 图标 + 标题 + 描述信息 + "保存版本" CTA 按钮
- **空状态卡片**: 未选择项目时显示引导信息
- **自动刷新**: 监听 `version-updated` 事件自动重新加载版本列表
- **WIP 集成**: 同时监听 `wip-updated` 事件，时间轴首位渲染实时草稿（WIP）
- **错误处理**: 加载失败时显示错误状态和重试按钮
- **版本反馈**: 成功创建版本后显示 HeroUI `Alert`，提示页数与 SVG 导出结果（4 秒自动消失）
- **视图模式同步**: 在侧边栏层面保存 `viewMode`（主视图/子版本视图），时间线以受控模式渲染，创建版本对话框会根据当前子版本视图自动锁定 `parentVersion`

#### version/VersionCard.tsx - 版本卡片（折叠式）

**单个版本展示卡片** - 默认折叠，点击展开查看完整信息

##### Props

```typescript
interface VersionCardProps {
  version: XMLVersion;
  isLatest?: boolean; // 是否为最新版本
  isWIP?: boolean; // 是否为 WIP 草稿（强制折叠）
  onRestore?: (versionId: string) => void; // 回滚回调
  defaultExpanded?: boolean; // 默认是否展开
}
```

##### 特性

- **折叠视图**: 显示版本号 + 徽章（最新/关键帧/Diff）+ 时间；WIP 卡片固定显示 `WIP` 及“当前画布内容”文案
- **展开视图**: 显示完整信息（名称、描述、元数据、操作按钮）
- **Disclosure 组件**: 使用 HeroUI v3 Disclosure 实现折叠展开
- **操作按钮**: 导出 DrawIO 文件 + 回滚到此版本，WIP 卡片禁用这些操作
- **SVG 预览**: `preview_svg` 现为 deflate-raw 压缩二进制，组件内部会先解压再转为 ObjectURL，展示 16:10 缩略图；缺失数据时显示占位提示
- **全屏查看**: 所有版本（单页/多页）的缩略图均可点击打开全屏查看器（PageSVGViewer），悬停时显示放大图标提示
- **页面信息**: 解析 `page_count`/`page_names`，展示"共 X 页"徽章并提供 Tooltip 列出页面名称
- **多页入口**: 展开视图内可展开缩略图栅格，点击缩略图或"全屏浏览"按钮唤起 PageSVGViewer
- **徽章系统**:
  - 最新徽章（绿色）
  - 关键帧徽章（黄色，Key 图标）
  - Diff 徽章（紫色，GitBranch 图标 + 链深度）
  - WIP 草稿：虚线节点 + Activity 图标的“实时草稿”标签，固定折叠

#### version/VersionTimeline.tsx - 版本时间线

**版本历史时间线列表** - 主轴 + 节点视觉展示

##### Props

```typescript
interface VersionTimelineProps {
  projectUuid: string;
  versions: XMLVersion[]; // 完整版本列表（含 WIP 草稿）
  onVersionRestore?: (versionId: string) => void;
  onVersionCreated?: () => void;
  viewMode?: VersionTimelineViewMode; // 可选受控视图状态
  onViewModeChange?: (mode: VersionTimelineViewMode) => void; // 通知父组件视图切换
  onNavigateToSubVersions?: (parentVersion: string) => void; // 卡片点击「查看子版本」时上抛
}
```

##### 特性

- **时间线视觉**: CSS `::before` 绘制主轴，卡片节点连接；WIP 使用虚线节点
- **WIP 集成**: 时间轴首位展示 WIP 草稿（0.0.0），并维持按时间倒序
- **空状态**: 无历史版本时显示引导信息
- **降序排列**: 最新版本在顶部
- **受控视图**: 默认内部管理视图状态，也可透传 `viewMode` 保持与侧边栏/对话框同步，向上回调 `onNavigateToSubVersions`

#### version/VersionCompare.tsx - 版本对比弹层（里程碑6）

**并排/叠加对比两个历史版本的多页 SVG** - 支持同步缩放、按键导航、布局切换、智能差异高亮。

##### Props

```typescript
interface VersionCompareProps {
  versionA: XMLVersion; // 旧版本
  versionB: XMLVersion; // 新版本
  versions: XMLVersion[]; // 所有版本列表，用于快速切换对比版本
  isOpen: boolean;
  onClose: () => void;
}
```

##### 特性

- **四种布局模式**:
  - **split（左右分栏）**: 经典并排对比，适合整体对比
  - **stack（上下堆叠）**: 垂直排列，适合细节对比
  - **overlay（叠加对比）**: 可调透明度，适合位置对齐检查
  - **smart（智能差异）**: 基于 `data-cell-id` 自动匹配元素并高亮差异
- **智能差异模式**（2025-11-17 新增）:
  - 自动匹配两个版本中的对应元素（基于 `data-cell-id`）
  - 差异分类：匹配/变更/删除/新增元素
  - 视觉归一化：自动缩放和居中对齐不同尺寸的 SVG
  - 混合模式高亮：匹配元素去饱和、删除元素红色发光、新增元素绿色发光
  - 统计信息：显示匹配数/变更数/删除数/新增数/覆盖率
- **版本快速切换**: 顶部 Header 提供版本选择器，可快速切换对比的版本对
- **同步控制**: 统一缩放/平移、键盘左右切页、Ctrl/Cmd+滚轮缩放、0 重置
- **缺页提示**: 页面数量不一致或缺少 `pages_svg` 时显示占位和警告文案
- **页面跳转**: Select 下拉快速跳页，Footer 展示当前页名称与计数
- **全屏弹层**: 通过 React Portal 挂载到 `document.body`，弹层覆盖整个页面，不再受侧边栏宽度限制

##### 交互提示

- 支持 ESC 关闭、方向键切页、`+/-/0` 控制缩放
- 叠加模式下可拖动透明度滑杆
- Smart 模式自动加载并显示差异统计信息

#### version/CreateVersionDialog.tsx - 创建版本对话框

**创建新版本的模态对话框** - 输入版本信息并保存快照

##### Props

```typescript
interface CreateVersionDialogProps {
  projectUuid: string;
  isOpen: boolean;
  onClose: () => void;
  onVersionCreated?: (result: CreateHistoricalVersionResult) => void; // 返回版本 ID、页数、SVG 状态
  editorRef: React.RefObject<DrawioEditorRef | null>; // 必填，提供导出 XML/SVG 能力
  parentVersion?: string; // 可选：传入则强制进入子版本创建模式并锁定父版本
}
```

##### 特性

- **模态对话框**: HeroUI v3 Modal 组件，导出期间禁止关闭
- **版本类型切换**: RadioGroup 控制主版本（x.y.z）与子版本（x.y.z.h）模式，传入 `parentVersion` 时自动锁定子版本
- **父版本选择器**: 子版本模式下展示 Select，下拉列表自动过滤 WIP 和子版本，仅保留主版本条目（格式 `v1.2.0 - 描述`），被锁定的父版本不可修改
- **子版本输入**: 展示 `父版本.` 只读前缀，输入框仅填写末段数字并支持智能推荐（调用 `getRecommendedVersion(projectUuid, parent)`）
- **表单验证**: 版本号实时校验 + 节流重名检查，子版本额外校验父版本必选且末段为纯数字
- **自动版本号**: 基于现有版本自动建议下一个版本号（主版本/子版本均支持）
- **SVG 进度**: 通过 `editorRef` + `exportAllPagesSVG` 显示“第 X/Y 页”进度，禁用提交直到完成
- **异步保存**: 调用存储层 API 创建版本快照并写入 `preview_svg/pages_svg`
- **成功提示**: 展示页数 + SVG 状态的成功文案，1.4 秒后自动关闭对话框

#### version/PageSVGViewer.tsx - 多页面 SVG 查看器

**历史版本多页面预览器** - 全屏/半屏模式渲染 `pages_svg` 中的每一页 SVG。

##### Props

```typescript
interface PageSVGViewerProps {
  version: XMLVersion;
  isOpen: boolean;
  onClose: () => void;
  defaultPageIndex?: number;
}
```

##### 特性

- **懒加载处理**: 打开时解析 `version.pages_svg`，失败回退到错误提示
- **多种导航**: 上/下一页按钮、页码选择器、键盘左右键，Top Bar 显示当前页信息
- **缩放/平移**: Ctrl/Cmd + 滚轮缩放、按钮放大/缩小、重置/适应窗口、放大后可拖拽平移
- **导出能力**: 支持导出当前页 SVG，或者导出所有页的 JSON（可供后续批量处理）
- **全屏/半屏切换**: 一键进入全屏体验，自动锁定 body 滚动，Esc 快捷关闭
- **可访问性**: `role="dialog"` + 键盘快捷键（Esc 关闭、0 重置、± 缩放）

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
- **底部操作条**: 有修改时底部整条不透明操作栏展示“取消/保存”，保持上下文不遮挡
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

#### VersionSettingsPanel.tsx - 版本管理设置面板

**AI 自动版本配置** - 为设置侧栏提供自动版本快照开关

##### Props

```typescript
interface VersionSettingsPanelProps {
  settings: {
    autoVersionOnAIEdit: boolean;
  };
  onChange: (settings: { autoVersionOnAIEdit: boolean }) => void;
}
```

##### 特性

- **HeroUI Switch**: 复合结构 `Switch.Control` + `Switch.Thumb` + `Label`，保持一致的交互可达性
- **受控模式**: `isSelected` 绑定 `settings.autoVersionOnAIEdit`，`onValueChange` 直接透传更新
- **描述信息**: `Description` 展示“AI 批量编辑或覆写 XML 前自动创建子版本快照”提示
- **布局规范**: 容器 `settings-panel flex flex-col gap-6`，单项 `flex flex-col gap-2`，延续 File/LLM 面板的间距体系
- **父级集成**: 不直接访问 `useStorageSettings`，由 `SettingsSidebar` 将存储值与回调传入

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
