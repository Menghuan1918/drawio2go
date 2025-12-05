# Chat 组件模块 (AGENTS.md)

## 模块概述

`app/components/chat/` 目录包含了整个聊天对话系统的 React 组件。该模块涵盖消息展示、用户输入、工具调用、历史记录等全面的对话功能，支持流式响应、思考过程展示、工具执行追踪等高级特性。

**关键特性：**

- 流式消息渲染和自动滚动
- AI 思考过程可视化
- 工具调用展示和状态追踪
- 对话历史搜索、筛选和管理
- Markdown 渲染和代码块支持
- 国际化支持（中英文）

---

## 核心组件列表

| 组件                    | 职责             | 关键功能                                                  |
| ----------------------- | ---------------- | --------------------------------------------------------- |
| **MessageList**         | 消息列表容器     | 渲染所有消息，自动滚动，加载状态，流式占位符              |
| **MessageItem**         | 单条消息包装     | 消息元数据（模型名、时间戳），角色区分（用户/AI）         |
| **MessageContent**      | 消息内容渲染引擎 | 分发文本、推理、工具调用等部分的渲染                      |
| **ToolCallCard**        | 工具调用卡片     | 展示工具调用的输入/输出/错误，支持展开/折叠，复制功能     |
| **ThinkingBlock**       | 思考过程块       | 展示 AI 思考过程（推理），流式状态动画，展开/折叠         |
| **ChatInputArea**       | 输入区域         | 多行文本框，表单处理，按 Enter 发送，支持内联模型选择槽位 |
| **ChatInputActions**    | 输入操作按钮组   | 新建聊天、历史记录、发送/取消按钮，模型选择器内联于左侧   |
| **ChatSessionHeader**   | 会话头部         | 会话标题、消息数、保存状态、历史/导出/删除按钮            |
| **ChatSessionMenu**     | 会话菜单         | 切换会话列表（可能在侧边栏中使用）                        |
| **ChatHistoryView**     | 历史记录视图     | 搜索/筛选对话、日期范围、批量操作、预览                   |
| **HistoryToolbar**      | 历史工具栏       | 搜索框、日期选择、批量操作切换、全选/清除                 |
| **ConversationList**    | 对话列表         | 显示过滤后的对话卡片，选择模式，预览和打开操作            |
| **MessagePreviewPanel** | 消息预览面板     | 侧边栏预览对话内容，显示消息角色和内容                    |
| **EmptyState**          | 空状态占位符     | 加载中、未配置、无消息三种状态提示                        |
| **TypingIndicator**     | 打字指示器       | 流式输出时的动画指示                                      |
| **ModelComboBox**       | 模型选择器       | 按供应商分组的模型下拉/搜索，支持禁用、加载态和默认标记   |

---

## 核心功能说明

### 消息流水线

1. **MessageList** 维护所有消息并处理自动滚动
2. **MessageItem** 包装单条消息，添加角色和元数据
3. **MessageContent** 根据消息部分类型（text/reasoning/tool）路由到不同渲染器
4. **ToolCallCard** 展示工具调用的详细状态和数据
5. **ThinkingBlock** 展示推理过程

### 流式响应处理

- `MessageList` 监听 `status` 属性（"submitted" | "streaming"）
- 当用户刚发送消息时，创建临时占位符 AI 消息
- 消息最后的 `TypingIndicator` 显示正在输出的状态
- 流式完成后自动移除占位符

### 历史记录管理

1. **ChatHistoryView** 是历史视图的主容器
2. **HistoryToolbar** 提供搜索、日期筛选、批量操作
3. **ConversationList** 渲染过滤后的对话列表
4. **MessagePreviewPanel** 在侧边栏展示对话内容预览

### 工具调用追踪

- **ToolCallCard** 展示单个工具调用的完整生命周期
- 状态转换：input-streaming → input-available → output-available (或 output-error)
- 支持展开查看输入参数、执行结果、错误信息
- 复制功能便于调试

---

## 组件间关系

```
ChatHistoryView（历史视图容器）
├── HistoryToolbar（搜索、筛选、批量操作）
├── ConversationList（过滤后的对话列表）
│   └── Conversation Item（单个对话卡片）
└── MessagePreviewPanel（侧边栏预览）

MessageList（消息列表容器）
├── MessageItem（单条消息）
│   └── MessageContent（内容分发器）
│       ├── ThinkingBlock（推理过程）
│       ├── Markdown Text（文本内容）
│       └── ToolCallCard（工具调用卡片）
│           ├── 输入参数
│           ├── 执行结果
│           └── 错误信息
└── Placeholder Message（流式占位符，带 TypingIndicator）

ChatInputArea（输入组件）
└── ChatInputActions（按钮组）
```

---

## 使用示例

### 基础消息列表

```tsx
import { MessageList, ChatInputArea } from "@/app/components/chat";

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatUIMessage[]>([]);
  const [input, setInput] = useState("");
  const [expandedToolCalls, setExpandedToolCalls] = useState({});
  const [expandedThinkingBlocks, setExpandedThinkingBlocks] = useState({});

  return (
    <>
      <MessageList
        messages={messages}
        configLoading={false}
        llmConfig={config}
        status="idle"
        expandedToolCalls={expandedToolCalls}
        expandedThinkingBlocks={expandedThinkingBlocks}
        onToolCallToggle={(key) => {
          setExpandedToolCalls((prev) => ({
            ...prev,
            [key]: !prev[key],
          }));
        }}
        onThinkingBlockToggle={(messageId) => {
          setExpandedThinkingBlocks((prev) => ({
            ...prev,
            [messageId]: !prev[messageId],
          }));
        }}
      />
      <ChatInputArea
        input={input}
        setInput={setInput}
        isChatStreaming={false}
        configLoading={false}
        llmConfig={config}
        error={null}
        onSubmit={handleSubmit}
        onNewChat={handleNewChat}
        onHistory={handleShowHistory}
      />
    </>
  );
}
```

### 历史记录视图

```tsx
import { ChatHistoryView } from "@/app/components/chat";

export function HistoryModal() {
  const [conversations, setConversations] = useState<Conversation[]>([]);

  return (
    <ChatHistoryView
      conversations={conversations}
      onSelectConversation={async (id) => {
        // 加载并切换到该对话
      }}
      onBack={closeHistory}
      onDeleteConversations={async (ids) => {
        // 删除对话
      }}
      onExportConversations={async (ids) => {
        // 导出对话
      }}
    />
  );
}
```

---

## 工具和常量

### 工具函数 (`utils/toolUtils.ts`)

- `getToolTitle(type, t)` - 获取工具调用标题（传入 i18n 的 t 确保多语言）
- `getToolSummary(part, t)` - 获取工具状态摘要（含输入/输出字节、错误信息）
- `getToolStatusMeta(state, t)` - 获取工具状态元数据（图标、标签、样式）
- `getToolExpansionKey(...)` - 生成工具卡片展开状态的唯一键

### 工具常量 (`constants/toolConstants.ts`)

- `TOOL_LABEL_KEYS` - 工具名称映射（支持 drawio_read、drawio_edit_batch、drawio_overwrite）
- `TOOL_STATUS_META` - 工具状态元数据定义（包含 Icon、labelKey、tone）
- `ToolMessagePart` - 工具消息部分的类型定义

### Markdown 组件 (`constants/markdownComponents.tsx`)

- 自定义的 Markdown 渲染器，支持代码块、链接、强调等

---

## 类型定义

来自 `@/app/types/chat`：

```typescript
interface ChatUIMessage {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  metadata?: MessageMetadata;
}

interface MessagePart {
  type: "text" | "reasoning" | "dynamic-tool" | "tool-*";
  text?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

interface ToolInvocation {
  toolCallId: string;
  toolName: string;
  input: unknown;
  output?: unknown;
  errorText?: string;
  state:
    | "input-streaming"
    | "input-available"
    | "output-available"
    | "output-error";
}
```

---

## 限制与注意事项

1. **流式处理** - 组件依赖外部维护流式状态，组件本身无网络通信能力
2. **国际化** - 使用 `useAppTranslation` hook，需要对应的 i18n 配置
3. **工具调用展开状态** - 通过外部状态管理，组件不保持内部状态
4. **滚动性能** - 大量消息时可考虑虚拟化优化
5. **样式依赖** - 依赖全局 CSS 类名（message、tool-call-card、thinking-block 等）

---

## 文件结构

```
app/components/chat/
├── index.ts                      # 模块导出
├── MessageList.tsx               # 消息列表容器
├── MessageItem.tsx               # 单条消息包装
├── MessageContent.tsx            # 内容分发器
├── ToolCallCard.tsx              # 工具调用卡片
├── ThinkingBlock.tsx             # 思考过程块
├── ChatInputArea.tsx             # 输入区域
├── ChatInputActions.tsx          # 输入操作按钮
├── ChatSessionHeader.tsx         # 会话头部
├── ChatSessionMenu.tsx           # 会话菜单
├── ChatHistoryView.tsx           # 历史记录视图
├── HistoryToolbar.tsx            # 历史工具栏
├── ConversationList.tsx          # 对话列表
├── MessagePreviewPanel.tsx       # 消息预览面板
├── EmptyState.tsx                # 空状态提示
├── TypingIndicator.tsx           # 打字指示器
├── typing-indicator.css          # 打字动画样式
├── utils/
│   ├── toolUtils.ts              # 工具调用工具函数
│   ├── fileOperations.ts         # 文件操作相关
│   └── fileExport.ts             # 文件导出相关
└── constants/
    ├── toolConstants.ts          # 工具相关常量
    └── markdownComponents.tsx    # Markdown 自定义渲染器
```

---

**最后更新:** 2025年11月30日
