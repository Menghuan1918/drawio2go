"use client";

import { Bot, UserRound } from "lucide-react";
import MessageContent from "./MessageContent";
import type { ChatUIMessage, MessageMetadata } from "@/app/types/chat";
import { DEFAULT_LLM_CONFIG } from "@/app/lib/config-utils";
import { formatRelativeTime } from "@/app/lib/format-utils";
import { useAppTranslation } from "@/app/i18n/hooks";
import ModelIcon from "@/app/components/common/ModelIcon";

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
  const { t } = useAppTranslation(["chat", "common"]);
  const metadata = (message.metadata as MessageMetadata | undefined) ?? {};
  const modelName = metadata.modelName || DEFAULT_LLM_CONFIG.modelName;
  const timestamp = metadata.createdAt
    ? new Date(metadata.createdAt)
    : new Date();
  const formattedTime = formatRelativeTime(timestamp.getTime(), t);

  const isUser = message.role === "user";
  const isCancelledMessage = metadata.isCancelled === true;
  const isDisconnectedMessage = metadata.isDisconnected === true;
  const messageStateClass = [
    isCancelledMessage ? "message-cancelled" : "",
    isDisconnectedMessage ? "message-disconnected" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const metaLabel = `${t("messages.labels.model")}: ${modelName} · ${t("messages.labels.timestamp", { time: formattedTime })}`;

  return (
    <div
      className={`message ${
        message.role === "user" ? "message-user" : "message-ai"
      } ${messageStateClass}`}
    >
      <div className={`message-meta ${isUser ? "message-meta--user" : ""}`}>
        <span className="message-meta-icon" aria-hidden>
          {isUser ? <UserRound size={14} /> : <Bot size={14} />}
        </span>
        {!isUser && (
          <ModelIcon
            size={14}
            modelName={modelName}
            className="ml-1 text-primary"
          />
        )}
        <span className="message-meta-text">{metaLabel}</span>
      </div>
      <div
        className={`message-body ${
          isUser ? "message-body--user" : "message-body--assistant"
        } ${messageStateClass}`}
      >
        <div
          className={`message-content ${
            isUser ? "" : "message-content--assistant"
          }`}
        >
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
