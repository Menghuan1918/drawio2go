"use client";

import { useRef, useMemo } from "react";
import { Card, Checkbox, Button } from "@heroui/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Eye, MessagesSquare } from "lucide-react";
import type { Conversation } from "@/app/lib/storage";
import {
  formatConversationDate,
  formatRelativeTime,
} from "@/app/lib/format-utils";
import { useAppTranslation } from "@/app/i18n/hooks";

// 虚拟滚动阈值 - 会话数量超过此值时启用虚拟滚动
const VIRTUAL_SCROLL_THRESHOLD = 5;
// 估计每个卡片的高度
const ESTIMATED_ITEM_HEIGHT = 72;

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
  const { t, i18n } = useAppTranslation(["chat", "common"]);
  const parentRef = useRef<HTMLDivElement>(null);

  // 是否启用虚拟滚动
  const enableVirtualScroll = useMemo(
    () => conversations.length > VIRTUAL_SCROLL_THRESHOLD,
    [conversations.length],
  );

  // 配置虚拟滚动器
  const virtualizer = useVirtualizer({
    count: conversations.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ITEM_HEIGHT,
    overscan: 5,
    enabled: enableVirtualScroll,
  });

  if (!conversations || conversations.length === 0) {
    return (
      <div className="history-empty">
        <MessagesSquare size={32} />
        <p className="history-empty__title">{t("history.search.noResults")}</p>
        <p className="history-empty__hint">{t("errors.noResult")}</p>
      </div>
    );
  }

  const renderConversationCard = (conv: Conversation, index: number) => {
    const fallbackTitle = t("conversations.defaultName", {
      number: index + 1,
    });
    const title = conv.title || fallbackTitle;
    const isSelected = selectedIds.has(conv.id);
    const relativeTime = formatRelativeTime(
      conv.updated_at ?? conv.created_at,
      t,
    );

    return (
      <Card.Root
        key={conv.id}
        className="history-card"
        data-selected={isSelected}
        role="listitem"
      >
        <Card.Content className="history-card__content">
          {selectionMode && (
            <Checkbox
              aria-label={t("aria.selectConversation", { title })}
              isSelected={isSelected}
              onChange={() => onToggleSelect(conv.id)}
            />
          )}

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
            <div className="history-card__meta">
              <div className="history-card__title" title={title}>
                {title}
              </div>
              <div className="history-card__subtitle">
                <span>
                  {t("conversations.lastUpdated", { time: relativeTime })}
                </span>
                <span className="history-card__dot" aria-hidden>
                  •
                </span>
                <span>
                  {t("conversations.createdAt", {
                    time: formatConversationDate(
                      conv.created_at,
                      "date",
                      i18n.language,
                    ),
                  })}
                </span>
              </div>
            </div>
          </div>

          {!selectionMode && (
            <div className="history-card__actions">
              <Button
                size="sm"
                variant="tertiary"
                aria-label={t("aria.openPreview")}
                onPress={() => onPreview(conv.id)}
              >
                <Eye size={16} />
                {t("aria.openPreview")}
              </Button>
            </div>
          )}
        </Card.Content>
      </Card.Root>
    );
  };

  // 渲染虚拟滚动列表
  if (enableVirtualScroll) {
    const virtualItems = virtualizer.getVirtualItems();

    return (
      <div
        ref={parentRef}
        className="history-list"
        role="list"
        style={{
          height: "100%",
          overflow: "auto",
        }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualItems.map((virtualItem) => {
            const conv = conversations[virtualItem.index];
            return (
              <div
                key={conv.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                {renderConversationCard(conv, virtualItem.index)}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 渲染普通列表（无虚拟滚动）
  return (
    <div className="history-list" role="list">
      {conversations.map((conv, index) => renderConversationCard(conv, index))}
    </div>
  );
}
