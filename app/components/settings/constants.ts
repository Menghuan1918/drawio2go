import { ProviderType } from "@/app/types/chat";

/**
 * 供应商选项接口
 */
export interface ProviderOption {
  value: ProviderType;
  label: string;
  description: string;
  disabled?: boolean;
}

/**
 * LLM 供应商选项
 */
export const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    value: "openai-compatible",
    label: "OpenAI Compatible",
    description: "通用 OpenAI 兼容服务，支持大部分 OpenAI 协议的服务商",
  },
  {
    value: "deepseek",
    label: "DeepSeek",
    description: "DeepSeek API，基于 OpenAI Compatible 实现",
  },
  {
    value: "openai-reasoning",
    label: "OpenAI Reasoning (o1/o3)",
    description: "OpenAI 官方 Reasoning 模型专用（o1、o3 系列）",
  },
];
