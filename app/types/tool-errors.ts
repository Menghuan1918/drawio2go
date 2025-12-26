/**
 * 工具错误的统一结构（用于 tool output / UI 展示 / 存储持久化）
 *
 * 约定：
 * - `errorText`：面向 UI 的简短错误摘要（放在 tool part 顶层）
 * - `output`：可序列化的结构化信息（放在 tool part.output）
 * - `errorDetails`：结构化错误详情（建议放在 ToolErrorResult.errorDetails，必要时也可在 part 顶层冗余）
 */

export type ToolErrorKind =
  | "zod_validation"
  | "xml_parse"
  | "xpath_error"
  | "drawio_operation"
  | "page_filter"
  | "replace_xml"
  | "timeout"
  | "aborted"
  | "unknown";

export interface ToolErrorDetailsBase {
  kind: ToolErrorKind | (string & {});
  code?: number | string;
  [key: string]: unknown;
}

export interface ToolZodValidationErrorDetails extends ToolErrorDetailsBase {
  kind: "zod_validation";
  issues: Array<{
    path: Array<string | number>;
    message: string;
    code?: string;
    expected?: unknown;
    received?: unknown;
  }>;
}

export interface ToolXmlParseErrorDetails extends ToolErrorDetailsBase {
  kind: "xml_parse";
  error: string;
  rawError?: string;
  location?: {
    line: number;
    column: number;
    lineText: string;
    pointer: string;
  };
  formatted?: string;
}

export interface ToolXpathErrorDetails extends ToolErrorDetailsBase {
  kind: "xpath_error";
  expression: string;
  error: string;
}

export interface ToolDrawioOperationErrorDetails extends ToolErrorDetailsBase {
  kind: "drawio_operation";
  operationIndex: number;
  operationsTotal: number;
  /**
   * 已成功应用的操作数量（在遇到失败/阻塞时用于提示“已执行到哪里”）。
   *
   * - 兼容旧实现：该字段可选
   */
  operationsApplied?: number;
  operationType: string;
  /**
   * 失败的原始操作对象（便于调试/复制）。
   *
   * - 该字段可能包含较大的 new_xml 片段，因此保持可选
   */
  operation?: Record<string, unknown>;
  locator: {
    id?: string;
    xpath?: string;
  };
  allowNoMatch?: boolean;
  error: string;
}

export interface ToolPageFilterErrorDetails extends ToolErrorDetailsBase {
  kind: "page_filter";
  selectedPageIds: string[];
  invalidPageIds: string[];
}

export interface ToolReplaceXmlErrorDetails extends ToolErrorDetailsBase {
  kind: "replace_xml";
  error: string;
  message?: string;
  requestId?: string;
  isRollback?: boolean;
}

export type ToolErrorDetails =
  | ToolZodValidationErrorDetails
  | ToolXmlParseErrorDetails
  | ToolXpathErrorDetails
  | ToolDrawioOperationErrorDetails
  | ToolPageFilterErrorDetails
  | ToolReplaceXmlErrorDetails
  | ToolErrorDetailsBase;

export interface ToolErrorResult<
  TDetails extends ToolErrorDetails = ToolErrorDetails,
> {
  success: false;
  /**
   * 错误码或简短标识（用于程序判定/日志串联）
   */
  error: string;
  /**
   * 用户可读的错误消息（用于 UI 展示）
   */
  message: string;
  /**
   * 可选的结构化错误详情（用于展开查看/复制/调试）
   */
  errorDetails?: TDetails;
}

export type ToolResult<
  TSuccess extends Record<string, unknown>,
  TDetails extends ToolErrorDetails = ToolErrorDetails,
> = ({ success: true } & TSuccess) | ToolErrorResult<TDetails>;

export function isToolErrorResult(value: unknown): value is ToolErrorResult {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { success?: unknown }).success === false &&
    typeof (value as { error?: unknown }).error === "string" &&
    typeof (value as { message?: unknown }).message === "string"
  );
}
