"use client";

import { Bot, UserRound } from "lucide-react";
import MessageContent from "./MessageContent";
import type { ChatUIMessage, MessageMetadata } from "@/app/types/chat";
import { DEFAULT_LLM_CONFIG } from "@/app/lib/config-utils";

interface MessageItemProps {
  message: ChatUIMessage;
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
  const metadata = (message.metadata as MessageMetadata | undefined) ?? {};
  const modelName = metadata.modelName || DEFAULT_LLM_CONFIG.modelName;
  const timestamp = metadata.createdAt
    ? new Date(metadata.createdAt)
    : new Date();
  const formattedTime = new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(timestamp);

  const isUser = message.role === "user";
  const metaLabel = `${modelName} · ${formattedTime}`;

  return (
    <div
      className={`message ${
        message.role === "user" ? "message-user" : "message-ai"
      }`}
    >
      <div className={`message-meta ${isUser ? "message-meta--user" : ""}`}>
        <span className="message-meta-icon" aria-hidden>
          {isUser ? <UserRound size={14} /> : <Bot size={14} />}
        </span>
        <span className="message-meta-text">{metaLabel}</span>
      </div>
      <div
        className={`message-body ${
          isUser ? "message-body--user" : "message-body--assistant"
        }`}
      >
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
    </div>
  );
}
