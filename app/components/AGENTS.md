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

- URL: `https://embed.diagrams.net/?embed=1&proto=json&ui=kennedy`
- 消息协议：`{action: 'load'|'merge'|'export', ...}`
- 安全检查：验证 `event.origin.includes('diagrams.net')`

**Ref API**:

- `loadDiagram(xml)`: 发送 `load` 并等待响应
- `mergeDiagram(xml)`: 发送 `merge`，10s 超时回退为 `load`
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

**Props**: `isOpen`, `onClose`, `onSettingsChange`

**三个面板**:

- **FileSettingsPanel**: 文件保存路径
- **LLMSettingsPanel**: LLM 提供商、API 配置、系统提示词
- **VersionSettingsPanel**: AI 自动版本快照开关（`autoVersionOnAIEdit`）

**特性**: 底部操作条（有修改时显示取消/保存）、供应商切换（OpenAI Responses/Chat Completions/DeepSeek）

### 4. ChatSidebar.tsx - 聊天侧边栏

**Props**: `isOpen`, `onClose`

**核心功能**:

- 模块化架构（12个独立子组件）
- 一体化布局：消息区 + 输入区
- 按钮组：新建聊天/历史对话（左）、版本管理/文件上传/发送（右）
- @ai-sdk/react: `useChat` hook + 流式响应
- Markdown 渲染（react-markdown）
- 工具状态卡片（进行中/成功/失败）
- 模型信息条（图标 + 模型名 + 时间戳）

#### 4.1 聊天子组件（app/components/chat/）

**核心组件**: ChatSessionHeader、ChatSessionMenu、MessageList、MessageItem、MessageContent、ChatInputArea、ChatInputActions

**辅助组件**: EmptyState、ErrorBanner（HeroUI Alert）、ToolCallCard、ThinkingBlock

**统一导出**: `app/components/chat/index.ts`

### 5. ThemeToggle.tsx - 主题切换

**功能**: 深色/浅色模式切换、localStorage 持久化、系统主题检测、平滑动画（300ms）、避免 SSR 闪烁

**实现**:

- 浅色：`class="light" data-theme="drawio2go"`
- 深色：`class="dark" data-theme="drawio2go-dark"`

### 6. TopBar.tsx - 顶部操作栏

**Props**: `selectionLabel`, `currentProjectName`, `onOpenProjectSelector`, `onLoad`, `onSave`, `isSidebarOpen`, `onToggleSidebar`

**布局**:

- 左侧：选区徽章（超长省略 + Tooltip）
- 中部：工程切换按钮（HeroUI Button variant secondary + 文件夹图标）
- 右侧：加载/保存 + ThemeToggle + 侧栏切换（PanelRightOpen/Close）

**环境差异**:

- Electron: 显示 `选中了X个对象`
- 浏览器: 固定文案 `网页无法使用该功能`

### 7. ProjectSelector.tsx - 工程选择模态

**Props**: `isOpen`, `onClose`, `currentProjectId`, `onSelectProject`, `projects`, `isLoading`, `onCreateProject`

**核心功能**:

- Skeleton 加载态（isLoading 时渲染 3 个占位卡片）
- 空状态引导
- 卡片样式：`Card.Root` + `Card.Content`，激活项加粗边框 + Check 图标
- 模态关闭时重置表单

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
