"use strict";

const http = require("node:http");
const { randomUUID } = require("node:crypto");

const express = require("express");
const { z } = require("zod");

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const {
  StreamableHTTPServerTransport,
} = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { toErrorString } = require("../utils/to-error-string");

/**
 * @typedef {"all" | "vertices" | "edges"} DrawioReadFilter
 */

/**
 * @typedef {object} DrawioReadArgs
 * @property {string=} xpath XPath 表达式查询（可选）
 * @property {string | string[]=} id 按 mxCell ID 查询（可选）
 * @property {DrawioReadFilter=} filter 列表过滤（可选）
 */

/**
 * @typedef {"set_attribute" | "remove_attribute" | "insert_element" | "remove_element" | "replace_element" | "set_text_content"} DrawioEditOpType
 * @typedef {"append_child" | "prepend_child" | "before" | "after"} DrawioInsertPosition
 */

/**
 * @typedef {object} DrawioEditOperationBase
 * @property {DrawioEditOpType} type 操作类型
 * @property {string=} id 元素 ID（与 xpath 二选一）
 * @property {string=} xpath XPath 表达式（与 id 二选一）
 * @property {boolean=} allow_no_match 允许不匹配（可选，默认 false）
 */

/**
 * @typedef {DrawioEditOperationBase & { key: string, value: string }} DrawioEditSetAttributeOp
 * @typedef {DrawioEditOperationBase & { key: string }} DrawioEditRemoveAttributeOp
 * @typedef {DrawioEditOperationBase & { new_xml: string, position: DrawioInsertPosition }} DrawioEditInsertElementOp
 * @typedef {DrawioEditOperationBase} DrawioEditRemoveElementOp
 * @typedef {DrawioEditOperationBase & { new_xml: string }} DrawioEditReplaceElementOp
 * @typedef {DrawioEditOperationBase & { value: string }} DrawioEditSetTextContentOp
 */

/**
 * @typedef {(
 *   | DrawioEditSetAttributeOp
 *   | DrawioEditRemoveAttributeOp
 *   | DrawioEditInsertElementOp
 *   | DrawioEditRemoveElementOp
 *   | DrawioEditReplaceElementOp
 *   | DrawioEditSetTextContentOp
 * )} DrawioEditOperation
 */

/**
 * @typedef {object} DrawioEditBatchArgs
 * @property {DrawioEditOperation[]} operations 编辑操作数组
 * @property {string} description 操作描述
 */

/**
 * @typedef {object} DrawioOverwriteArgs
 * @property {string} drawio_xml 新的完整 XML 内容（必需）
 * @property {string} description 操作描述
 */

/**
 * 工具执行桥（里程碑 2 实现）。
 *
 * 注意：当前文件位于主进程侧，不直接依赖 Electron API，
 * 仅暴露 setToolExecutor 供上层注入 IPC 桥接函数。
 *
 * @type {(toolName: string, args: any) => Promise<any>}
 */
let executeInRenderer = async (_toolName, _args) => {
  throw new Error(
    "Tool execution bridge not initialized. Call setToolExecutor() first.",
  );
};

/**
 * 注入工具执行器（通常为 IPC 桥）。
 *
 * @param {(toolName: string, args: any) => Promise<any>} executor 执行器
 * @returns {void}
 */
function setToolExecutor(executor) {
  if (typeof executor !== "function") {
    throw new TypeError(
      "setToolExecutor(executor): executor must be a function",
    );
  }
  executeInRenderer = executor;
}

/**
 * MCP 会话存储（key = sessionId）。
 *
 * @type {Record<string, { transport: import("@modelcontextprotocol/sdk/server/streamableHttp.js").StreamableHTTPServerTransport, server: import("@modelcontextprotocol/sdk/server/mcp.js").McpServer }>}
 */
const transports = Object.create(null);

/** @type {ReturnType<typeof http.createServer> | null} */
let httpServer = null;
/** @type {boolean} */
let isRunning = false;
/** @type {string | null} */
let boundHost = null;
/** @type {number | null} */
let boundPort = null;

/**
 * 创建一个 JSON-RPC 风格的错误响应（便于客户端可读）。
 *
 * @param {import("express").Response} res
 * @param {number} status
 * @param {number} code
 * @param {string} message
 */
function sendJsonRpcError(res, status, code, message) {
  res.status(status).json({
    jsonrpc: "2.0",
    error: { code, message },
    id: null,
  });
}

/**
 * 判断请求体是否包含 initialize 请求。
 *
 * @param {unknown} body
 * @returns {boolean}
 */
function isInitializeBody(body) {
  /** @type {any[]} */
  let items = [];
  if (Array.isArray(body)) {
    items = body;
  } else if (body) {
    items = [body];
  }
  return items.some(
    (msg) => msg && typeof msg === "object" && msg.method === "initialize",
  );
}

/**
 * 删除并关闭指定 session 的资源（幂等）。
 *
 * @param {string} sessionId
 * @returns {Promise<void>}
 */
async function cleanupSession(sessionId) {
  const entry = transports[sessionId];
  if (!entry) return;

  delete transports[sessionId];

  // 先关闭 server，再关闭 transport（都应为幂等；这里确保资源释放顺序可预测）
  try {
    await entry.server.close();
  } catch {
    // 忽略：关闭期间的异常不应阻塞清理流程
  }

  try {
    await entry.transport.close();
  } catch {
    // 忽略
  }
}

/**
 * 注册 DrawIO 工具到指定 MCP Server 实例（每个 session 独立 server）。
 *
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @returns {void}
 */
function registerDrawioTools(server) {
  const readSchema = z
    .object({
      xpath: z.string().optional(),
      id: z.union([z.string(), z.array(z.string()).min(1)]).optional(),
      filter: z.enum(["all", "vertices", "edges"]).optional(),
    })
    .strict();

  const targetSchema = z
    .object({
      id: z.string().optional(),
      xpath: z.string().optional(),
    })
    .strict()
    .refine((v) => (v.id ? 1 : 0) + (v.xpath ? 1 : 0) === 1, {
      message: "Exactly one of 'id' or 'xpath' is required",
    });

  const baseOpSchema = z
    .object({
      allow_no_match: z.boolean().optional(),
    })
    .strict();

  const opSchema = z.discriminatedUnion("type", [
    z
      .object({
        type: z.literal("set_attribute"),
        key: z.string().min(1),
        value: z.string(),
      })
      .merge(targetSchema)
      .merge(baseOpSchema),
    z
      .object({
        type: z.literal("remove_attribute"),
        key: z.string().min(1),
      })
      .merge(targetSchema)
      .merge(baseOpSchema),
    z
      .object({
        type: z.literal("insert_element"),
        new_xml: z.string().min(1),
        position: z.enum(["append_child", "prepend_child", "before", "after"]),
      })
      .merge(targetSchema)
      .merge(baseOpSchema),
    z
      .object({
        type: z.literal("remove_element"),
      })
      .merge(targetSchema)
      .merge(baseOpSchema),
    z
      .object({
        type: z.literal("replace_element"),
        new_xml: z.string().min(1),
      })
      .merge(targetSchema)
      .merge(baseOpSchema),
    z
      .object({
        type: z.literal("set_text_content"),
        value: z.string(),
      })
      .merge(targetSchema)
      .merge(baseOpSchema),
  ]);

  const editBatchSchema = z
    .object({
      operations: z.array(opSchema).min(1),
      description: z.string().min(1),
    })
    .strict();

  const overwriteSchema = z
    .object({
      drawio_xml: z.string().min(1),
      description: z.string().min(1),
    })
    .strict();

  server.registerTool(
    "drawio_read",
    {
      description: "读取当前 DrawIO 图表的 XML 内容",
      inputSchema: readSchema,
    },
    /** @param {DrawioReadArgs} args */
    async (args) => {
      try {
        const result = await executeInRenderer("drawio_read", args);
        /** @type {string} */
        let xml;
        if (typeof result === "string") {
          xml = result;
        } else if (
          result &&
          typeof result === "object" &&
          typeof result.xml === "string"
        ) {
          xml = result.xml;
        } else {
          xml = JSON.stringify(result ?? "");
        }

        return { content: [{ type: "text", text: xml }] };
      } catch (err) {
        const message = toErrorString(err);
        return {
          isError: true,
          content: [{ type: "text", text: message }],
        };
      }
    },
  );

  server.registerTool(
    "drawio_edit_batch",
    {
      description: "批量编辑 DrawIO 图表元素",
      inputSchema: editBatchSchema,
    },
    /** @param {DrawioEditBatchArgs} args */
    async (args) => {
      try {
        const result = await executeInRenderer("drawio_edit_batch", args);
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (err) {
        const message = toErrorString(err);
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: message }) }],
        };
      }
    },
  );

  server.registerTool(
    "drawio_overwrite",
    {
      description: "覆盖整个 DrawIO 图表的 XML 内容",
      inputSchema: overwriteSchema,
    },
    /** @param {DrawioOverwriteArgs} args */
    async (args) => {
      try {
        const result = await executeInRenderer("drawio_overwrite", args);
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (err) {
        const message = toErrorString(err);
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: message }) }],
        };
      }
    },
  );
}

/**
 * 创建并连接一个新的会话（transport + server），并将其纳入 transports 映射。
 *
 * 注意：sessionId 由 transport 在 initialize 请求时生成，并通过 onsessioninitialized 回调注入映射。
 *
 * @returns {{ transport: import("@modelcontextprotocol/sdk/server/streamableHttp.js").StreamableHTTPServerTransport, server: import("@modelcontextprotocol/sdk/server/mcp.js").McpServer }}
 */
async function createSession() {
  // 需求约束：使用 McpServer 官方 SDK 实例
  const server = new McpServer({
    name: "drawio2go",
    version: "1.0.0",
  });

  registerDrawioTools(server);

  /** @type {import("@modelcontextprotocol/sdk/server/streamableHttp.js").StreamableHTTPServerTransport} */
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    // 便于在 Electron/本地场景中直接通过 JSON 响应完成交互（无需强依赖 SSE 客户端实现）
    enableJsonResponse: true,
    onsessioninitialized: (sessionId) => {
      transports[sessionId] = { transport, server };
    },
    onsessionclosed: async (sessionId) => {
      await cleanupSession(sessionId);
    },
  });

  // McpServer.connect 会接管 transport 的回调；每个会话使用独立 server 实例
  await server.connect(transport);

  return { transport, server };
}

/**
 * 获取当前 MCP Server 运行状态。
 *
 * @returns {{ running: boolean, host: string | null, port: number | null }}
 */
function getStatus() {
  return { running: isRunning, host: boundHost, port: boundPort };
}

/**
 * 启动 MCP HTTP 服务（Express + Streamable HTTP Transport）。
 *
 * - 端点：POST/GET/DELETE `/mcp`
 * - 会话：使用 `mcp-session-id` header（由 SDK 在 initialize 时返回）
 *
 * @param {string} host 监听地址（如 127.0.0.1）
 * @param {number} port 监听端口
 * @returns {Promise<void>}
 */
async function start(host, port) {
  if (isRunning || httpServer) {
    throw new Error("MCP server already running");
  }
  if (typeof host !== "string" || host.trim().length === 0) {
    throw new TypeError("start(host, port): host must be a non-empty string");
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new TypeError("start(host, port): port must be an integer 0~65535");
  }

  const app = express();
  // DrawIO XML 可能较大，需提升 body 限制避免 413
  app.use(express.json({ limit: "20mb" }));

  /**
   * 统一获取会话对应的 transport。
   *
   * @param {import("express").Request} req
   * @returns {import("@modelcontextprotocol/sdk/server/streamableHttp.js").StreamableHTTPServerTransport | null}
   */
  function getTransportFromRequest(req) {
    const sessionId = req.header("mcp-session-id");
    if (!sessionId) return null;
    const entry = transports[sessionId];
    return entry ? entry.transport : null;
  }

  app.post("/mcp", async (req, res) => {
    try {
      const sessionId = req.header("mcp-session-id");
      if (!sessionId) {
        if (!isInitializeBody(req.body)) {
          sendJsonRpcError(
            res,
            400,
            -32000,
            "Bad Request: Mcp-Session-Id header is required",
          );
          return;
        }

        const { transport } = await createSession();
        await transport.handleRequest(req, res, req.body);
        return;
      }

      const transport = getTransportFromRequest(req);
      if (!transport) {
        sendJsonRpcError(res, 404, -32001, "Session not found");
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      const message = toErrorString(err);
      sendJsonRpcError(res, 500, -32000, message);
    }
  });

  app.get("/mcp", async (req, res) => {
    try {
      const transport = getTransportFromRequest(req);
      if (!transport) {
        sendJsonRpcError(
          res,
          400,
          -32000,
          "Bad Request: Mcp-Session-Id header is required",
        );
        return;
      }
      await transport.handleRequest(req, res);
    } catch (err) {
      const message = toErrorString(err);
      sendJsonRpcError(res, 500, -32000, message);
    }
  });

  app.delete("/mcp", async (req, res) => {
    try {
      const transport = getTransportFromRequest(req);
      if (!transport) {
        sendJsonRpcError(
          res,
          400,
          -32000,
          "Bad Request: Mcp-Session-Id header is required",
        );
        return;
      }
      await transport.handleRequest(req, res);
    } catch (err) {
      const message = toErrorString(err);
      sendJsonRpcError(res, 500, -32000, message);
    }
  });

  const createdServer = http.createServer(app);
  httpServer = createdServer;

  try {
    await new Promise((resolve, reject) => {
      createdServer.once("error", (err) => {
        // EADDRINUSE：端口被占用
        // EACCES：无权限绑定（通常是 <1024 或受限环境）
        reject(err);
      });

      createdServer.listen({ host, port }, () => resolve());
    });
  } catch (err) {
    httpServer = null;
    throw err;
  }

  isRunning = true;
  boundHost = host;
  boundPort = port;
}

/**
 * 停止 MCP HTTP 服务，并关闭所有会话（优雅关闭，幂等）。
 *
 * @returns {Promise<void>}
 */
async function stop() {
  if (!httpServer) {
    isRunning = false;
    boundHost = null;
    boundPort = null;
    return;
  }

  const serverToClose = httpServer;
  httpServer = null;
  isRunning = false;
  boundHost = null;
  boundPort = null;

  await new Promise((resolve, reject) => {
    serverToClose.close((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });

  const sessionIds = Object.keys(transports);
  await Promise.all(sessionIds.map((id) => cleanupSession(id)));
}

module.exports = {
  start,
  stop,
  getStatus,
  setToolExecutor,
};
