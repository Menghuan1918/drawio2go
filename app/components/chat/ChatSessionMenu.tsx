"use client";

import type { ChatSessionsData } from "@/app/types/chat";

interface ChatSessionMenuProps {
  showSessionMenu: boolean;
  sessionsData: ChatSessionsData | null;
  activeSessionId: string | null;
  onSessionSelect: (sessionId: string) => void;
}

export default function ChatSessionMenu({
  showSessionMenu,
  sessionsData,
  activeSessionId,
  onSessionSelect,
}: ChatSessionMenuProps) {
  if (!showSessionMenu || !sessionsData) {
    return null;
  }

  return (
    <div className="chat-session-menu">
      {sessionsData.sessionOrder.map((sessionId) => {
        const session = sessionsData.sessions[sessionId];
        const isActive = sessionId === activeSessionId;

        return (
          <button
            key={sessionId}
            type="button"
            className={`chat-session-menu-item ${isActive ? "chat-session-menu-item--active" : ""}`}
            onClick={() => onSessionSelect(sessionId)}
          >
            <div className="chat-session-menu-item-title">{session.title}</div>
            <div className="chat-session-menu-item-meta">
              {session.messages.length} 条消息 ·{" "}
              {new Date(session.updatedAt).toLocaleDateString()}
            </div>
          </button>
        );
      })}
    </div>
  );
}
