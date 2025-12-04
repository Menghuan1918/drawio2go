import type { ModelCapabilities } from "@/app/types/chat";

/**
 * 模型能力白名单
 * - 仅记录已知模型的能力标记（思考/推理、视觉）
 * - 未知模型一律按全 false 处理，避免误报能力
 */
const FALLBACK_CAPABILITIES: ModelCapabilities = Object.freeze({
  supportsThinking: false,
  supportsVision: false,
});

export const DEFAULT_MODEL_CAPABILITIES: Readonly<
  Record<string, ModelCapabilities>
> = Object.freeze({
  // DeepSeek 系列
  "deepseek-chat": Object.freeze({
    supportsThinking: false,
    supportsVision: false,
  }),
  "deepseek-reasoner": Object.freeze({
    supportsThinking: true,
    supportsVision: false,
  }),

  // OpenAI Reasoning 系列
  "o1-preview": Object.freeze({
    supportsThinking: true,
    supportsVision: false,
  }),
  "o1-mini": Object.freeze({
    supportsThinking: true,
    supportsVision: false,
  }),
  "o3-mini": Object.freeze({
    supportsThinking: true,
    supportsVision: false,
  }),

  // OpenAI 通用对话/多模态系列
  "gpt-4o": Object.freeze({
    supportsThinking: false,
    supportsVision: true,
  }),
  "gpt-4-turbo": Object.freeze({
    supportsThinking: false,
    supportsVision: true,
  }),
  "gpt-4": Object.freeze({
    supportsThinking: false,
    supportsVision: false,
  }),
  "gpt-3.5-turbo": Object.freeze({
    supportsThinking: false,
    supportsVision: false,
  }),
});

/**
 * 根据模型名称返回默认能力标记
 * - 大小写不敏感；会自动 trim
 * - 未知模型返回全 false，保证安全默认
 */
export const getDefaultCapabilities = (
  modelName?: string | null,
): ModelCapabilities => {
  if (!modelName) {
    return FALLBACK_CAPABILITIES;
  }

  const normalized = modelName.trim().toLowerCase();
  if (!normalized) {
    return FALLBACK_CAPABILITIES;
  }

  return DEFAULT_MODEL_CAPABILITIES[normalized] ?? FALLBACK_CAPABILITIES;
};
