import { TFunction } from "i18next";
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
 * LLM 供应商基础列表（仅 value，用于组合多语言 label/description）
 */
export const PROVIDER_OPTIONS: ProviderType[] = [
  "openai-compatible",
  "deepseek",
  "openai-reasoning",
];

export const getProviderOptions = (t: TFunction): ProviderOption[] =>
  PROVIDER_OPTIONS.map((value) => ({
    value,
    label: t(`llm.providers.${value}.label`),
    description: t(`llm.providers.${value}.description`),
  }));
