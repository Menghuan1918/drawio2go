/**
 * 工具调用相关的工具函数
 */

import {
  TOOL_LABELS,
  TOOL_STATUS_META,
  type ToolMessagePart,
} from "../constants/toolConstants";

/**
 * 获取工具调用标题
 */
export const getToolTitle = (type: string): string => {
  if (TOOL_LABELS[type]) {
    return TOOL_LABELS[type];
  }

  if (type.startsWith("tool-")) {
    return type.replace("tool-", "");
  }

  return type;
};

/**
 * 获取工具调用状态摘要
 */
export const getToolSummary = (part: ToolMessagePart): string => {
  switch (part.state) {
    case "input-streaming":
      return "AI 正在准备工具参数";
    case "input-available":
      return "等待客户端执行工具";
    case "output-available":
      return "工具执行完成";
    case "output-error":
      return part.errorText ?? "工具执行失败";
    default:
      return "工具状态更新";
  }
};

/**
 * 获取工具调用状态元数据
 */
export const getToolStatusMeta = (state: string) => {
  return (
    TOOL_STATUS_META[state] ?? {
      label: "未知状态",
      icon: "ℹ️",
      tone: "info" as const,
    }
  );
};

/**
 * 生成工具调用卡片的展开键
 */
export const getToolExpansionKey = (
  messageId: string,
  index: number,
  toolCallId?: string,
  state?: string,
): string => {
  const baseKey = toolCallId ? String(toolCallId) : `${messageId}-${index}`;
  return state ? `${baseKey}-${state}` : baseKey;
};

/**
 * 判断工具调用是否应该默认展开
 */
export const shouldToolBeExpanded = (state: string): boolean => {
  return state === "output-error";
};
