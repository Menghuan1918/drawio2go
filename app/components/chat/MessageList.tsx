"use client";

import { useRef } from "react";
import { type LLMConfig } from "@/app/types/chat";
import type { UIMessage } from "ai";
import EmptyState from "./EmptyState";
import MessageItem from "./MessageItem";

interface MessageListProps {
  messages: UIMessage[];
  configLoading: boolean;
  llmConfig: LLMConfig | null;
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
  status,
  expandedToolCalls,
  expandedThinkingBlocks,
  onToolCallToggle,
  onThinkingBlockToggle,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // 监听消息变化，自动滚动到底部
  if (messages.length > 0) {
    setTimeout(scrollToBottom, 100);
  }

  // 渲染空状态
  if (configLoading) {
    return <EmptyState type="loading" />;
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
  const shouldShowPlaceholderAI = isStreaming && lastMessage?.role === "user";

  // 识别当前正在流式生成的消息
  const currentStreamingMessageId = isStreaming
    ? lastMessage?.role === "assistant"
      ? lastMessage.id
      : "temp-ai-placeholder"
    : null;

  // 创建临时的空白AI消息（用于显示打字指示器）
  const placeholderAIMessage: UIMessage = {
    id: "temp-ai-placeholder",
    role: "assistant",
    parts: [
      {
        type: "text",
        text: "",
      },
    ],
  };

  // 渲染消息列表
  return (
    <div className="messages-scroll-area">
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
