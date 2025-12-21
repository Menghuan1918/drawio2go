"use client";

import { useRef, useEffect, useState } from "react";
import { Skeleton } from "@heroui/react";
import { type LLMConfig, type ChatUIMessage } from "@/app/types/chat";
import EmptyState from "./EmptyState";
import MessageItem from "./MessageItem";

const SCROLL_BOTTOM_THRESHOLD = 50;
const ACTIVE_TOOL_STATES = new Set([
  "input-streaming",
  "input-available",
  "call",
]);

function getLastAssistantMessage(
  messages: ChatUIMessage[],
): ChatUIMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role === "assistant") return message;
  }
  return null;
}

function isLastPartActiveToolCall(messages: ChatUIMessage[]): boolean {
  const lastAssistantMessage = getLastAssistantMessage(messages);
  if (!lastAssistantMessage || lastAssistantMessage.parts.length === 0) {
    return false;
  }

  const lastPart =
    lastAssistantMessage.parts[lastAssistantMessage.parts.length - 1];

  if (typeof lastPart?.type !== "string") return false;
  if (!lastPart.type.startsWith("tool-")) return false;

  if (typeof lastPart?.state !== "string") return false;
  return ACTIVE_TOOL_STATES.has(lastPart.state);
}

function shouldSuppressPlaceholderByExistingIndicator(
  messages: ChatUIMessage[],
): boolean {
  const lastAssistantMessage = getLastAssistantMessage(messages);
  if (!lastAssistantMessage || lastAssistantMessage.parts.length === 0) {
    return false;
  }

  const lastPart =
    lastAssistantMessage.parts[lastAssistantMessage.parts.length - 1];
  const type = (lastPart as { type?: unknown }).type;

  // 1) 最后一个区域是活动工具调用：ToolCallCard 自己有扫描动画
  if (isLastPartActiveToolCall(messages)) return true;

  // 2) 最后一个区域是 text：MessageContent 会在末尾渲染 TypingIndicator
  if (type === "text") return true;

  // 3) 最后一个区域是 reasoning 且 streaming：ThinkingBlock 自带旋转图标
  const state = (lastPart as { state?: unknown }).state;
  if (type === "reasoning" && state === "streaming") return true;

  return false;
}

interface MessageListProps {
  messages: ChatUIMessage[];
  configLoading: boolean;
  llmConfig: LLMConfig | null;
  ensureMessageMetadata: (message: ChatUIMessage) => ChatUIMessage;
  status: string;
  expandedToolCalls: Record<string, boolean>;
  expandedThinkingBlocks: Record<string, boolean>;
  onToolCallToggle: (key: string) => void;
  onThinkingBlockToggle: (messageId: string) => void;
}

export default function MessageList({
  messages,
  configLoading,
  llmConfig,
  ensureMessageMetadata,
  status,
  expandedToolCalls,
  expandedThinkingBlocks,
  onToolCallToggle,
  onThinkingBlockToggle,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  const skeletonItems = Array.from({ length: 3 });

  // 监听消息内容与流式状态变化，自动滚动到底部（支持流式追加而不改变长度的场景）
  useEffect(() => {
    if (messages.length === 0 || !isAutoScrollEnabled) return;

    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }, 100);

    return () => clearTimeout(timer);
  }, [isAutoScrollEnabled, messages, status]);

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const distanceToBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const isNearBottom = distanceToBottom < SCROLL_BOTTOM_THRESHOLD;

    setIsAutoScrollEnabled((prev) => {
      if (isNearBottom && !prev) return true;
      if (!isNearBottom && prev) return false;
      return prev;
    });
  };

  // 渲染空状态
  if (configLoading) {
    return (
      <div className="messages-scroll-area">
        {skeletonItems.map((_, index) => (
          <div key={`message-skeleton-${index}`} className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4 rounded-lg" />
              <Skeleton className="h-4 w-1/2 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!llmConfig) {
    return <EmptyState type="no-config" />;
  }

  if (messages.length === 0) {
    return <EmptyState type="no-messages" />;
  }

  // 检查是否正在流式传输且需要显示临时AI消息
  const isStreaming = status === "submitted" || status === "streaming";
  const lastMessage = messages[messages.length - 1];
  const shouldShowPlaceholderAI =
    isStreaming &&
    (lastMessage?.role === "user" ||
      (lastMessage?.role === "assistant" &&
        !shouldSuppressPlaceholderByExistingIndicator(messages)));

  // 识别当前正在流式生成的消息
  const getCurrentStreamingMessageId = () => {
    if (!isStreaming) return null;
    if (lastMessage?.role === "assistant") return lastMessage.id;
    return "temp-ai-placeholder";
  };
  const currentStreamingMessageId = getCurrentStreamingMessageId();

  // 创建临时的空白AI消息（用于显示打字指示器）
  const placeholderAIMessage = ensureMessageMetadata({
    id: "temp-ai-placeholder",
    role: "assistant",
    parts: [{ type: "text", text: "" }],
    metadata: {
      // 占位符不直接写入 modelName，统一交给 ensureMessageMetadata 使用 fallbackModelName 回退
      createdAt: Date.now(),
    },
  });

  // 渲染消息列表
  return (
    <div
      className="messages-scroll-area"
      ref={scrollContainerRef}
      onScroll={handleScroll}
    >
      {messages.map((message) => (
        <MessageItem
          key={message.id}
          message={message}
          status={status}
          isCurrentStreaming={message.id === currentStreamingMessageId}
          expandedToolCalls={expandedToolCalls}
          expandedThinkingBlocks={expandedThinkingBlocks}
          onToolCallToggle={onToolCallToggle}
          onThinkingBlockToggle={onThinkingBlockToggle}
        />
      ))}
      {/* 流式传输时显示临时AI消息（带打字指示器） */}
      {shouldShowPlaceholderAI && (
        <MessageItem
          key="temp-ai-placeholder"
          message={placeholderAIMessage}
          status={status}
          isCurrentStreaming={true}
          expandedToolCalls={expandedToolCalls}
          expandedThinkingBlocks={expandedThinkingBlocks}
          onToolCallToggle={onToolCallToggle}
          onThinkingBlockToggle={onThinkingBlockToggle}
        />
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
