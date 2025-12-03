import type { UIMessage } from "ai";

export type ProviderType =
  | "openai-reasoning"
  | "openai-compatible"
  | "deepseek-native";

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
export interface AgentSettings {
  systemPrompt: string; // 系统提示词
  updatedAt: number; // 更新时间戳（毫秒）
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
  customConfig: { [key: string]: JsonValue }; // 合并后的自定义配置（模型优先）
}

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

export type ChatUIMessage = UIMessage<MessageMetadata>;

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
