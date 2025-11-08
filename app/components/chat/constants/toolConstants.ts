/**
 * 工具调用相关常量定义
 */

export const TOOL_LABELS: Record<string, string> = {
  "tool-drawio_read": "读取 DrawIO XML",
  "tool-drawio_edit_batch": "批量编辑 DrawIO XML",
};

export const TOOL_STATUS_META: Record<
  string,
  {
    label: string;
    icon: string;
    tone: "pending" | "success" | "error" | "info";
  }
> = {
  "input-streaming": { label: "准备中", icon: "⏳", tone: "pending" },
  "input-available": { label: "等待执行", icon: "🛠️", tone: "pending" },
  "output-available": { label: "成功", icon: "✅", tone: "success" },
  "output-error": { label: "失败", icon: "⚠️", tone: "error" },
};

// 工具调用消息部分的类型定义
export interface ToolMessagePart {
  type: string;
  state: string;
  toolCallId?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  [key: string]: unknown;
}
