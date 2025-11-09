"use client";

import { Button } from "@heroui/react";
import { FolderOpen } from "lucide-react";

interface BottomBarProps {
  onToggleSettings?: () => void;
  onToggleChat?: () => void;
  onSave?: () => void;
  onLoad?: () => void;
  activeSidebar?: "none" | "settings" | "chat";
  selectionLabel?: string;
  currentProjectName?: string;
  onOpenProjectSelector?: () => void;
}

export default function BottomBar({
  onToggleSettings,
  onToggleChat,
  onSave,
  onLoad,
  activeSidebar = "none",
  selectionLabel,
  currentProjectName = "New Project",
  onOpenProjectSelector,
}: BottomBarProps) {
  return (
    <div className="bottom-bar">
      {onOpenProjectSelector && (
        <Button
          variant="secondary"
          size="md"
          className="bottom-bar-button button-secondary"
          onPress={onOpenProjectSelector}
        >
          <FolderOpen size={16} />
          {currentProjectName}
        </Button>
      )}

      {selectionLabel && (
        <div
          className="ml-3 bottom-bar-button button-secondary"
          style={{ cursor: "default" }}
        >
          {selectionLabel}
        </div>
      )}

      <div style={{ flex: 1 }}></div>

      {onLoad && (
        <Button
          variant="secondary"
          size="md"
          className="bottom-bar-button button-secondary"
          onPress={onLoad}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            />
          </svg>
          加载
        </Button>
      )}

      {onSave && (
        <Button
          variant="primary"
          size="md"
          className="bottom-bar-button button-primary"
          onPress={onSave}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
            />
          </svg>
          保存
        </Button>
      )}

      {(onToggleChat || onToggleSettings) && (
        <div className="button-group">
          {onToggleChat && (
            <Button
              variant={activeSidebar === "chat" ? "primary" : "secondary"}
              size="md"
              className="bottom-bar-button"
              onPress={onToggleChat}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                />
              </svg>
              聊天
            </Button>
          )}
          {onToggleSettings && (
            <Button
              variant={activeSidebar === "settings" ? "primary" : "secondary"}
              size="md"
              className="bottom-bar-button"
              onPress={onToggleSettings}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              设置
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
