"use client";

import MessageContent from "./MessageContent";
import type { UIMessage } from "ai";

interface MessageItemProps {
  message: UIMessage;
  status: string;
  isCurrentStreaming?: boolean;
  expandedToolCalls: Record<string, boolean>;
  expandedThinkingBlocks: Record<string, boolean>;
  onToolCallToggle: (key: string) => void;
  onThinkingBlockToggle: (messageId: string) => void;
}

export default function MessageItem({
  message,
  status,
  isCurrentStreaming,
  expandedToolCalls,
  expandedThinkingBlocks,
  onToolCallToggle,
  onThinkingBlockToggle,
}: MessageItemProps) {
  return (
    <div
      className={`message ${
        message.role === "user" ? "message-user" : "message-ai"
      }`}
    >
      <div className="message-header">
        <span className="message-role">
          {message.role === "user"
            ? "你"
            : message.role === "system"
              ? "系统"
              : "AI"}
        </span>
        <span className="message-time">
          {new Date().toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
      <div className="message-content">
        <MessageContent
          message={message}
          status={status}
          isCurrentStreaming={isCurrentStreaming}
          expandedToolCalls={expandedToolCalls}
          expandedThinkingBlocks={expandedThinkingBlocks}
          onToolCallToggle={onToolCallToggle}
          onThinkingBlockToggle={onThinkingBlockToggle}
        />
      </div>
    </div>
  );
}
