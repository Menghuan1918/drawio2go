/**
 * 存储层类型定义
 *
 * 定义所有数据模型的 TypeScript 类型
 *
 * @module storage/types
 */

// ==================== Settings ====================

/**
 * 设置键值对
 */
export interface Setting {
  key: string;
  value: string;
  updated_at: number;
}

// ==================== Projects ====================

/**
 * 工程实体
 * 临时实现：固定使用 uuid="default" 的工程
 */
export interface Project {
  uuid: string;
  name: string;
  description?: string;
  active_xml_version_id?: number;
  active_conversation_id?: string;
  created_at: number;
  updated_at: number;
}

/**
 * 创建工程时的输入类型
 */
export type CreateProjectInput = Omit<Project, "created_at" | "updated_at">;

/**
 * 更新工程时的输入类型
 */
export type UpdateProjectInput = Partial<
  Omit<Project, "uuid" | "created_at" | "updated_at">
>;

// ==================== XMLVersions ====================

/**
 * XML 版本实体
 * 临时实现：所有版本固定为 semantic_version="1.0.0"
 */
export interface XMLVersion {
  id: number;
  project_uuid: string;
  semantic_version: string;
  name?: string;
  description?: string;
  source_version_id: number; // 0 表示首个版本
  xml_content: string;
  preview_image?: Blob | Buffer; // 预览图（Web: Blob, Electron: Buffer）
  created_at: number;
}

/**
 * 创建 XML 版本时的输入类型
 */
export type CreateXMLVersionInput = Omit<XMLVersion, "id" | "created_at">;

/**
 * 预览图数据类型（用于 IPC 传输）
 */
export interface PreviewImageData {
  buffer: ArrayBuffer;
  mimeType: string; // 'image/png' | 'image/jpeg'
}

// ==================== Conversations ====================

/**
 * 对话实体
 * 新增 xml_version_id 字段，关联特定的 XML 版本
 */
export interface Conversation {
  id: string;
  project_uuid: string;
  xml_version_id: number; // 关联的 XML 版本 ID
  title: string;
  created_at: number;
  updated_at: number;
}

/**
 * 创建对话时的输入类型
 */
export type CreateConversationInput = Omit<
  Conversation,
  "created_at" | "updated_at"
>;

/**
 * 更新对话时的输入类型
 */
export type UpdateConversationInput = Partial<
  Omit<Conversation, "id" | "created_at">
>;

// ==================== Messages ====================

/**
 * 消息角色
 */
export type MessageRole = "user" | "assistant" | "system";

/**
 * 消息实体
 */
export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  tool_invocations?: string; // JSON 序列化的工具调用记录
  model_name?: string | null; // 发送消息时使用的模型
  created_at: number;
}

/**
 * 创建消息时的输入类型
 */
export type CreateMessageInput = Omit<Message, "created_at">;
