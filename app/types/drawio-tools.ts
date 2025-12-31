/**
 * DrawIO XML 操作工具的类型定义
 */

import type { ToolResult } from "./tool-errors";

/**
 * 获取 XML 的返回结果（前端存储访问）
 */
export type GetXMLResult = ToolResult<{
  xml: string;
}>;

/**
 * 替换 XML 的返回结果（前端存储访问）
 */
export type ReplaceXMLResult = ToolResult<{
  message: string;
  xml?: string;
}>;

/**
 * DrawIO merge 事件上下文（用于调试与错误定位）
 */
export interface DrawioMergeEventContext {
  operation: "merge";
  timestamp: number;
}

/**
 * DrawIO merge 失败事件 detail（通过 CustomEvent("drawio-merge-error") 派发）
 *
 * - `error`：原始错误（可能是对象/字符串）
 * - `errorText`：对 `error` 的可读序列化结果（用于展示/日志）
 * - `message`：DrawIO 返回的消息（如有）
 * - `requestId`：请求 ID（用于串联 merge 请求与回调）
 * - `context`：上下文信息（操作类型、时间戳）
 */
export interface DrawioMergeErrorEventDetail {
  error?: unknown;
  errorText?: string;
  message?: string;
  requestId?: string;
  context?: DrawioMergeEventContext;
}

/**
 * DrawIO merge 成功事件 detail（通过 CustomEvent("drawio-merge-success") 派发）
 */
export interface DrawioMergeSuccessEventDetail {
  requestId?: string;
  context?: DrawioMergeEventContext;
}

/**
 * XML 验证结果
 */
export interface XmlErrorLocation {
  line: number;
  column: number;
  lineText: string;
  pointer: string;
}

export type XMLValidationResult =
  | { valid: true }
  | { valid: false; error: string; location?: XmlErrorLocation };

/**
 * drawio_read 查询结果的统一类型
 */
export type DrawioQueryResult =
  | DrawioElementResult
  | DrawioAttributeResult
  | DrawioTextResult;

/**
 * 查询结果基类
 */
interface DrawioQueryResultBase {
  matched_xpath: string;
}

export interface DrawioElementResult extends DrawioQueryResultBase {
  type: "element";
  tag_name: string;
  attributes: Record<string, string>;
  children?: Array<{
    tag_name: string;
    attributes: Record<string, string>;
  }>;
  xml_string: string;
}

export interface DrawioAttributeResult extends DrawioQueryResultBase {
  type: "attribute";
  name: string;
  value: string;
}

export interface DrawioTextResult extends DrawioQueryResultBase {
  type: "text";
  value: string;
}

/**
 * ls 模式的精简结果，用于列出 mxCell。
 */
export interface DrawioListResult {
  id: string;
  type: "vertex" | "edge" | "unknown";
  attributes: Record<string, string>;
  /** 匹配到的 XPath，便于后续继续操作 */
  matched_xpath: string;
}

/**
 * drawio_read 响应。
 * - XPath / id 查询：返回 DrawioQueryResult[]
 * - ls 模式：返回 DrawioListResult[]
 */
export type DrawioReadResult =
  | ToolResult<{
      results: DrawioQueryResult[];
      list?: undefined;
    }>
  | ToolResult<{
      list: DrawioListResult[];
      results?: undefined;
    }>;

export type DrawioEditBatchResult = ToolResult<{
  operations_applied: number;
  warnings?: string[];
  layout_check?: {
    overlaps_found: number;
    overlaps_sample: Array<{
      edgeId: string;
      vertexId: string;
      seg: [number, number, number, number]; // [x1, y1, x2, y2] 重叠线段起点和终点
      vtx: [number, number]; // [cx, cy] 顶点中心坐标
    }>;
  };
}>;

/**
 * DrawIO 选中元素信息
 */
export interface DrawioSelectionInfo {
  count: number;
  cells: DrawioCellInfo[];
}

/**
 * DrawIO 单个选中元素信息
 */
export interface DrawioCellInfo {
  id: string;
  type: "vertex" | "edge" | "unknown";
  value: unknown;
  style: string;
  label: string;
  geometry?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
}

/**
 * ⚠️ 输入参数类型已迁移：
 * - DrawioReadInput / DrawioEditOperation / DrawioEditBatchRequest
 *   请从 `app/lib/schemas/drawio-tool-schemas.ts` 导入 zod 推导类型。
 * 本文件保留结果与 UI 相关类型，作为运行时返回值的单一真源。
 */
