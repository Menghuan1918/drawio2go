"use client";

import { Button, Spinner } from "@heroui/react";
import type { ReactNode } from "react";
import { X, MessageSquare, User, Bot } from "lucide-react";
import type { Conversation, Message } from "@/app/lib/storage";
import { formatConversationDate } from "@/app/lib/format-utils";
import { useAppTranslation } from "@/app/i18n/hooks";

interface MessagePreviewPanelProps {
  isOpen: boolean;
  conversation: Conversation | null;
  messages: Message[];
  loading?: boolean;
  onClose: () => void;
  onOpenConversation: () => void;
}

const roleLabel: Record<Message["role"], string> = {
  user: "用户",
  assistant: "AI",
  system: "系统",
};

const roleIcon: Record<Message["role"], ReactNode> = {
  user: <User size={14} />,
  assistant: <Bot size={14} />,
  system: <MessageSquare size={14} />,
};

export default function MessagePreviewPanel({
  isOpen,
  conversation,
  messages,
  loading = false,
  onClose,
  onOpenConversation,
}: MessagePreviewPanelProps) {
  const { i18n } = useAppTranslation("chat");

  if (!isOpen || !conversation) return null;

  const updatedLabel = formatConversationDate(
    conversation.updated_at ?? conversation.created_at,
    "datetime",
    i18n.language,
  );

  return (
    <aside className="history-preview" aria-live="polite">
      <div className="history-preview__header">
        <div className="history-preview__title">
          <p className="history-preview__name">{conversation.title}</p>
          <p className="history-preview__meta">
            {messages.length} 条消息预览 · {updatedLabel}
          </p>
        </div>
        <div className="history-preview__actions">
          <Button
            size="sm"
            variant="secondary"
            onPress={onOpenConversation}
            aria-label="打开对话"
          >
            打开
          </Button>
          <Button
            size="sm"
            variant="tertiary"
            isIconOnly
            aria-label="关闭预览"
            onPress={onClose}
          >
            <X size={16} />
          </Button>
        </div>
      </div>

      <div className="history-preview__content">
        {loading ? (
          <div className="history-preview__loading">
            <Spinner size="sm" />
            <span>加载预览...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="history-preview__empty">
            <MessageSquare size={20} />
            <p>暂无消息</p>
          </div>
        ) : (
          <ul className="history-preview__list">
            {messages.map((msg) => (
              <li key={msg.id} className="history-preview__item">
                <span
                  className={`history-preview__tag history-preview__tag--${msg.role}`}
                >
                  {roleIcon[msg.role]}
                  {roleLabel[msg.role]}
                </span>
                <p className="history-preview__text">
                  {msg.content?.slice(0, 160) || "（空消息）"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
