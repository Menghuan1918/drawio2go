# React 组件库

## 概述

基于 React 19 + HeroUI v3 (Alpha) 构建的 DrawIO 编辑器界面组件，采用复合组件模式。

## 核心组件

### 1. DrawioEditorNative.tsx
**主要 DrawIO 编辑器** - 原生 iframe + PostMessage 实现

#### 技术实现
- **iframe URL**: `https://embed.diagrams.net/?embed=1&proto=json&ui=kennedy`
- **通信协议**: PostMessage API
- **安全检查**: 验证 `event.origin.includes('diagrams.net')`
- **状态管理**: useRef 追踪 XML 变化

#### 消息协议
```typescript
// 发送消息
{action: 'load', xml: string, autosave: true}

// 接收消息
{event: 'init'|'save'|'autosave'|'export', ...}
```

#### Props
```typescript
interface DrawioEditorNativeProps {
  initialXml?: string;           // 初始 XML 数据
  onSave?: (xml: string) => void; // 保存回调
}
```

### 2. DrawioEditor.tsx
**备用编辑器** - react-drawio 组件实现

当原生 iframe 方案不可用时使用，提供基本兼容性。

### 3. UnifiedSidebar.tsx
**统一侧边栏容器** - 可调整宽度的侧边栏框架

#### 特性
- **可调整宽度**: 拖拽左边缘调整 (300-800px)
- **持久化**: 宽度保存到 localStorage
- **CSS 变量**: `--sidebar-width` 动态更新
- **内容切换**: 支持设置和聊天内容切换

#### Props
```typescript
interface UnifiedSidebarProps {
  isOpen: boolean;                                    // 是否打开
  activeSidebar: "none" | "settings" | "chat";       // 当前显示的内容
  onClose: () => void;                                // 关闭回调
  onSettingsChange?: (settings: {defaultPath: string}) => void; // 设置变更
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
  isOpen: boolean;                                    // 是否打开
  onClose: () => void;                                // 关闭回调
  onSettingsChange?: (settings: {defaultPath: string}) => void; // 设置变更
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

#### Props
```typescript
interface ChatSidebarProps {
  isOpen: boolean;     // 是否打开
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
- **ErrorBanner**: 错误提示横幅组件
- **ToolCallCard**: 工具调用状态卡片组件
- **ThinkingBlock**: AI 思考框组件（展示推理过程）

#### 常量和工具
- **constants/**: 工具常量和 Markdown 组件定义
- **utils/**: 工具函数和文件操作函数

#### 统一导出
所有组件通过 `app/components/chat/index.ts` 统一导出，提供清晰的导入接口。

### 6. BottomBar.tsx
**底部工具栏** - 主要操作按钮

#### Props
```typescript
interface BottomBarProps {
  onToggleSettings?: () => void;  // 切换设置侧栏
  onToggleChat?: () => void;      // 切换聊天侧栏
  onSave?: () => void;            // 保存按钮
  onLoad?: () => void;            // 加载按钮
  activeSidebar?: "none" | "settings" | "chat"; // 当前激活的侧栏
  selectionLabel?: string;        // GitHub 按钮右侧的状态文案（选区数量或降级提示）
}
```

#### 状态显示
- **Electron 环境**: 底栏通过 IPC 注入脚本监听 DrawIO 选区变化，实时显示 `选中了X个对象`
- **浏览器环境**: 沙箱限制导致无法获取选区，底栏展示 `网页无法使用该功能`

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
- **持久化**: localStorage
- **跨组件通信**: props + 回调函数

### 错误处理
- Try-catch 包装异步操作
- 用户友好的错误提示
- 降级方案（如 DrawioEditor 备用方案）
