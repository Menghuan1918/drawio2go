/**
 * 存储适配器抽象接口
 *
 * 所有存储实现（SQLite, IndexedDB）必须实现此接口
 *
 * @module storage/adapter
 */

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
} from './types';

/**
 * 存储适配器抽象接口
 *
 * 所有存储实现（SQLite, IndexedDB）必须实现此接口
 *
 * 设计原则：
 * - 所有方法返回 Promise，支持异步操作
 * - 使用明确的类型定义，避免 any
 * - 错误通过 Promise reject 传递
 */
export interface StorageAdapter {
  // ==================== 初始化 ====================

  /**
   * 初始化存储
   * - 创建数据库表 / Object Stores
   * - 创建默认工程（uuid="default"）
   * - 设置索引和约束
   */
  initialize(): Promise<void>;

  // ==================== Settings ====================

  /**
   * 获取设置值
   * @param key 设置键
   * @returns 设置值，不存在返回 null
   */
  getSetting(key: string): Promise<string | null>;

  /**
   * 设置值
   * @param key 设置键
   * @param value 设置值
   */
  setSetting(key: string, value: string): Promise<void>;

  /**
   * 删除设置
   * @param key 设置键
   */
  deleteSetting(key: string): Promise<void>;

  /**
   * 获取所有设置
   * @returns 所有设置的数组
   */
  getAllSettings(): Promise<Setting[]>;

  // ==================== Projects ====================

  /**
   * 获取工程
   * @param uuid 工程 UUID
   * @returns 工程实体，不存在返回 null
   */
  getProject(uuid: string): Promise<Project | null>;

  /**
   * 创建工程
   * @param project 工程数据（不包含时间戳）
   * @returns 创建后的完整工程实体
   */
  createProject(project: CreateProjectInput): Promise<Project>;

  /**
   * 更新工程
   * @param uuid 工程 UUID
   * @param updates 更新的字段（Partial）
   */
  updateProject(uuid: string, updates: UpdateProjectInput): Promise<void>;

  /**
   * 删除工程
   * @param uuid 工程 UUID
   */
  deleteProject(uuid: string): Promise<void>;

  /**
   * 获取所有工程
   * @returns 所有工程的数组
   */
  getAllProjects(): Promise<Project[]>;

  // ==================== XMLVersions ====================

  /**
   * 获取 XML 版本
   * @param id 版本 ID
   * @returns XML 版本实体，不存在返回 null
   */
  getXMLVersion(id: number): Promise<XMLVersion | null>;

  /**
   * 创建 XML 版本
   * @param version XML 版本数据（不包含 id 和时间戳）
   * @returns 创建后的完整 XML 版本实体
   */
  createXMLVersion(version: CreateXMLVersionInput): Promise<XMLVersion>;

  /**
   * 获取工程的所有 XML 版本
   * @param projectUuid 工程 UUID
   * @returns XML 版本数组（按创建时间倒序）
   */
  getXMLVersionsByProject(projectUuid: string): Promise<XMLVersion[]>;

  /**
   * 删除 XML 版本
   * @param id 版本 ID
   */
  deleteXMLVersion(id: number): Promise<void>;

  // ==================== Conversations ====================

  /**
   * 获取对话
   * @param id 对话 ID
   * @returns 对话实体，不存在返回 null
   */
  getConversation(id: string): Promise<Conversation | null>;

  /**
   * 创建对话
   * @param conversation 对话数据（不包含时间戳）
   * @returns 创建后的完整对话实体
   */
  createConversation(conversation: CreateConversationInput): Promise<Conversation>;

  /**
   * 更新对话
   * @param id 对话 ID
   * @param updates 更新的字段（Partial）
   */
  updateConversation(id: string, updates: UpdateConversationInput): Promise<void>;

  /**
   * 删除对话（级联删除关联的消息）
   * @param id 对话 ID
   */
  deleteConversation(id: string): Promise<void>;

  /**
   * 获取工程的所有对话
   * @param projectUuid 工程 UUID
   * @returns 对话数组（按更新时间倒序）
   */
  getConversationsByProject(projectUuid: string): Promise<Conversation[]>;

  /**
   * 获取 XML 版本关联的所有对话
   * @param xmlVersionId XML 版本 ID
   * @returns 对话数组（按更新时间倒序）
   */
  getConversationsByXMLVersion(xmlVersionId: number): Promise<Conversation[]>;

  // ==================== Messages ====================

  /**
   * 获取对话的所有消息
   * @param conversationId 对话 ID
   * @returns 消息数组（按创建时间正序）
   */
  getMessagesByConversation(conversationId: string): Promise<Message[]>;

  /**
   * 创建消息
   * @param message 消息数据（不包含时间戳）
   * @returns 创建后的完整消息实体
   */
  createMessage(message: CreateMessageInput): Promise<Message>;

  /**
   * 删除消息
   * @param id 消息 ID
   */
  deleteMessage(id: string): Promise<void>;

  /**
   * 批量创建消息（性能优化）
   * @param messages 消息数组
   * @returns 创建后的完整消息数组
   */
  createMessages(messages: CreateMessageInput[]): Promise<Message[]>;
}
