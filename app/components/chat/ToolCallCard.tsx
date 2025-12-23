"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Copy, Check } from "lucide-react";
import { usePress } from "@react-aria/interactions";
import { type ToolMessagePart } from "./constants/toolConstants";
import {
  getToolTitle,
  getToolSummary,
  getToolStatusMeta,
} from "./utils/toolUtils";
import { useAppTranslation } from "@/app/i18n/hooks";
import { createLogger } from "@/lib/logger";
import { isToolErrorResult } from "@/app/types/tool-errors";
import { formatToolErrorDetailsToText } from "@/app/lib/tool-error-format";

/** streaming 阶段 JSON 解析的节流间隔（毫秒） */
const JSON_THROTTLE_INTERVAL = 1000;

/**
 * 节流 JSON 格式化 hook
 * 在 streaming 阶段每秒只执行一次 JSON.stringify，非 streaming 阶段使用 useMemo 直接计算
 *
 * 修复：使用 useMemo 替代 useEffect+setState 模式，避免因 value 对象引用变化
 * 导致的无限循环更新（Maximum update depth exceeded）
 */
function useThrottledJson(value: unknown, isStreaming: boolean): string {
  // streaming 阶段需要定时更新，所以使用 state
  const [streamingJson, setStreamingJson] = useState("");
  // 缓存最新的 value 引用（避免闭包问题）
  const latestValueRef = useRef<unknown>(value);
  latestValueRef.current = value;

  // 非 streaming 阶段：直接用 useMemo 计算，无需 state 更新
  // 这样即使 value 对象引用变化但内容相同，也不会触发重渲染
  // 优化：isStreaming 为 true 时跳过计算，避免每帧执行 JSON.stringify
  const memoizedJson = useMemo(() => {
    if (isStreaming) return "";
    return value !== undefined ? JSON.stringify(value, null, 2) : "";
  }, [value, isStreaming]);

  // streaming 阶段：定时更新
  useEffect(() => {
    if (!isStreaming) return;

    // 立即执行一次
    const format = () => {
      const v = latestValueRef.current;
      setStreamingJson(v !== undefined ? JSON.stringify(v, null, 2) : "");
    };
    format();

    const timerId = setInterval(format, JSON_THROTTLE_INTERVAL);
    return () => clearInterval(timerId);
  }, [isStreaming]);

  // streaming 时使用节流的 state，非 streaming 时使用 memoized 值
  return isStreaming ? streamingJson : memoizedJson;
}

const logger = createLogger("ToolCallCard");

const I18N_KEYS = {
  copied: "messages.actions.copied",
  expand: "toolCalls.actions.expand",
  collapse: "toolCalls.actions.collapse",
  copyInput: "toolCalls.actions.copyInput",
  copyOutput: "toolCalls.actions.copyOutput",
  copyError: "toolCalls.actions.copyError",
  error: "toolCalls.error",
  parameters: "toolCalls.parameters",
  result: "toolCalls.result",
} as const;

function extractErrorSummary(rawMessage: string): string {
  const firstBlock = rawMessage.split("\n\n")[0] ?? rawMessage;
  const firstLine = firstBlock.split("\n")[0] ?? firstBlock;
  return firstLine.trim() || rawMessage;
}

interface ToolCallCardProps {
  part: ToolMessagePart;
  expanded: boolean;
  onToggle: () => void;
}

export default function ToolCallCard({
  part,
  expanded,
  onToggle,
}: ToolCallCardProps) {
  const { t } = useAppTranslation("chat");
  const title = getToolTitle(part.type, t);
  const toolErrorResult = isToolErrorResult(part.output) ? part.output : null;
  const effectiveState = toolErrorResult ? "output-error" : part.state;
  const meta = getToolStatusMeta(effectiveState, t);
  const StatusIcon = meta.Icon;
  const [copiedInput, setCopiedInput] = useState(false);
  const [copiedOutput, setCopiedOutput] = useState(false);
  const [copiedError, setCopiedError] = useState(false);

  const showInput = part.input !== undefined;
  const showOutput = part.output !== undefined;

  const rawErrorMessage =
    part.errorText ?? toolErrorResult?.message ?? t(I18N_KEYS.error);
  const errorSummary = extractErrorSummary(rawErrorMessage);
  const errorDetails =
    part.errorDetails ?? toolErrorResult?.errorDetails ?? undefined;
  const errorDetailsText = formatToolErrorDetailsToText(errorDetails);

  // 判断是否为进行中状态（正在调用或等待执行）
  const isInProgress =
    effectiveState === "input-streaming" ||
    effectiveState === "input-available";

  // 节流 JSON 解析（优化 streaming 阶段性能）
  const isInputStreaming = effectiveState === "input-streaming";
  const throttledInputJson = useThrottledJson(part.input, isInputStreaming);

  // 优化：memoize output JSON，避免不必要的重计算
  const outputJson = useMemo(() => {
    return showOutput ? JSON.stringify(part.output, null, 2) : "";
  }, [showOutput, part.output]);

  // 通用复制处理函数
  const handleCopy = async (
    text: string,
    setStateFn: React.Dispatch<React.SetStateAction<boolean>>,
    context: string,
  ) => {
    try {
      await navigator.clipboard.writeText(text);
      setStateFn(true);
      setTimeout(() => setStateFn(false), 2000);
    } catch (error) {
      logger.error(`[ToolCallCard] copy ${context} failed:`, error);
    }
  };

  // 复制输入参数
  const handleCopyInput = () =>
    handleCopy(JSON.stringify(part.input, null, 2), setCopiedInput, "input");

  // 复制输出结果
  const handleCopyOutput = () =>
    handleCopy(outputJson, setCopiedOutput, "output");

  // 复制错误信息
  const handleCopyError = () => {
    const payload: Record<string, unknown> = {
      type: part.type,
      state: part.state,
      toolCallId: part.toolCallId,
      errorText: errorSummary,
    };
    if (errorDetails !== undefined) payload.errorDetails = errorDetails;
    if (part.output !== undefined) payload.output = part.output;
    return handleCopy(
      JSON.stringify(payload, null, 2),
      setCopiedError,
      "error",
    );
  };

  const { pressProps: togglePressProps } = usePress({ onPress: onToggle });
  const { pressProps: copyErrorPressProps } = usePress({
    onPress: handleCopyError,
  });
  const { pressProps: copyInputPressProps } = usePress({
    onPress: handleCopyInput,
  });
  const { pressProps: copyOutputPressProps } = usePress({
    onPress: handleCopyOutput,
  });

  return (
    <div
      className={`tool-call-card tool-call-card--${meta.tone} ${
        expanded ? "tool-call-card--expanded" : ""
      } ${isInProgress ? "tool-call-card--scanning" : ""}`.trim()}
    >
      <button
        type="button"
        className="tool-call-header"
        aria-expanded={expanded}
        aria-label={expanded ? t(I18N_KEYS.collapse) : t(I18N_KEYS.expand)}
        {...togglePressProps}
      >
        <div className="tool-call-title">{title}</div>
        <div className="tool-call-status">
          <span
            className={`tool-call-status-icon ${
              isInProgress ? "tool-call-status-icon--spinning" : ""
            }`.trim()}
            aria-hidden
          >
            <StatusIcon size={16} />
          </span>
          <span className="tool-call-status-label">{meta.label}</span>
          <svg
            className={`tool-call-chevron ${expanded ? "tool-call-chevron--open" : ""}`.trim()}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>
      <div className="tool-call-summary">
        {getToolSummary({ ...part, state: effectiveState }, t)}
      </div>
      {expanded ? (
        <div className="tool-call-body">
          {/* 错误信息区块 */}
          {effectiveState === "output-error" && (
            <div className="tool-call-section">
              <div className="tool-call-section-header">
                <div className="tool-call-section-title">
                  {t(I18N_KEYS.error)}
                </div>
                <button
                  type="button"
                  className="tool-call-copy-icon-button"
                  title={
                    copiedError ? t(I18N_KEYS.copied) : t(I18N_KEYS.copyError)
                  }
                  aria-label={
                    copiedError ? t(I18N_KEYS.copied) : t(I18N_KEYS.copyError)
                  }
                  {...copyErrorPressProps}
                >
                  {copiedError ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <div className="tool-call-error-text">{errorSummary}</div>
              {errorDetailsText && (
                <pre className="tool-call-json">{errorDetailsText}</pre>
              )}
            </div>
          )}

          {/* 输入参数区块 */}
          {showInput && (
            <div className="tool-call-section">
              <div className="tool-call-section-header">
                <div className="tool-call-section-title">
                  {t(I18N_KEYS.parameters)}
                </div>
                <button
                  type="button"
                  className="tool-call-copy-icon-button"
                  title={
                    copiedInput ? t(I18N_KEYS.copied) : t(I18N_KEYS.copyInput)
                  }
                  aria-label={
                    copiedInput ? t(I18N_KEYS.copied) : t(I18N_KEYS.copyInput)
                  }
                  {...copyInputPressProps}
                >
                  {copiedInput ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <pre className="tool-call-json">{throttledInputJson}</pre>
            </div>
          )}

          {/* 输出结果区块 */}
          {showOutput && (
            <div className="tool-call-section">
              <div className="tool-call-section-header">
                <div className="tool-call-section-title">
                  {t(I18N_KEYS.result)}
                </div>
                <button
                  type="button"
                  className="tool-call-copy-icon-button"
                  title={
                    copiedOutput ? t(I18N_KEYS.copied) : t(I18N_KEYS.copyOutput)
                  }
                  aria-label={
                    copiedOutput ? t(I18N_KEYS.copied) : t(I18N_KEYS.copyOutput)
                  }
                  {...copyOutputPressProps}
                >
                  {copiedOutput ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <pre className="tool-call-json">{outputJson}</pre>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
