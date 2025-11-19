/**
 * Socket.IO 通讯协议类型定义
 *
 * 定义后端和前端之间通过 Socket.IO 传递的消息格式
 */

/**
 * 后端 → 前端：工具调用请求
 */
export interface ToolCallRequest {
  requestId: string;
  toolName: "get_drawio_xml" | "replace_drawio_xml";
  input: Record<string, unknown>;
  timeout: number;
  /**
   * AI 侧传入的操作描述，供自动版本创建时生成版本描述使用
   */
  description?: string;
  /**
   * 记录触发该请求的原始工具名称（用于区分 drawio_edit_batch / drawio_overwrite）
   */
  _originalTool?: string;
}

/**
 * 前端 → 后端：工具执行结果
 */
export interface ToolCallResult {
  requestId: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Socket.IO 服务器到客户端事件类型
 */
export interface ServerToClientEvents {
  "tool:execute": (request: ToolCallRequest) => void;
}

/**
 * Socket.IO 客户端到服务器事件类型
 */
export interface ClientToServerEvents {
  "tool:result": (result: ToolCallResult) => void;
}
