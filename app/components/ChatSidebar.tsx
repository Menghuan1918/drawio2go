"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { Button, TooltipContent, TooltipRoot } from "@heroui/react";
import ReactMarkdown, { type Components as MarkdownComponents } from "react-markdown";
import { useLLMConfig } from "@/app/hooks/useLLMConfig";

const TOOL_LABELS: Record<string, string> = {
  "tool-get_drawio_xml": "获取 DrawIO XML",
  "tool-replace_drawio_xml": "完全替换 DrawIO XML",
  "tool-batch_replace_drawio_xml": "批量替换 DrawIO XML",
};

const TOOL_STATUS_META: Record<
  string,
  { label: string; icon: string; tone: "pending" | "success" | "error" | "info" }
> = {
  "input-streaming": { label: "准备中", icon: "⏳", tone: "pending" },
  "input-available": { label: "等待执行", icon: "🛠️", tone: "pending" },
  "output-available": { label: "成功", icon: "✅", tone: "success" },
  "output-error": { label: "失败", icon: "⚠️", tone: "error" },
};

type ToolMessagePart = {
  type: string;
  state: string;
  toolCallId?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  [key: string]: unknown;
};

const getToolTitle = (type: string) => {
  if (TOOL_LABELS[type]) {
    return TOOL_LABELS[type];
  }

  if (type.startsWith("tool-")) {
    return type.replace("tool-", "");
  }

  return type;
};

const markdownComponents: MarkdownComponents = {
  a({ node, ...props }) {
    return (
      <a
        {...props}
        className="message-link"
        target="_blank"
        rel="noopener noreferrer"
      />
    );
  },
  code({ node, className, children, ...props }) {
    const content = String(children).replace(/\n$/, "");
    const isInline = !className?.includes('language-');

    if (isInline) {
      return (
        <code className={`inline-code ${className ?? ""}`.trim()} {...props}>
          {content}
        </code>
      );
    }

    return (
      <pre className={`code-block ${className ?? ""}`.trim()}>
        <code>{content}</code>
      </pre>
    );
  },
  blockquote({ node, ...props }) {
    return <blockquote className="message-quote" {...props} />;
  },
  ul({ node, ...props }) {
    return <ul className="message-list" {...props} />;
  },
  ol({ node, ...props }) {
    return <ol className="message-list message-list-ordered" {...props} />;
  },
};

const getToolSummary = (part: ToolMessagePart) => {
  switch (part.state) {
    case "input-streaming":
      return "AI 正在准备工具参数";
    case "input-available":
      return "等待客户端执行工具";
    case "output-available":
      return "工具执行完成";
    case "output-error":
      return part.errorText ?? "工具执行失败";
    default:
      return "工具状态更新";
  }
};

interface ToolCallCardProps {
  part: ToolMessagePart;
  expanded: boolean;
  onToggle: () => void;
}

const ToolCallCard = ({ part, expanded, onToggle }: ToolCallCardProps) => {
  const title = getToolTitle(part.type);
  const meta = TOOL_STATUS_META[part.state] ?? {
    label: "未知状态",
    icon: "ℹ️",
    tone: "info" as const,
  };

  const showInput = Boolean(part.input);
  const showOutput = Boolean(part.output);

  return (
    <div
      className={`tool-call-card tool-call-card--${meta.tone} ${
        expanded ? "tool-call-card--expanded" : ""
      }`.trim()}
    >
      <button type="button" className="tool-call-header" onClick={onToggle}>
        <div className="tool-call-title">{title}</div>
        <div className="tool-call-status">
          <span className="tool-call-status-icon" aria-hidden>{meta.icon}</span>
          <span className="tool-call-status-label">{meta.label}</span>
          <svg
            className={`tool-call-chevron ${expanded ? "tool-call-chevron--open" : ""}`.trim()}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>
      <div className="tool-call-summary">{getToolSummary(part)}</div>
      {expanded ? (
        <div className="tool-call-body">
          {part.state === "output-error" && (
            <div className="tool-call-error-text">{part.errorText ?? "未知错误"}</div>
          )}
          {showInput && (
            <div className="tool-call-section">
              <div className="tool-call-section-title">输入参数</div>
              <pre className="tool-call-json">
                {JSON.stringify(part.input, null, 2)}
              </pre>
            </div>
          )}
          {showOutput && (
            <div className="tool-call-section">
              <div className="tool-call-section-title">执行结果</div>
              <pre className="tool-call-json">
                {JSON.stringify(part.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};

interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChatSidebar({ isOpen, onClose }: ChatSidebarProps) {
  const [input, setInput] = useState("");
  const [expandedToolCalls, setExpandedToolCalls] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { config: llmConfig, isLoading: configLoading, error: configError } = useLLMConfig();

  const { messages, sendMessage, status, error: chatError } = useChat();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const isChatStreaming = status === "submitted" || status === "streaming";

  const submitMessage = async () => {
    if (!input.trim() || !llmConfig || configLoading || isChatStreaming) {
      return;
    }

    try {
      await sendMessage({ text: input.trim() }, {
        body: { llmConfig },
      });
      setInput("");
    } catch (error) {
      console.error("[ChatSidebar] 发送消息失败:", error);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitMessage();
  };

  const handleNewChat = () => {
    console.log("新建聊天");
    // TODO: 清空当前对话，开始新对话
  };

  const handleHistory = () => {
    console.log("打开历史对话");
    // TODO: 显示历史对话列表
  };

  const handleVersionControl = () => {
    console.log("版本管理");
    // TODO: 打开版本管理界面
  };

  const handleFileUpload = () => {
    console.log("文件上传");
    // TODO: 打开文件选择器
  };

  const isSendDisabled =
    !input.trim() || isChatStreaming || configLoading || !llmConfig;

  const combinedError = configError || chatError?.message || null;

  return (
    <div className="chat-sidebar-content">
      {/* 消息内容区域 - 无分隔线一体化设计 */}
      <div className="chat-messages-area">
        <div className="messages-scroll-area">
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
            messages.map((message) => (
              <div
                key={message.id}
                className={`message ${
                  message.role === "user" ? "message-user" : "message-ai"
                }`}
              >
                <div className="message-header">
                  <span className="message-role">
                    {message.role === "user" ? "你" : "AI"}
                  </span>
                  <span className="message-time">
                    {new Date().toLocaleTimeString("zh-CN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="message-content">
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

                    const normalizedPart: ToolMessagePart =
                      part.type === "dynamic-tool"
                        ? {
                            ...part,
                            type: `tool-${part.toolName}`,
                          }
                        : (part as ToolMessagePart);

                    if (
                      typeof normalizedPart.type === "string" &&
                      normalizedPart.type.startsWith("tool-")
                    ) {
                      const baseKey = normalizedPart.toolCallId
                        ? String(normalizedPart.toolCallId)
                        : `${message.id}-${index}`;
                      const expansionKey = `${baseKey}-${normalizedPart.state}`;
                      const isExpanded =
                        expandedToolCalls[expansionKey] ??
                        normalizedPart.state === "output-error";

                      return (
                        <ToolCallCard
                          key={expansionKey}
                          part={normalizedPart}
                          expanded={isExpanded}
                          onToggle={() =>
                            setExpandedToolCalls((prev) => ({
                              ...prev,
                              [expansionKey]: !isExpanded,
                            }))
                          }
                        />
                      );
                    }
                    return null;
                  })}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 底部输入区域 - 一体化设计 */}
      <div className="chat-input-area">
        {combinedError && (
          <div className="error-banner">
            <span className="error-icon">⚠️</span>
            <div className="error-content">
              <div className="error-title">无法发送请求</div>
              <div className="error-message">{combinedError}</div>
              <button
                className="error-retry"
                type="button"
                onClick={() => window.location.reload()}
              >
                刷新页面
              </button>
            </div>
          </div>
        )}
        <form onSubmit={handleSubmit} className="chat-input-container">
          {/* 多行文本输入框 */}
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

          {/* 按钮组 */}
          <div className="chat-input-actions">
            {/* 左侧按钮组 */}
            <div className="chat-actions-left">
              <TooltipRoot delay={0}>
                <Button
                  size="sm"
                  variant="ghost"
                  isIconOnly
                  onPress={handleNewChat}
                  className="chat-icon-button"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                  </svg>
                </Button>
                <TooltipContent placement="top">
                  <p>新建聊天</p>
                </TooltipContent>
              </TooltipRoot>

              <TooltipRoot delay={0}>
                <Button
                  size="sm"
                  variant="ghost"
                  isIconOnly
                  onPress={handleHistory}
                  className="chat-icon-button"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 3v5h5"></path>
                    <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"></path>
                    <path d="M12 7v5l4 2"></path>
                  </svg>
                </Button>
                <TooltipContent placement="top">
                  <p>历史对话</p>
                </TooltipContent>
              </TooltipRoot>
            </div>

            {/* 右侧按钮组 */}
            <div className="chat-actions-right">
              <TooltipRoot delay={0}>
                <Button
                  size="sm"
                  variant="ghost"
                  isIconOnly
                  onPress={handleVersionControl}
                  className="chat-icon-button"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="18" cy="18" r="3"></circle>
                    <circle cx="6" cy="6" r="3"></circle>
                    <path d="M13 6h3a2 2 0 0 1 2 2v7"></path>
                    <line x1="6" y1="9" x2="6" y2="21"></line>
                  </svg>
                </Button>
                <TooltipContent placement="top">
                  <p>版本管理</p>
                </TooltipContent>
              </TooltipRoot>

              <TooltipRoot delay={0}>
                <Button
                  size="sm"
                  variant="ghost"
                  isIconOnly
                  onPress={handleFileUpload}
                  className="chat-icon-button"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                  </svg>
                </Button>
                <TooltipContent placement="top">
                  <p>文件上传</p>
                </TooltipContent>
              </TooltipRoot>

              <Button
                type="submit"
                variant="primary"
                size="sm"
                isDisabled={isSendDisabled}
                className="chat-send-button button-primary"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
                {isChatStreaming ? "发送中..." : "发送"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
