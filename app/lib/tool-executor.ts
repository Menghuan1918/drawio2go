/**
 * 工具执行器
 *
 * 提供两种执行方式：
 * 1. executeToolOnClient - 通过 Socket.IO 在前端执行（用于 DrawIO 工具）
 * 2. executeToolOnServer - 直接在后端执行（预留接口，用于未来的后端工具）
 */

import { v4 as uuidv4 } from "uuid";
import type { ToolCallRequest } from "@/app/types/socket-protocol";
import { TOOL_TIMEOUT_CONFIG } from "@/lib/constants/tool-config";
import type { ClientToolName } from "@/lib/constants/tool-names";
import { createLogger } from "@/lib/logger";

const logger = createLogger("Tool Executor");

export type ExecuteToolOnClientOptions = {
  signal?: AbortSignal;
  chatRunId?: string;
};

function createAbortError(message: string): Error {
  const error = new Error(message);
  (error as Error & { name?: string }).name = "AbortError";
  return error;
}

function getCancelledChatRunIds(): Map<string, number> {
  if (!global.cancelledChatRunIds) {
    global.cancelledChatRunIds = new Map();
  }
  return global.cancelledChatRunIds;
}

/**
 * 通过 Socket.IO 在客户端执行工具
 *
 * @param toolName - 工具名称（前端执行工具）
 * @param input - 工具输入参数
 * @param projectUuid - 所属项目 ID
 * @param conversationId - 当前会话 ID
 * @param description - 工具调用描述
 * @param options - 可选的取消/运行上下文
 * @returns Promise<unknown> - 工具执行结果
 *
 * @throws Error - 当 Socket.IO 未初始化、连接断开或执行超时时抛出错误
 */
export async function executeToolOnClient(
  toolName: ClientToolName,
  input: Record<string, unknown>,
  projectUuid: string,
  conversationId: string,
  description?: string,
  options?: ExecuteToolOnClientOptions,
): Promise<unknown> {
  const timeout =
    TOOL_TIMEOUT_CONFIG[toolName] ??
    (TOOL_TIMEOUT_CONFIG as Record<string, number>)[toolName] ??
    60000;

  // 默认超时增加到 60 秒，以支持版本创建等耗时操作
  // 获取全局 Socket.IO 实例
  const io = global.io;
  const pendingRequests = global.pendingRequests;
  const emitToolExecute = global.emitToolExecute;

  if (!pendingRequests) {
    throw new Error("pendingRequests 未初始化");
  }

  if (!io) {
    throw new Error("Socket.IO 服务器未初始化");
  }

  const normalizedProjectUuid = projectUuid.trim();
  const normalizedConversationId = conversationId.trim();
  const normalizedChatRunId = options?.chatRunId?.trim() || undefined;
  const abortSignal = options?.signal;

  if (!normalizedProjectUuid || !normalizedConversationId) {
    throw new Error("缺少项目或会话上下文，无法执行工具");
  }

  if (
    normalizedChatRunId &&
    getCancelledChatRunIds().has(normalizedChatRunId)
  ) {
    throw createAbortError("聊天已取消，停止工具调用");
  }

  if (abortSignal?.aborted) {
    throw createAbortError("请求已中止，停止工具调用");
  }

  // 检查是否有客户端连接
  const connectedClients = io.sockets.sockets.size;
  if (connectedClients === 0) {
    throw new Error("目标项目没有客户端在线");
  }

  const requestId = uuidv4();

  return new Promise((resolve, reject) => {
    let cleanedUp = false;

    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      if (abortSignal) {
        abortSignal.removeEventListener("abort", onAbort);
      }
    };

    const rejectWith = (error: Error) => {
      cleanup();
      reject(error);
    };

    const resolveWith = (result: unknown) => {
      cleanup();
      resolve(result);
    };

    const onAbort = () => {
      if (cleanedUp) return;
      pendingRequests.delete(requestId);
      clearTimeout(timeoutId);

      try {
        io.to(normalizedProjectUuid).emit("tool:cancel", {
          requestId,
          projectUuid: normalizedProjectUuid,
          conversationId: normalizedConversationId,
          chatRunId: normalizedChatRunId,
          reason: "chat_aborted",
        });
      } catch {
        // best-effort
      }

      rejectWith(createAbortError("请求已中止，停止等待工具结果"));
    };

    // 设置超时
    const timeoutId = setTimeout(() => {
      pendingRequests.delete(requestId);
      rejectWith(new Error(`工具执行超时 (${timeout}ms)，前端未响应`));
    }, timeout);

    // 存储 Promise 回调
    pendingRequests.set(requestId, {
      resolve: (result: unknown) => {
        clearTimeout(timeoutId);
        resolveWith(result);
      },
      reject: (error: Error) => {
        clearTimeout(timeoutId);
        rejectWith(error);
      },
      projectUuid: normalizedProjectUuid,
      conversationId: normalizedConversationId,
      chatRunId: normalizedChatRunId,
      toolName,
    });

    // 构造请求消息
    const request: ToolCallRequest = {
      requestId,
      toolName,
      input,
      timeout,
      projectUuid: normalizedProjectUuid,
      conversationId: normalizedConversationId,
      chatRunId: normalizedChatRunId,
      description,
    };

    if (abortSignal) {
      abortSignal.addEventListener("abort", onAbort);
    }

    // 按项目房间投递
    try {
      if (typeof emitToolExecute === "function") {
        emitToolExecute(request);
      } else {
        // 兜底：如果缺失全局封装，直接使用房间广播
        const roomSize = io.sockets.adapter.rooms.get(
          normalizedProjectUuid,
        )?.size;

        if (!roomSize || roomSize === 0) {
          pendingRequests.delete(requestId);
          clearTimeout(timeoutId);
          rejectWith(new Error("目标项目没有客户端在线"));
          return;
        }

        io.to(normalizedProjectUuid).emit("tool:execute", request);
      }
    } catch (error) {
      pendingRequests.delete(requestId);
      clearTimeout(timeoutId);
      const message =
        error instanceof Error ? error.message : String(error ?? "未知错误");
      rejectWith(new Error(message));
      return;
    }

    logger.info("已发送工具调用请求", {
      toolName,
      requestId,
      projectUuid: normalizedProjectUuid,
      conversationId: normalizedConversationId,
      chatRunId: normalizedChatRunId,
      connectedClients,
      description,
    });
  });
}

/**
 * 在服务器端执行工具（预留接口）
 *
 * @param toolName - 工具名称
 * @param input - 工具输入参数
 * @returns Promise<unknown> - 工具执行结果
 *
 * @throws Error - 当工具未实现时抛出错误
 */
export async function executeToolOnServer(
  toolName: string,
  _input: Record<string, unknown>,
): Promise<unknown> {
  // 未来在这里实现后端工具
  // 例如：文件读写、数据库操作等不需要浏览器环境的工具
  throw new Error(`服务器端工具 ${toolName} 尚未实现`);
}
