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
  const { t, i18n } = useAppTranslation("chat");

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
            {t("conversations.messageCount", { count: messages.length })} ·{" "}
            {t("conversations.lastUpdated", { time: updatedLabel })}
          </p>
        </div>
        <div className="history-preview__actions">
          <Button
            size="sm"
            variant="secondary"
            onPress={onOpenConversation}
            aria-label={t("conversations.actions.open")}
          >
            {t("conversations.actions.open")}
          </Button>
          <Button
            size="sm"
            variant="tertiary"
            isIconOnly
            aria-label={t("aria.closeHistory")}
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
            <span>{t("messages.loading")}</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="history-preview__empty">
            <MessageSquare size={20} />
            <p>{t("messages.emptyConversation")}</p>
          </div>
        ) : (
          <ul className="history-preview__list">
            {messages.map((msg) => (
              <li key={msg.id} className="history-preview__item">
                <span
                  className={`history-preview__tag history-preview__tag--${msg.role}`}
                >
                  {roleIcon[msg.role]}
                  {t(`messages.roles.${msg.role}`)}
                </span>
                <p className="history-preview__text">
                  {(() => {
                    try {
                      const parsed = JSON.parse(msg.parts_structure);
                      const textParts = Array.isArray(parsed)
                        ? parsed
                            .filter(
                              (part) =>
                                part &&
                                typeof part === "object" &&
                                (part as { type?: unknown }).type === "text" &&
                                typeof (part as { text?: unknown }).text ===
                                  "string",
                            )
                            .map((part) => (part as { text: string }).text)
                        : [];

                      const textContent = textParts.join("\n");
                      return (
                        textContent.slice(0, 160) ||
                        t("messages.emptyMessage", { defaultValue: "" }) ||
                        ""
                      );
                    } catch (error) {
                      console.error(
                        "[MessagePreviewPanel] 解析 parts_structure 失败:",
                        error,
                        msg.id,
                      );
                      return (
                        t("messages.emptyMessage", { defaultValue: "" }) || ""
                      );
                    }
                  })()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
