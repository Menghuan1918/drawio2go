/**
 * 全局类型声明
 *
 * 用于声明挂载到 global 对象上的变量
 */

import type { Server } from 'socket.io';

declare global {
  /**
   * Socket.IO 服务器实例
   * 在 server.js 中初始化，在 API Routes 中使用
   */
  var io: Server | undefined;

  /**
   * 待处理的工具调用请求
   * key: requestId, value: { resolve, reject }
   */
  var pendingRequests: Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  }> | undefined;
}

export {};
