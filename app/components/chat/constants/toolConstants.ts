/**
 * 工具调用相关常量定义
 */

import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  Wrench,
} from "lucide-react";

export const TOOL_LABELS: Record<string, string> = {
  "tool-drawio_read": "读取 DrawIO XML",
  "tool-drawio_edit_batch": "批量编辑 DrawIO XML",
  "tool-drawio_overwrite": "完整覆写 DrawIO XML",
};

export type ToolStatusMeta = {
  label: string;
  Icon: LucideIcon;
  tone: "pending" | "success" | "error" | "info";
};

export const TOOL_STATUS_META: Record<string, ToolStatusMeta> = {
  "input-streaming": { label: "准备中", Icon: Loader2, tone: "pending" },
  "input-available": { label: "等待执行", Icon: Wrench, tone: "pending" },
  "output-available": { label: "成功", Icon: CheckCircle2, tone: "success" },
  "output-error": { label: "失败", Icon: AlertTriangle, tone: "error" },
  default: { label: "未知状态", Icon: Info, tone: "pending" },
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
