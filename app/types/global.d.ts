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
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }> | undefined;

  /**
   * Electron API
   * 通过 preload.js 注入的 API
   */
  interface Window {
    electron?: {
      selectFolder: () => Promise<string | null>;
      saveDiagram: (xml: string, defaultPath?: string) => Promise<{ success: boolean; message?: string; filePath?: string }>;
      loadDiagram: () => Promise<{ success: boolean; xml?: string; filePath?: string; message?: string }>;
      openExternal: (url: string) => Promise<void>;
      showSaveDialog: (options: {
        defaultPath?: string;
        filters?: { name: string; extensions: string[] }[];
      }) => Promise<string | null>;
      showOpenDialog: (options: {
        filters?: { name: string; extensions: string[] }[];
        properties?: string[];
      }) => Promise<string[] | null>;
      writeFile: (filePath: string, data: string) => Promise<{ success: boolean; error?: string }>;
      readFile: (filePath: string) => Promise<string>;
      enableSelectionWatcher: () => Promise<{ success: boolean; message?: string }>;
    };
  }
}

declare module 'xpath' {
  import type { Document, Node } from '@xmldom/xmldom';

  export type XPathValue = Node | string | number | boolean;

  export function select(
    expression: string,
    node: Node | Document
  ): XPathValue | XPathValue[];
}

export {};
