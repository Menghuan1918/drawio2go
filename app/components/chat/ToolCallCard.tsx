"use client";

import { type ToolMessagePart } from "./constants/toolConstants";
import {
  getToolTitle,
  getToolSummary,
  getToolStatusMeta,
} from "./utils/toolUtils";

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
  const title = getToolTitle(part.type);
  const meta = getToolStatusMeta(part.state);

  const showInput = Boolean(part.input);
  const showOutput = Boolean(part.output);

  return (
    <div
      className={`tool-call-card tool-call-card--${meta.tone} ${
        expanded ? "tool-call-card--expanded" : ""
      }`.trim()}
    >
      <button type="button" className="tool-call-header" onClick={onToggle}>
        <div className="tool-call-title">{title}</div>
        <div className="tool-call-status">
          <span className="tool-call-status-icon" aria-hidden>
            {meta.icon}
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
      <div className="tool-call-summary">{getToolSummary(part)}</div>
      {expanded ? (
        <div className="tool-call-body">
          {part.state === "output-error" && (
            <div className="tool-call-error-text">
              {part.errorText ?? "未知错误"}
            </div>
          )}
          {showInput && (
            <div className="tool-call-section">
              <div className="tool-call-section-title">输入参数</div>
              <pre className="tool-call-json">
                {JSON.stringify(part.input, null, 2)}
              </pre>
            </div>
          )}
          {showOutput && (
            <div className="tool-call-section">
              <div className="tool-call-section-title">执行结果</div>
              <pre className="tool-call-json">
                {JSON.stringify(part.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
