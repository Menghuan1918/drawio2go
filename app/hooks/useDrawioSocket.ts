/**
 * DrawIO Socket.IO Hook
 *
 * 用于在前端建立 Socket.IO 连接，监听后端的工具调用请求并执行
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type {
  ToolCallRequest,
  ToolCallResult,
  ServerToClientEvents,
  ClientToServerEvents,
} from '@/app/types/socket-protocol';
import {
  getDrawioXML,
  replaceDrawioXML,
  batchReplaceDrawioXML,
} from '@/app/lib/drawio-tools';

/**
 * DrawIO Socket.IO Hook
 *
 * @returns { isConnected: boolean } - Socket.IO 连接状态
 */
export function useDrawioSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);

  useEffect(() => {
    // 创建 Socket.IO 客户端
    const socket = io({
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    // 连接事件
    socket.on('connect', () => {
      console.log('[Socket.IO Client] 已连接到服务器, ID:', socket.id);
      setIsConnected(true);
    });

    socket.on('disconnect', (reason: string) => {
      console.log('[Socket.IO Client] 已断开连接, 原因:', reason);
      setIsConnected(false);
    });

    socket.on('connect_error', (error: Error) => {
      console.error('[Socket.IO Client] 连接错误:', error.message);
      setIsConnected(false);
    });

    // 监听工具执行请求
    socket.on('tool:execute', async (request: ToolCallRequest) => {
      console.log(`[Socket.IO Client] 收到工具调用请求: ${request.toolName} (${request.requestId})`);

      try {
        let result: any;

        // 根据工具名称执行相应函数
        switch (request.toolName) {
          case 'get_drawio_xml':
            result = getDrawioXML();
            break;

          case 'replace_drawio_xml':
            if (!request.input?.drawio_xml) {
              throw new Error('缺少 drawio_xml 参数');
            }
            result = replaceDrawioXML(request.input.drawio_xml);
            break;

          case 'batch_replace_drawio_xml':
            if (!request.input?.replacements) {
              throw new Error('缺少 replacements 参数');
            }
            result = batchReplaceDrawioXML(request.input.replacements);
            break;

          default:
            throw new Error(`未知工具: ${request.toolName}`);
        }

        // 返回成功结果
        const response: ToolCallResult = {
          requestId: request.requestId,
          success: result.success,
          result: result,
          error: result.success ? undefined : (result.error || result.message),
        };

        socket.emit('tool:result', response);
        console.log(`[Socket.IO Client] 已返回工具执行结果: ${request.toolName}, success: ${result.success}`);

      } catch (error) {
        // 返回错误结果
        const response: ToolCallResult = {
          requestId: request.requestId,
          success: false,
          error: error instanceof Error ? error.message : '未知错误',
        };

        socket.emit('tool:result', response);
        console.error(`[Socket.IO Client] 工具执行失败:`, error);
      }
    });

    // 清理函数
    return () => {
      console.log('[Socket.IO Client] 断开连接');
      socket.disconnect();
    };
  }, []);

  return { isConnected };
}
