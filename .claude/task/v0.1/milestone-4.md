# 里程碑 4：聊天 UI 集成

**状态**：✅ 已完成
**预计耗时**：60 分钟
**依赖**：里程碑 1, 3

## 目标

更新 ChatSidebar 组件，连接到新的 Agent API 并展示工具调用过程，集成 Socket.IO 连接状态

## 任务清单

### 1. 集成自定义 LLM Config Hook

- [x] 使用 `useLLMConfig` 自定义 Hook：

  ```typescript
  import { useLLMConfig } from "@/app/hooks/useLLMConfig";

  const {
    config: llmConfig,
    isLoading: configLoading,
    error: configError,
  } = useLLMConfig();
  ```

### 2. 更新 useChat hook 配置

- [x] 修改 `useChat` 调用，集成 Socket.IO 状态：

  ```typescript
  const { messages, sendMessage, status, error: chatError } = useChat();

  const submitMessage = async () => {
    if (!input.trim() || !llmConfig || configLoading || isChatStreaming) {
      return;
    }

    try {
      await sendMessage(
        { text: input.trim() },
        {
          body: { llmConfig },
        },
      );
      setInput("");
    } catch (error) {
      console.error("[ChatSidebar] 发送消息失败:", error);
    }
  };
  ```

### 3. 实现高级工具调用可视化

- [x] 创建完整的工具调用卡片组件系统：

  ```typescript
  // 工具调用状态元数据
  const TOOL_STATUS_META: Record<
    string,
    {
      label: string;
      icon: string;
      tone: "pending" | "success" | "error" | "info";
    }
  > = {
    "input-streaming": { label: "准备中", icon: "⏳", tone: "pending" },
    "input-available": { label: "等待执行", icon: "🛠️", tone: "pending" },
    "output-available": { label: "成功", icon: "✅", tone: "success" },
    "output-error": { label: "失败", icon: "⚠️", tone: "error" },
  };

  // 工具调用卡片组件
  const ToolCallCard = ({ part, expanded, onToggle }: ToolCallCardProps) => {
    // 支持展开/收起，显示详细参数和结果
  };
  ```

- [x] 使用 AI SDK 的 parts 系统渲染消息：

  ```typescript
  {message.parts.map((part, index) => {
    if (part.type === "text") {
      return (
        <div key={`${message.id}-${index}`} className="message-markdown">
          <ReactMarkdown components={markdownComponents}>
            {part.text ?? ""}
          </ReactMarkdown>
        </div>
      );
    }

    // 处理动态工具调用
    const normalizedPart: ToolMessagePart =
      part.type === "dynamic-tool"
        ? { ...part, type: `tool-${part.toolName}` }
        : (part as ToolMessagePart);

    if (normalizedPart.type?.startsWith("tool-")) {
      return (
        <ToolCallCard
          key={expansionKey}
          part={normalizedPart}
          expanded={isExpanded}
          onToggle={() => setExpandedToolCalls(prev => ({ ...prev, [expansionKey]: !prev[expansionKey] }))}
        />
      );
    }
  })}
  ```

### 4. 集成 Socket.IO 连接状态

- [x] 在页面组件中初始化 Socket.IO：

  ```typescript
  // 在 app/page.tsx 中
  import { useDrawioSocket } from "./hooks/useDrawioSocket";

  const { isConnected } = useDrawioSocket();
  ```

### 5. 实现智能状态管理

- [x] 多层次状态检查和处理：

  ```typescript
  // 配置加载状态
  {configLoading ? (
    <div className="empty-state">
      <div className="empty-icon">⏳</div>
      <p className="empty-text">正在加载 LLM 配置</p>
      <p className="empty-hint">请稍候...</p>
    </div>
  ) : !llmConfig ? (
    <div className="empty-state">
      <div className="empty-icon">⚙️</div>
      <p className="empty-text">尚未配置 AI 供应商</p>
      <p className="empty-hint">请在设置中保存连接参数后重试</p>
    </div>
  ) : messages.length === 0 ? (
    <div className="empty-state">
      <div className="empty-icon">💬</div>
      <p className="empty-text">开始与 AI 助手对话</p>
      <p className="empty-hint">输入消息开始聊天</p>
    </div>
  ) : (
    // 消息列表
  )}
  ```

- [x] 智能错误处理和状态显示：

  ```typescript
  const combinedError = configError || chatError?.message || null;

  {combinedError && (
    <div className="error-banner">
      <span className="error-icon">⚠️</span>
      <div className="error-content">
        <div className="error-title">无法发送请求</div>
        <div className="error-message">{combinedError}</div>
        <button className="error-retry" type="button" onClick={() => window.location.reload()}>
          刷新页面
        </button>
      </div>
    </div>
  )}
  ```

### 6. 高级输入控件

- [x] 支持多行输入和快捷键：

  ```typescript
  <textarea
    placeholder="描述你想要对图表进行的修改，或上传（粘贴）图像来复制图表..."
    value={input}
    onChange={(event) => setInput(event.target.value)}
    className="chat-input-textarea"
    rows={3}
    disabled={configLoading || !llmConfig}
    onKeyDown={(event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submitMessage();
      }
    }}
  />
  ```

- [x] 智能按钮状态管理：

  ```typescript
  const isSendDisabled = !input.trim() || isChatStreaming || configLoading || !llmConfig;

  <Button
    type="submit"
    variant="primary"
    size="sm"
    isDisabled={isSendDisabled}
    className="chat-send-button button-primary"
  >
    <svg>...</svg>
    {isChatStreaming ? "发送中..." : "发送"}
  </Button>
  ```

### 7. 集成 Markdown 渲染

- [x] 使用 ReactMarkdown 支持富文本消息：

  ```typescript
  import ReactMarkdown, { type Components as MarkdownComponents } from "react-markdown";

  const markdownComponents: MarkdownComponents = {
    a({ node, ...props }) {
      return <a {...props} className="message-link" target="_blank" rel="noopener noreferrer" />;
    },
    code({ node, className, children, ...props }) {
      // 支持内联代码和代码块
    },
    blockquote({ node, ...props }) {
      return <blockquote className="message-quote" {...props} />;
    },
  };
  ```

## 验收标准

- [x] 聊天界面能正确连接到 `/api/chat`
- [x] 使用 `useLLMConfig` Hook 管理配置状态
- [x] 多层次状态检查（配置加载、配置存在、消息列表）
- [x] Socket.IO 连接状态正确集成
- [x] 用户消息正确显示
- [x] AI 回复支持 Markdown 渲染
- [x] 工具调用卡片支持展开/收起
- [x] 工具状态包含准备中、等待执行、成功、失败等状态
- [x] 智能错误处理包含配置错误和聊天错误
- [x] 发送按钮智能状态管理
- [x] 消息自动滚动到底部
- [x] 支持 Enter 快捷键发送

## 实际增强功能

- ✅ **高级工具调用可视化**：可展开的工具调用卡片，支持状态追踪
- ✅ **Markdown 渲染支持**：富文本消息显示，支持代码块、链接等
- ✅ **多层次状态管理**：配置加载、配置验证、聊天状态等
- ✅ **Socket.IO 集成**：实时工具执行状态反馈
- ✅ **智能错误处理**：分类错误处理和用户友好的错误提示
- ✅ **可访问性支持**：工具调用卡片支持键盘导航和屏幕阅读器

## 测试步骤

1. 确保服务器启动（`pnpm run dev`）
2. 配置 LLM 设置（API Key、模型等）
3. 打开聊天侧边栏，验证 Socket.IO 连接
4. 发送基础消息测试 Markdown 渲染
5. 发送工具调用请求（如"获取当前图表 XML"）
6. 测试工具调用卡片的展开/收起功能
7. 验证各种工具状态的正确显示
8. 测试错误情况（配置错误、Socket.IO 断开等）
9. 验证 Enter 快捷键和发送按钮状态

## 注意事项

- **Socket.IO 依赖**：确保 `useDrawioSocket` 正确初始化
- **工具执行环境**：工具调用需要浏览器环境支持
- **状态同步**：配置状态和聊天状态需要正确同步
- **可访问性**：工具调用卡片支持键盘导航
- **性能优化**：长消息内容支持虚拟滚动

---

**下一步**：完成后继续 [里程碑 5：类型定义与优化](./milestone-5.md)
