/**
 * MCP（Model Context Protocol）相关类型定义。
 *
 * - 里程碑 2（Electron IPC）实现参考：`electron/preload.js` / `electron/main.js`
 * - DrawIO 工具输入校验参考：`app/lib/schemas/drawio-tool-schemas.ts`
 */

/**
 * MCP 服务器监听地址类型。
 */
export type McpHost = "127.0.0.1" | "0.0.0.0";

/**
 * MCP 服务器状态（用于渲染进程展示/控制）。
 *
 * 对应 IPC：`electronMcp.getStatus()`（里程碑 2）。
 */
export interface McpServerStatus {
  /**
   * 是否正在运行。
   */
  running: boolean;

  /**
   * 服务器监听地址。
   *
   * - 当 `running === false` 时，可能为 `undefined` 或 `null`（Electron 主进程实现当前会返回 null）
   */
  host?: McpHost | null;

  /**
   * 服务器监听端口。
   *
   * - 当 `running === false` 时，可能为 `undefined` 或 `null`（Electron 主进程实现当前会返回 null）
   */
  port?: number | null;
}

/**
 * MCP 启动配置（渲染进程 -> 主进程）。
 *
 * 对应 IPC：`electronMcp.start(config)`（里程碑 2）。
 */
export interface McpConfig {
  /**
   * 监听地址。
   */
  host: McpHost;

  /**
   * 监听端口（建议 8000-9000；与 `electronMcp.getRandomPort()` 一致）。
   *
   * - 取值范围：1-65535
   * - 说明：自动选择端口时，默认在 8000-9000 范围内分配可用端口（Electron 侧实现）。
   *
   * @minimum 1
   * @maximum 65535
   */
  port: number;
}

/**
 * MCP 侧暴露的 DrawIO 工具名（与前端工具执行架构保持一致）。
 */
export type McpToolName = "drawio_read" | "drawio_edit_batch";

/**
 * MCP 工具调用请求（主进程转发到渲染进程）。
 *
 * 对应 IPC：`mcp-tool-request`（里程碑 2）。
 */
export interface McpToolRequest {
  /**
   * 请求 ID（用于关联响应）。
   */
  requestId: string;

  /**
   * 工具名称。
   */
  toolName: McpToolName;

  /**
   * 工具入参（透传）。
   *
   * - 具体字段由各工具 zod schema 在边界处校验（见 `app/lib/schemas/drawio-tool-schemas.ts`）
   */
  args: Record<string, unknown>;
}

/**
 * MCP 工具调用响应（渲染进程返回给主进程）。
 *
 * 说明：里程碑 2 中响应通过 `electronMcp.sendToolResponse(requestId, result)` 分两段传递；
 * 该类型用于在业务侧组合表达这两段信息。
 */
export interface McpToolResponse {
  /**
   * 请求 ID（与 McpToolRequest.requestId 对应）。
   */
  requestId: string;

  /**
   * 工具执行结果。
   */
  result: {
    success: boolean;
    data?: unknown;
    error?: string;
  };
}

/**
 * MCP 客户端类型（用于标记发起工具调用的上游）。
 */
export type McpClientType =
  | "cursor"
  | "claude-code"
  | "codex"
  | "gemini-cli"
  | "generic";
