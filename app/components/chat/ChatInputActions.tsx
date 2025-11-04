"use client";

import { Button, TooltipContent, TooltipRoot } from "@heroui/react";

interface ChatInputActionsProps {
  isSendDisabled: boolean;
  isChatStreaming: boolean;
  onCancel?: () => void;
  onNewChat: () => void;
  onHistory: () => void;
  onVersionControl: () => void;
  onFileUpload: () => void;
}

export default function ChatInputActions({
  isSendDisabled,
  isChatStreaming,
  onCancel,
  onNewChat,
  onHistory,
  onVersionControl,
  onFileUpload,
}: ChatInputActionsProps) {
  return (
    <div className="chat-input-actions">
      {/* 左侧按钮组 */}
      <div className="chat-actions-left">
        <TooltipRoot delay={0}>
          <Button
            size="sm"
            variant="ghost"
            isIconOnly
            onPress={onNewChat}
            className="chat-icon-button"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </Button>
          <TooltipContent placement="top">
            <p>新建聊天</p>
          </TooltipContent>
        </TooltipRoot>

        <TooltipRoot delay={0}>
          <Button
            size="sm"
            variant="ghost"
            isIconOnly
            onPress={onHistory}
            className="chat-icon-button"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 3v5h5"></path>
              <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"></path>
              <path d="M12 7v5l4 2"></path>
            </svg>
          </Button>
          <TooltipContent placement="top">
            <p>历史对话</p>
          </TooltipContent>
        </TooltipRoot>
      </div>

      {/* 右侧按钮组 */}
      <div className="chat-actions-right">
        <TooltipRoot delay={0}>
          <Button
            size="sm"
            variant="ghost"
            isIconOnly
            onPress={onVersionControl}
            className="chat-icon-button"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="18" cy="18" r="3"></circle>
              <circle cx="6" cy="6" r="3"></circle>
              <path d="M13 6h3a2 2 0 0 1 2 2v7"></path>
              <line x1="6" y1="9" x2="6" y2="21"></line>
            </svg>
          </Button>
          <TooltipContent placement="top">
            <p>版本管理</p>
          </TooltipContent>
        </TooltipRoot>

        <TooltipRoot delay={0}>
          <Button
            size="sm"
            variant="ghost"
            isIconOnly
            onPress={onFileUpload}
            className="chat-icon-button"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
            </svg>
          </Button>
          <TooltipContent placement="top">
            <p>文件上传</p>
          </TooltipContent>
        </TooltipRoot>

        <Button
          type={isChatStreaming ? undefined : "submit"}
          variant="primary"
          size="sm"
          isDisabled={isChatStreaming ? false : isSendDisabled}
          onPress={isChatStreaming ? onCancel : undefined}
          className="chat-send-button button-primary"
        >
          {isChatStreaming ? (
            // 取消图标（X）
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
          ) : (
            // 发送图标
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          )}
          {isChatStreaming ? "取消" : "发送"}
        </Button>
      </div>
    </div>
  );
}