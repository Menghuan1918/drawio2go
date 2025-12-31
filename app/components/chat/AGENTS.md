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
| **ImageContent**        | 图片内容渲染     | 用户附件图片的懒加载渲染、加载态/错误态、点击全屏预览     |
| **ImagePreview**        | 全屏图片预览弹层 | 遮罩层预览、ESC/点击背景关闭、下载                        |
| **ToolCallCard**        | 工具调用卡片     | 展示工具调用的输入/输出/错误，支持展开/折叠，复制功能     |
| **ThinkingBlock**       | 思考过程块       | 展示 AI 思考过程（推理），流式状态动画，展开/折叠         |
| **ModelComboBox**       | 模型选择器       | 按供应商分组的模型下拉/搜索，支持禁用、加载态和默认标记   |
| **ChatInputArea**       | 输入区域         | 多行文本框，表单处理，按 Enter 发送                       |
| **CanvasContextButton** | 画布增强按钮     | 弹出配置：画布上下文注入 + 布局检查（批量编辑后附加警告） |
| **PageSelectorButton**  | 页面选择器按钮   | 选择 AI 生效页面范围（多选/全选），用于后续工具执行       |
| **SkillButton**         | 绘图技能按钮     | 配置绘图风格与知识类型（Dropdown + 单选/多选）            |
| **ChatTopActions**      | 顶部操作栏       | 技能/MCP/页面/模型选择入口（图标按钮）                    |
| **ChatInputActions**    | 输入操作按钮组   | 新建/历史/上传/发送/取消按钮                              |
| **ChatHistoryView**     | 历史记录视图     | 搜索/筛选对话、日期范围、批量操作、预览                   |
| **HistoryToolbar**      | 历史工具栏       | 搜索框、日期选择、批量操作切换、全选/清除                 |
| **ConversationList**    | 对话列表         | 显示过滤后的对话卡片，选择模式，预览和打开操作            |
| **EmptyState**          | 空状态占位符     | 加载中、未配置、无消息三种状态提示                        |
| **TypingIndicator**     | 打字指示器       | 流式输出时的动画指示                                      |
| **ChatShell**           | 布局壳层         | 统一包裹聊天/历史视图，承载顶部提示与导航                 |
| **MessagePane**         | 消息区容器       | 包装 MessageList，保持滚动与间距样式                      |
| **Composer**            | 输入区容器       | 聚合 ChatInputArea 的所有交互 props，简化父级组合         |

---

## 核心功能说明

### 消息流水线

1. **MessageList** 维护所有消息并处理自动滚动
2. **MessageItem** 包装单条消息，添加角色和元数据
3. **MessageContent** 根据消息部分类型（text/reasoning/tool）路由到不同渲染器
   - 图片类型（type="image"）由 **ImageContent** 渲染，并在内部使用 **ImagePreview** 提供全屏预览
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
└── ConversationList（过滤后的对话列表）
    └── Conversation Item（单个对话卡片）

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
├── ChatTopActions（顶部操作栏：技能/MCP/页面/模型选择）
└── ChatInputActions（按钮组：新建/历史/上传/发送/取消）
```

---

## 代码腐化清理记录

### 2025-12-22 清理

**执行的操作**：

- 删除 `fileOperations.ts` 的 3 个未使用函数（showOpenDialog、readFile、selectFile）
- 删除未被引用的 `ChatSessionMenu` 组件
- 统一事件处理：`ThinkingBlock`、`ConversationList` 改用 React Aria `usePress`

**影响文件**：约 4 个（ThinkingBlock.tsx、ConversationList.tsx、fileOperations.ts、ChatSessionMenu 等）

**下次关注**：

- ImagePreview/ImageContent 的内联样式待迁移到 CSS 文件
- useImageAttachments 的中文错误字符串待结构化

### 2025-12-19 清理（架构重构）

**执行的操作**：

- ChatSidebar 基于状态机与 hooks 重写（约 2117 → 1402 行，-715）
- 新增 hooks：`useChatMessages`、`useChatToolExecution`、`useChatNetworkControl`、`useChatLifecycle`
- 引入 `MessageSyncStateMachine` / `ChatRunStateMachine`，统一使用 `transition()` 管理状态
- 引入 `DrainableToolQueue`，工具调用串行化并支持超时/中止
- 统一卸载清理：beforeunload/pagehide 监听、队列 drain、锁释放与状态复位

**影响文件**：1 个主文件（ChatSidebar.tsx）+ 4 个新 hooks

**下次关注**：

- 观察新架构在生产环境中的稳定性与边界状态覆盖
- 状态机事件与 UI 提示的一致性（错误/离线/取消）

### 2025-12-08 清理

**执行的操作**：

- `ToolCallCard` 的展开/复制交互改用 `usePress`（@react-aria/interactions），移除遗留 `onClick`。
- `ToolCallCard` 样式迁移到 `app/styles/utilities/tool-calls.css`，删除内联样式与重复类。
- 复制按钮与展开按钮共享通用 pressProps，减少重复事件处理逻辑。

**影响文件**：2 个（ToolCallCard.tsx、styles/utilities/tool-calls.css）

**下次关注**：

- 观察移动端/触屏场景下的 `usePress` 触发体验，必要时补充按压反馈。
- 工具错误文案是否需要与全局 error-handler 再次对齐。

## 输入区 UX 规则

- 顶部操作栏（ChatTopActions）按钮自适应仅两档：**完整文本** / **标准圆图标**；缩放为渐进式（MCP → 画布上下文 → 样式 → 页面），由 `data-collapse-stage` 驱动（逻辑在 `app/components/chat/ChatInputActions.tsx`，样式在 `app/styles/components/chat.css`）。
- 页面选择器验证：未全选页面时，至少需要选择一个页面才能发送消息（通过 Toast 提示"请至少选择一个页面"）
- 禁止连续用户消息：最后一条消息为用户且未在流式时会禁用发送并提示等待
- 未配置任何供应商/模型：输入框与发送按钮禁用，并显示"请先配置模型"引导（可一键跳转到设置 → 模型）
- 直接重试：点击"重试上一条消息"按钮会移除该消息并回填输入框，不弹确认
- 成功重试后通过 Toast 轻量提示（国际化文案：retryTitle / retryDescription）
- 图片附件：ChatInputArea 负责上传/预览；真正发送由 ChatSidebar 负责（持久化附件并把 ImagePart 注入消息）

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
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [models, setModels] = useState<ModelConfig[]>([]);

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
        isOnline
        onSubmit={handleSubmit}
        onNewChat={handleNewChat}
        onHistory={handleShowHistory}
        onRetry={handleRetry}
        onCancel={handleCancel}
        isCanvasContextEnabled={false}
        onCanvasContextChange={(enabled) => {
          void enabled;
        }}
        isLayoutCheckEnabled={false}
        onLayoutCheckChange={(enabled) => {
          void enabled;
        }}
        canSendNewMessage
        lastMessageIsUser={false}
        modelSelectorProps={{
          providers,
          models,
          selectedModelId,
          onSelectModel: setSelectedModelId,
          isDisabled: false,
          isLoading: false,
          modelLabel:
            models.find((m) => m.id === selectedModelId)?.displayName ??
            "默认模型",
        }}
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

- `TOOL_LABEL_KEYS` - 工具名称映射（支持 drawio_read、drawio_edit_batch；历史消息可能仍包含 drawio_overwrite）
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
├── ChatInputActions.tsx          # 输入操作按钮（含顶部操作栏）
├── ModelComboBox.tsx             # 模型选择器
├── SkillButton.tsx               # 绘图技能按钮
├── ChatHistoryView.tsx           # 历史记录视图
├── HistoryToolbar.tsx            # 历史工具栏
├── ConversationList.tsx          # 对话列表
├── EmptyState.tsx                # 空状态提示
├── TypingIndicator.tsx           # 打字指示器
├── typing-indicator.css          # 打字动画样式
├── ChatShell.tsx                 # 聊天/历史视图外层容器
├── MessagePane.tsx               # 消息区容器（包装 MessageList）
├── Composer.tsx                  # 输入区容器（包装 ChatInputArea）
├── utils/
│   ├── toolUtils.ts              # 工具调用工具函数
│   ├── fileOperations.ts         # 文件操作相关
│   └── fileExport.ts             # 文件导出相关
└── constants/
    ├── toolConstants.ts          # 工具相关常量
    └── markdownComponents.tsx    # Markdown 自定义渲染器
```

---

**最后更新:** 2025年12月27日
