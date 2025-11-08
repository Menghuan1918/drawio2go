/**
 * DrawIO XML 操作工具的类型定义
 */

/**
 * 获取 XML 的返回结果（前端存储访问）
 */
export interface GetXMLResult {
  success: boolean;
  xml?: string;
  error?: string;
}

/**
 * 替换 XML 的返回结果（前端存储访问）
 */
export interface ReplaceXMLResult {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * XML 验证结果
 */
export interface XMLValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * drawio_read 查询结果的统一类型
 */
export type DrawioQueryResult =
  | DrawioElementResult
  | DrawioAttributeResult
  | DrawioTextResult;

interface DrawioQueryResultBase {
  matched_xpath: string;
}

export interface DrawioElementResult extends DrawioQueryResultBase {
  type: "element";
  tag_name: string;
  attributes: Record<string, string>;
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

export interface DrawioReadResult {
  success: true;
  results: DrawioQueryResult[];
}

/**
 * drawio_edit_batch 批量操作定义
 */
interface OperationBase {
  allow_no_match?: boolean;
}

export interface SetAttributeOperation extends OperationBase {
  type: "set_attribute";
  xpath: string;
  key: string;
  value: string;
}

export interface RemoveAttributeOperation extends OperationBase {
  type: "remove_attribute";
  xpath: string;
  key: string;
}

export type InsertPosition =
  | "append_child"
  | "prepend_child"
  | "before"
  | "after";

export interface InsertElementOperation extends OperationBase {
  type: "insert_element";
  target_xpath: string;
  new_xml: string;
  position?: InsertPosition;
}

export interface RemoveElementOperation extends OperationBase {
  type: "remove_element";
  xpath: string;
}

export interface ReplaceElementOperation extends OperationBase {
  type: "replace_element";
  xpath: string;
  new_xml: string;
}

export interface SetTextContentOperation extends OperationBase {
  type: "set_text_content";
  xpath: string;
  value: string;
}

export type DrawioEditOperation =
  | SetAttributeOperation
  | RemoveAttributeOperation
  | InsertElementOperation
  | RemoveElementOperation
  | ReplaceElementOperation
  | SetTextContentOperation;

export interface DrawioEditBatchRequest {
  operations: DrawioEditOperation[];
}

export interface DrawioEditBatchResult {
  success: true;
  operations_applied: number;
}

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
