/**
 * Socket 相关的共享类型
 *
 * 为工具调用请求携带项目/会话上下文，便于前端按项目过滤。
 */
export interface ToolCallRequest {
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
  projectUuid: string;
  conversationId: string;
  /**
   * 单次聊天请求（一次 sendMessage）对应的运行 ID。
   * 用于在用户取消后，前端忽略来自已取消 run 的工具调用，避免继续修改图表。
   */
  chatRunId?: string;
  /**
   * 工具调用的简短描述，便于日志与调试；可选保持向后兼容。
   */
  description?: string;
}

/**
 * 工具执行上下文（项目 + 对话）
 */
export interface ToolExecutionContext {
  projectUuid: string;
  conversationId: string;
  /**
   * 单次聊天请求运行 ID（客户端生成并透传）。
   */
  chatRunId?: string;
  /**
   * 用于在用户取消/断开时中止后端的工具执行等待。
   * 仅在服务端 Chat API 路由中注入；不会通过 Socket 传输。
   */
  abortSignal?: AbortSignal;
}
