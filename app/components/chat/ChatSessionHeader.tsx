"use client";

import { Button, TooltipContent, TooltipRoot } from "@heroui/react";
import type { ChatSession } from "@/app/types/chat";

interface ChatSessionHeaderProps {
  activeSession: ChatSession | null;
  showSessionMenu: boolean;
  onHistoryToggle: () => void;
  onDeleteSession: () => void;
  onExportSession: () => void;
  onExportAllSessions: () => void;
  onImportSessions: () => void;
}

export default function ChatSessionHeader({
  activeSession,
  showSessionMenu,
  onHistoryToggle,
  onDeleteSession,
  onExportSession,
  onExportAllSessions,
  onImportSessions,
}: ChatSessionHeaderProps) {
  if (!activeSession) {
    return null;
  }

  return (
    <div className="chat-session-header">
      <div className="chat-session-title-wrapper">
        <button
          type="button"
          className="chat-session-title-button"
          onClick={onHistoryToggle}
        >
          <span className="chat-session-title">{activeSession.title}</span>
          <svg
            className={`chat-session-chevron ${showSessionMenu ? "chat-session-chevron--open" : ""}`}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <span className="chat-session-meta">
          {activeSession.messages.length} 条消息
        </span>
      </div>
      <div className="chat-session-actions">
        <TooltipRoot delay={0}>
          <Button
            size="sm"
            variant="ghost"
            isIconOnly
            onPress={onDeleteSession}
            className="chat-icon-button"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </Button>
          <TooltipContent placement="top">
            <p>删除会话</p>
          </TooltipContent>
        </TooltipRoot>

        <TooltipRoot delay={0}>
          <Button
            size="sm"
            variant="ghost"
            isIconOnly
            onPress={onExportSession}
            className="chat-icon-button"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </Button>
          <TooltipContent placement="top">
            <p>导出当前会话</p>
          </TooltipContent>
        </TooltipRoot>

        <TooltipRoot delay={0}>
          <Button
            size="sm"
            variant="ghost"
            isIconOnly
            onPress={onExportAllSessions}
            className="chat-icon-button"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </Button>
          <TooltipContent placement="top">
            <p>导出所有会话</p>
          </TooltipContent>
        </TooltipRoot>

        <TooltipRoot delay={0}>
          <Button
            size="sm"
            variant="ghost"
            isIconOnly
            onPress={onImportSessions}
            className="chat-icon-button"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </Button>
          <TooltipContent placement="top">
            <p>导入会话</p>
          </TooltipContent>
        </TooltipRoot>
      </div>
    </div>
  );
}
