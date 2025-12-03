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
  active_xml_version_id?: string | null;
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
 * 采用关键帧 + Diff 混合存储
 */
export interface XMLVersion {
  id: string;
  project_uuid: string;
  semantic_version: string;
  name?: string;
  description?: string;
  source_version_id: string; // ZERO_SOURCE_VERSION_ID 表示关键帧
  is_keyframe: boolean;
  diff_chain_depth: number; // 距离最近关键帧的差异链长度
  xml_content: string; // 关键帧: 完整 XML; Diff: diff-match-patch 字符串
  metadata: Record<string, unknown> | null;
  page_count: number;
  page_names?: string | null; // JSON 字符串，序列化的页面名称数组
  preview_svg?: Blob | Buffer; // 第一页 SVG 预览（deflate-raw 压缩二进制）
  pages_svg?: Blob | Buffer; // 所有页面 SVG 序列化（deflate-raw 压缩）
  preview_image?: Blob | Buffer; // 预览图（Web: Blob, Electron: Buffer）
  created_at: number;
}

/**
 * XML 版本的 SVG 数据（大字段按需加载）
 */
export interface XMLVersionSVGData {
  id: string;
  project_uuid?: string;
  preview_svg?: Blob | Buffer | null;
  pages_svg?: Blob | Buffer | null;
}

/**
 * 创建 XML 版本时的输入类型
 */
export type CreateXMLVersionInput = Omit<XMLVersion, "created_at">;

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
 */
export interface Conversation {
  id: string;
  project_uuid: string;
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

/**
 * 对话导出项，包含消息列表
 */
export type ConversationExportItem = Conversation & {
  messages: Message[];
};

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
  parts_structure: string; // JSON 序列化的 parts（reasoning/text/tool）及顺序
  model_name?: string | null; // 发送消息时使用的模型
  xml_version_id?: string; // 关联的 XML 版本 ID
  sequence_number?: number; // 会话内的顺序序号，单调递增
  created_at: number;
}

/**
 * 创建消息时的输入类型
 */
export type CreateMessageInput = Omit<Message, "created_at"> & {
  created_at?: number;
  createdAt?: number;
};
