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
import { AI_TOOL_NAMES } from "@/lib/constants/tool-names";
import type { ToolErrorDetails } from "@/app/types/tool-errors";

const { DRAWIO_READ, DRAWIO_EDIT_BATCH } = AI_TOOL_NAMES;
const TOOL_PREFIX = "tool-" as const;

export const TOOL_LABEL_KEYS: Record<string, string> = {
  [`${TOOL_PREFIX}${DRAWIO_READ}`]: `${TOOL_PREFIX}${DRAWIO_READ}`,
  [`${TOOL_PREFIX}${DRAWIO_EDIT_BATCH}`]: `${TOOL_PREFIX}${DRAWIO_EDIT_BATCH}`,
};

export type ToolStatusMeta = {
  label: string;
  Icon: LucideIcon;
  tone: "pending" | "success" | "error" | "info";
};

export type ToolStatusMetaDefinition = {
  labelKey: string;
  Icon: LucideIcon;
  tone: ToolStatusMeta["tone"];
};

export const TOOL_STATUS_META: Record<string, ToolStatusMetaDefinition> = {
  "input-streaming": {
    labelKey: "input-streaming",
    Icon: Loader2,
    tone: "pending",
  },
  "input-available": {
    labelKey: "input-available",
    Icon: Wrench,
    tone: "pending",
  },
  "output-available": {
    labelKey: "output-available",
    Icon: CheckCircle2,
    tone: "success",
  },
  "output-error": {
    labelKey: "output-error",
    Icon: AlertTriangle,
    tone: "error",
  },
  call: { labelKey: "call", Icon: Wrench, tone: "pending" },
  result: { labelKey: "result", Icon: CheckCircle2, tone: "success" },
  default: { labelKey: "default", Icon: Info, tone: "pending" },
};

// 工具调用消息部分的类型定义
export interface ToolMessagePart {
  type: string;
  state: string;
  toolCallId?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  errorDetails?: ToolErrorDetails;
  [key: string]: unknown;
}
