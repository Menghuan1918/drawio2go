/**
 * 全局类型声明
 *
 * 用于声明挂载到 global 对象上的变量
 */

import type { Server } from "socket.io";
import type {
  Setting,
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  XMLVersion,
  CreateXMLVersionInput,
  Conversation,
  CreateConversationInput,
  UpdateConversationInput,
  Message,
  CreateMessageInput,
} from "@/lib/storage/types";

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
  var pendingRequests:
    | Map<
        string,
        {
          resolve: (value: unknown) => void;
          reject: (error: Error) => void;
        }
      >
    | undefined;

  /**
   * Electron API
   * 通过 preload.js 注入的 API
   */
  interface Window {
    electron?: {
      selectFolder: () => Promise<string | null>;
      saveDiagram: (
        xml: string,
        defaultPath?: string,
      ) => Promise<{ success: boolean; message?: string; filePath?: string }>;
      loadDiagram: () => Promise<{
        success: boolean;
        xml?: string;
        filePath?: string;
        message?: string;
      }>;
      openExternal: (url: string) => Promise<void>;
      showSaveDialog: (options: {
        defaultPath?: string;
        filters?: { name: string; extensions: string[] }[];
      }) => Promise<string | null>;
      showOpenDialog: (options: {
        filters?: { name: string; extensions: string[] }[];
        properties?: string[];
      }) => Promise<string[] | null>;
      writeFile: (
        filePath: string,
        data: string,
      ) => Promise<{ success: boolean; error?: string }>;
      readFile: (filePath: string) => Promise<string>;
      enableSelectionWatcher: () => Promise<{
        success: boolean;
        message?: string;
      }>;
    };

    /**
     * Electron 存储 IPC 接口
     * 仅在 Electron 环境下可用
     */
    electronStorage?: {
      // 初始化
      initialize: () => Promise<void>;

      // Settings
      getSetting: (key: string) => Promise<string | null>;
      setSetting: (key: string, value: string) => Promise<void>;
      deleteSetting: (key: string) => Promise<void>;
      getAllSettings: () => Promise<Setting[]>;

      // Projects
      getProject: (uuid: string) => Promise<Project | null>;
      createProject: (project: CreateProjectInput) => Promise<Project>;
      updateProject: (
        uuid: string,
        updates: UpdateProjectInput,
      ) => Promise<void>;
      deleteProject: (uuid: string) => Promise<void>;
      getAllProjects: () => Promise<Project[]>;

      // XMLVersions
      getXMLVersion: (id: number) => Promise<XMLVersion | null>;
      createXMLVersion: (version: CreateXMLVersionInput) => Promise<XMLVersion>;
      getXMLVersionsByProject: (projectUuid: string) => Promise<XMLVersion[]>;
      deleteXMLVersion: (id: number) => Promise<void>;

      // Conversations
      getConversation: (id: string) => Promise<Conversation | null>;
      createConversation: (
        conversation: CreateConversationInput,
      ) => Promise<Conversation>;
      updateConversation: (
        id: string,
        updates: UpdateConversationInput,
      ) => Promise<void>;
      deleteConversation: (id: string) => Promise<void>;
      getConversationsByProject: (
        projectUuid: string,
      ) => Promise<Conversation[]>;
      getConversationsByXMLVersion: (
        xmlVersionId: number,
      ) => Promise<Conversation[]>;

      // Messages
      getMessagesByConversation: (conversationId: string) => Promise<Message[]>;
      createMessage: (message: CreateMessageInput) => Promise<Message>;
      deleteMessage: (id: string) => Promise<void>;
      createMessages: (messages: CreateMessageInput[]) => Promise<Message[]>;
    };
  }
}

declare module "xpath" {
  import type { Document, Node } from "@xmldom/xmldom";

  export type XPathValue = Node | string | number | boolean;

  export function select(
    expression: string,
    node: Node | Document,
  ): XPathValue | XPathValue[];
}

export {};
