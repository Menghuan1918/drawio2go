"use client";

import { Card, Checkbox, Button } from "@heroui/react";
import { Eye, MessagesSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Locale as DateFnsLocale } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import type { Conversation } from "@/app/lib/storage";
import { formatConversationDate } from "@/app/lib/format-utils";
import { defaultLocale } from "@/app/i18n/config";
import { useAppTranslation } from "@/app/i18n/hooks";

const DATE_FNS_LOCALE_MAP: Record<string, DateFnsLocale> = {
  "en-US": enUS,
  "zh-CN": zhCN,
};

interface ConversationListProps {
  conversations: Conversation[];
  selectionMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onPreview: (id: string) => void;
  onOpenConversation: (id: string) => void;
}

export default function ConversationList({
  conversations,
  selectionMode,
  selectedIds,
  onToggleSelect,
  onPreview,
  onOpenConversation,
}: ConversationListProps) {
  const { i18n } = useAppTranslation("chat");
  const dateFnsLocale =
    DATE_FNS_LOCALE_MAP[i18n.language] ??
    DATE_FNS_LOCALE_MAP[defaultLocale] ??
    enUS;

  if (!conversations || conversations.length === 0) {
    return (
      <div className="history-empty">
        <MessagesSquare size={32} />
        <p className="history-empty__title">没有匹配的对话</p>
        <p className="history-empty__hint">尝试调整搜索或日期范围</p>
      </div>
    );
  }

  return (
    <div className="history-list" role="list">
      {conversations.map((conv) => {
        const isSelected = selectedIds.has(conv.id);
        const relativeTime = formatDistanceToNow(
          conv.updated_at ?? conv.created_at,
          {
            addSuffix: true,
            locale: dateFnsLocale,
          },
        );

        return (
          <Card.Root
            key={conv.id}
            className="history-card"
            data-selected={isSelected}
            role="listitem"
          >
            <div
              className="history-card__body"
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  if (selectionMode) {
                    onToggleSelect(conv.id);
                  } else {
                    onOpenConversation(conv.id);
                  }
                }
              }}
              onClick={() =>
                selectionMode
                  ? onToggleSelect(conv.id)
                  : onOpenConversation(conv.id)
              }
            >
              {selectionMode && (
                <Checkbox
                  aria-label={`选择对话 ${conv.title}`}
                  isSelected={isSelected}
                  onChange={() => onToggleSelect(conv.id)}
                />
              )}
              <div className="history-card__meta">
                <div className="history-card__title" title={conv.title}>
                  {conv.title || "未命名对话"}
                </div>
                <div className="history-card__subtitle">
                  <span>更新于 {relativeTime}</span>
                  <span className="history-card__dot" aria-hidden>
                    •
                  </span>
                  <span>
                    创建{" "}
                    {formatConversationDate(
                      conv.created_at,
                      "date",
                      i18n.language,
                    )}
                  </span>
                </div>
              </div>
            </div>
            <div className="history-card__actions">
              <Button
                size="sm"
                variant="secondary"
                isIconOnly
                aria-label="预览对话"
                onPress={() => onPreview(conv.id)}
              >
                <Eye size={16} />
              </Button>
            </div>
          </Card.Root>
        );
      })}
    </div>
  );
}
