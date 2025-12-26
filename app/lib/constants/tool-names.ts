/**
 * 工具名称常量：
 * - AI 工具：直接暴露给 LLM 的工具（由前端工具层执行）。
 * - 客户端桥接工具：由浏览器/Electron 渲染进程执行的本地能力（读写 XML、导出等）。
 */
export const AI_TOOL_NAMES = {
  DRAWIO_READ: "drawio_read",
  DRAWIO_EDIT_BATCH: "drawio_edit_batch",
} as const;

export const CLIENT_TOOL_NAMES = {
  GET_DRAWIO_XML: "get_drawio_xml",
  REPLACE_DRAWIO_XML: "replace_drawio_xml",
  EXPORT_DRAWIO: "export_drawio",
} as const;

export type AIToolName = (typeof AI_TOOL_NAMES)[keyof typeof AI_TOOL_NAMES];
export type ClientToolName =
  (typeof CLIENT_TOOL_NAMES)[keyof typeof CLIENT_TOOL_NAMES];
export type ToolName = AIToolName | ClientToolName;
