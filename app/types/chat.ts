import type { UIDataTypes, UIMessage, UIMessagePart, UITools } from "ai";
import type { ToolErrorDetails } from "./tool-errors";

declare module "ai" {
  interface ReasoningOutput {
    state?: "streaming" | "complete" | "done";
    durationMs?: number; // 推理耗时（毫秒）
  }
}

export type ProviderType =
  | "gemini"
  | "openai-reasoning"
  | "openai-compatible"
  | "deepseek-native"
  | "anthropic";

// JSON 可序列化的递归值类型
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

// 模型能力标记（思考与视觉）
export interface ModelCapabilities {
  supportsThinking: boolean; // 是否支持思考/推理模式
  supportsVision: boolean; // 是否支持视觉输入
}

// 供应商配置（持久化存储）
export interface ProviderConfig {
  id: string; // 唯一标识
  displayName: string; // 显示名称
  providerType: ProviderType; // 供应商类型
  apiUrl: string; // API 端点
  apiKey: string; // API 密钥
  models: string[]; // 关联的模型 ID 列表（引用 ModelConfig.id）
  customConfig: { [key: string]: JsonValue }; // 供应商级别的额外设置
  createdAt: number; // 创建时间戳（毫秒）
  updatedAt: number; // 更新时间戳（毫秒）
}

// 单个模型配置（与供应商关联）
export interface ModelConfig {
  id: string; // 唯一标识
  providerId: string; // 关联的供应商 ID（引用 ProviderConfig.id）
  modelName: string; // 模型名称（如 "deepseek-chat"）
  displayName: string; // 显示名称
  temperature: number; // 温度参数
  maxToolRounds: number; // 最大工具轮次
  isDefault: boolean; // 是否为默认模型
  capabilities: ModelCapabilities; // 模型能力标记
  enableToolsInThinking: boolean; // 思考中是否启用工具调用
  customConfig: { [key: string]: JsonValue }; // 模型级别的额外设置
  createdAt: number; // 创建时间戳（毫秒）
  updatedAt: number; // 更新时间戳（毫秒）
}

// 全局 Agent 设置
export type SkillKnowledgeId =
  | "general"
  | "basic"
  | "misc"
  | "uml"
  | "aws"
  | "azure"
  | "gcp"
  | "network";

export interface SkillSettings {
  selectedTheme: string; // 选中的风格 ID
  selectedKnowledge: SkillKnowledgeId[]; // 选中的知识 ID 列表
  customThemePrompt?: string; // 自定义风格提示词
  customKnowledgeContent?: string; // 自定义知识内容
  selectedColorTheme: string; // 选中的颜色主题 ID
}

export interface AgentSettings {
  systemPrompt: string; // 系统提示词
  updatedAt: number; // 更新时间戳（毫秒）
  skillSettings: SkillSettings; // 新对话默认 Skill 配置（风格/知识）
}

// 当前活动模型引用
export interface ActiveModelReference {
  providerId: string; // 供应商 ID
  modelId: string; // 模型 ID
  updatedAt: number; // 更新时间戳（毫秒）
}

// 运行时合并的 LLM 配置（供应商 + 模型 + Agent）
export interface RuntimeLLMConfig {
  apiUrl: string; // 供应商 API 端点
  apiKey: string; // 供应商 API 密钥
  providerType: ProviderType; // 供应商类型
  modelName: string; // 模型名称
  temperature: number; // 温度参数
  maxToolRounds: number; // 最大工具轮次
  capabilities: ModelCapabilities; // 模型能力标记
  enableToolsInThinking: boolean; // 思考中是否启用工具
  systemPrompt: string; // Agent 系统提示词
  skillSettings?: SkillSettings; // Skill 配置（可选）
  customConfig: { [key: string]: JsonValue }; // 合并后的自定义配置（模型优先）
}

// 向后兼容别名（老代码仍使用 LLMConfig）
export type LLMConfig = RuntimeLLMConfig;

export type ToolInvocationState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error"
  | "call"
  | "result";

export type ToolInvocationType =
  | "tool-call"
  | "tool-result"
  | "dynamic-tool"
  | "tool-invocation"
  | `tool-${string}`;

export interface ToolInvocation {
  type: ToolInvocationType;
  toolCallId?: string;
  toolName?: string;
  state?: ToolInvocationState;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  /**
   * 可选的结构化错误详情（与 output 可共存）
   * - 推荐：将规范化错误放在 output（ToolErrorResult），此字段可作为兼容/冗余存储
   */
  errorDetails?: ToolErrorDetails;
  providerExecuted?: boolean;
  preliminary?: boolean;
  dynamic?: boolean;
  invalid?: boolean;
  toolInvocation?: unknown;
  rawInput?: unknown;
  xmlVersionId?: string; // 关联的 XML 版本 ID
  [key: string]: unknown;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  toolInvocations?: ToolInvocation[];
  createdAt?: Date;
}

export interface MessageMetadata {
  modelName?: string | null;
  createdAt?: number;
}

/**
 * 图片用途枚举
 *
 * - ui: 仅用于 UI 展示（例如消息中展示缩略图/预览）
 * - vision: 用于视觉模型输入（例如发送到支持 vision 的模型）
 */
export type ImagePurpose = "ui" | "vision";

/**
 * 支持的图片 MIME 类型（与存储层 Attachment 白名单保持一致）
 */
export type ImageMimeType =
  | "image/png"
  | "image/jpeg"
  | "image/gif"
  | "image/webp";

/**
 * 图片消息部分（Image Message Part）
 *
 * 采用“持久化 + 运行时”字段分离设计：
 *
 * - 持久化字段：会被序列化写入 `parts_structure`（JSON），用于跨端（Web/Electron）与跨进程恢复
 * - 运行时字段：仅存在于内存中，用于 UI 展示或模型输入；在 canonicalize/持久化前应被剥离
 *
 * 注意：不要在持久化字段中嵌入二进制数据。图片内容应通过 `attachmentId` 引用存储层 `Attachment` 表记录。
 */
export interface ImagePart {
  type: "image";

  // === 持久化字段（会存入 parts_structure） ===
  attachmentId: string; // 关联的附件 ID（Attachment.id）
  mimeType: ImageMimeType | string; // 建议使用 ImageMimeType；允许 string 以便未来扩展
  width?: number; // 图片宽度（可选）
  height?: number; // 图片高度（可选）
  fileName?: string; // 原始文件名（可选）
  alt?: string; // 替代文本（可选，用于无障碍访问）
  purpose?: ImagePurpose; // 用途标识（可选）

  // === 运行时字段（不持久化） ===
  objectUrl?: string; // blob: URL（UI 展示用，临时）
  dataUrl?: string; // data:image/...;base64,...（模型输入用，临时）
  blob?: Blob; // 原始 Blob（仅内存中，不序列化）
}

/**
 * 创建图片 Part 的输入类型
 *
 * 说明：
 * - `blob` 属于运行时字段，仅用于临时传递；持久化时请只保留 attachmentId 等可序列化字段。
 */
export interface CreateImagePartInput {
  attachmentId: string;
  mimeType: ImageMimeType | string;
  width?: number;
  height?: number;
  fileName?: string;
  alt?: string;
  purpose?: ImagePurpose;
  blob?: Blob;
}

export type ChatUIPart = (UIMessagePart<UIDataTypes, UITools> | ImagePart) & {
  durationMs?: number;
  state?: string;
};

export type ChatUIMessage = Omit<UIMessage<MessageMetadata>, "parts"> & {
  parts: ChatUIPart[];
};

// 会话管理相关类型（使用 UIMessage 从 @ai-sdk/react）
export interface ChatSession {
  id: string; // 唯一标识（UUID）
  title: string; // 会话标题（自动生成）
  messages: ChatUIMessage[]; // 消息列表
  createdAt: number; // 创建时间戳
  updatedAt: number; // 最后更新时间戳
}

// 所有会话集合
export interface ChatSessionsData {
  sessions: Record<string, ChatSession>; // 会话字典
  activeSessionId: string | null; // 当前活动会话 ID
  sessionOrder: string[]; // 会话显示顺序（按时间倒序）
}

// JSON 导出格式
export interface ChatExportData {
  version: string;
  exportDate: string;
  sessions: ChatSession[];
}
