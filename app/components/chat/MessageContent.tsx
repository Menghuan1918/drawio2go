"use client";

import ReactMarkdown from "react-markdown";
import ThinkingBlock from "./ThinkingBlock";
import ToolCallCard from "./ToolCallCard";
import { TypingIndicator } from "./TypingIndicator";
import { markdownComponents } from "./constants/markdownComponents";
import { getToolExpansionKey, shouldToolBeExpanded } from "./utils/toolUtils";
import { type ToolMessagePart } from "./constants/toolConstants";
import type { UIMessage } from "ai";

interface MessageContentProps {
  message: UIMessage;
  status?: string;
  isCurrentStreaming?: boolean;
  expandedToolCalls: Record<string, boolean>;
  expandedThinkingBlocks: Record<string, boolean>;
  onToolCallToggle: (key: string) => void;
  onThinkingBlockToggle: (messageId: string) => void;
}

export default function MessageContent({
  message,
  status,
  isCurrentStreaming,
  expandedToolCalls,
  expandedThinkingBlocks,
  onToolCallToggle,
  onThinkingBlockToggle,
}: MessageContentProps) {
  // 判断是否正在流式输出
  const isStreaming = status === "submitted" || status === "streaming";
  const isAssistantMessage = message.role === "assistant";

  return (
    <>
      {/* 渲染消息部分 */}
      {message.parts.map((part, index: number) => {
        // 思考内容
        if (part.type === "reasoning") {
          const isReasoningStreaming = part.state === "streaming";
          return (
            <ThinkingBlock
              key={`${message.id}-${index}`}
              reasoning={part.text ?? ""}
              isStreaming={isReasoningStreaming}
              expanded={expandedThinkingBlocks[message.id] ?? false}
              onToggle={() => onThinkingBlockToggle(message.id)}
            />
          );
        }

        // 文本内容
        if (part.type === "text") {
          // 判断是否是最后一个文本部分
          const isLastTextPart = index === message.parts.length - 1;
          const shouldShowTypingIndicator =
            isStreaming &&
            isAssistantMessage &&
            isLastTextPart &&
            isCurrentStreaming;

          return (
            <div
              key={`${message.id}-${index}`}
              className="message-markdown-wrapper"
            >
              <div className="message-markdown">
                <ReactMarkdown components={markdownComponents}>
                  {part.text ?? ""}
                </ReactMarkdown>
              </div>
              {shouldShowTypingIndicator && <TypingIndicator />}
            </div>
          );
        }

        // 工具调用内容
        const normalizedPart: ToolMessagePart =
          part.type === "dynamic-tool"
            ? {
                ...part,
                type: `tool-${part.toolName}`,
              }
            : (part as ToolMessagePart);

        if (
          typeof normalizedPart.type === "string" &&
          normalizedPart.type.startsWith("tool-")
        ) {
          const expansionKey = getToolExpansionKey(
            message.id,
            index,
            normalizedPart.toolCallId,
            normalizedPart.state,
          );
          const isExpanded =
            expandedToolCalls[expansionKey] ??
            shouldToolBeExpanded(normalizedPart.state);

          return (
            <ToolCallCard
              key={expansionKey}
              part={normalizedPart}
              expanded={isExpanded}
              onToggle={() => onToolCallToggle(expansionKey)}
            />
          );
        }

        return null;
      })}
    </>
  );
}
