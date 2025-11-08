/**
 * 工具执行器
 *
 * 提供两种执行方式：
 * 1. executeToolOnClient - 通过 Socket.IO 在前端执行（用于 DrawIO 工具）
 * 2. executeToolOnServer - 直接在后端执行（预留接口，用于未来的后端工具）
 */

import { v4 as uuidv4 } from "uuid";
import type { ToolCallRequest } from "@/app/types/socket-protocol";

/**
 * 通过 Socket.IO 在客户端执行工具
 *
 * @param toolName - 工具名称
 * @param input - 工具输入参数
 * @param timeout - 超时时间（毫秒），默认 30000ms (30秒)
 * @returns Promise<unknown> - 工具执行结果
 *
 * @throws Error - 当 Socket.IO 未初始化、连接断开或执行超时时抛出错误
 */
export async function executeToolOnClient(
  toolName: string,
  input: Record<string, unknown>,
  timeout: number = 30000,
): Promise<unknown> {
  // 获取全局 Socket.IO 实例
  const io = global.io;
  const pendingRequests = global.pendingRequests;

  if (!pendingRequests) {
    throw new Error("pendingRequests 未初始化");
  }

  if (!io) {
    throw new Error("Socket.IO 服务器未初始化");
  }

  // 检查是否有客户端连接
  const connectedClients = io.sockets.sockets.size;
  if (connectedClients === 0) {
    throw new Error(
      "没有客户端连接，无法执行工具。请确保前端已连接到 Socket.IO 服务器。",
    );
  }

  const requestId = uuidv4();

  return new Promise((resolve, reject) => {
    // 设置超时
    const timeoutId = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error(`工具执行超时 (${timeout}ms)，前端未响应`));
    }, timeout);

    // 存储 Promise 回调
    pendingRequests.set(requestId, {
      resolve: (result: unknown) => {
        clearTimeout(timeoutId);
        resolve(result);
      },
      reject: (error: Error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    });

    // 构造请求消息
    const request: ToolCallRequest = {
      requestId,
      toolName: toolName as ToolCallRequest["toolName"],
      input,
      timeout,
    };

    // 广播到所有连接的客户端
    io.emit("tool:execute", request);

    console.log(
      `[Tool Executor] 已发送工具调用请求: ${toolName} (${requestId}), 连接客户端数: ${connectedClients}`,
    );
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
