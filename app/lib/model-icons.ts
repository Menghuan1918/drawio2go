import type { ComponentType } from "react";
import { Cpu } from "lucide-react";
import {
  Anthropic,
  DeepSeek,
  Gemini,
  Google,
  Meta,
  OpenAI,
} from "@lobehub/icons";
import type { ProviderType } from "@/app/types/chat";

type IconComponent = ComponentType<{
  size?: number | string;
  className?: string;
  color?: string;
}>;

export interface IconAsset {
  Icon: IconComponent;
  alt: string;
}

const fallbackIcon: IconAsset = {
  Icon: Cpu,
  alt: "Default model",
};

const deepseekIcon: IconAsset = {
  Icon: DeepSeek,
  alt: "DeepSeek",
};

const providerIconMap: Record<string, IconAsset> = {
  openai: { Icon: OpenAI, alt: "OpenAI" },
  "openai-compatible": { Icon: OpenAI, alt: "OpenAI" },
  "openai-reasoning": { Icon: OpenAI, alt: "OpenAI" },
  anthropic: { Icon: Anthropic, alt: "Anthropic" },
  claude: { Icon: Anthropic, alt: "Anthropic" },
  google: { Icon: Google, alt: "Google" },
  gemini: { Icon: Gemini, alt: "Gemini" },
  meta: { Icon: Meta, alt: "Meta" },
  llama: { Icon: Meta, alt: "Meta" },
  facebook: { Icon: Meta, alt: "Meta" },
  "deepseek-native": deepseekIcon,
  deepseek: deepseekIcon,
};

const modelIconRules: Array<{ pattern: RegExp; asset: IconAsset }> = [
  { pattern: /gpt[-_]?4o/i, asset: { Icon: OpenAI, alt: "GPT-4o" } },
  {
    pattern: /\bo[13](?:[-_]?mini|[-_]?preview)?/i,
    asset: { Icon: OpenAI, alt: "OpenAI o-series" },
  },
  {
    pattern: /claude[-_]?3(?:\.5)?/i,
    asset: { Icon: Anthropic, alt: "Claude 3" },
  },
  {
    pattern: /gemini[-_]?((1\.5)|(2\.0))/i,
    asset: { Icon: Gemini, alt: "Gemini" },
  },
  { pattern: /llama\s?\d*/i, asset: { Icon: Meta, alt: "Llama" } },
  { pattern: /deepseek/i, asset: deepseekIcon },
];

const normalizeKey = (value?: string | null) =>
  value?.toLowerCase().trim() ?? "";

export type ModelIconResult = IconAsset;

export function getModelIcon(
  modelId?: string | null,
  modelName?: string | null,
  providerId?: string | null,
  providerType?: ProviderType | null,
): ModelIconResult {
  const normalizedName = normalizeKey(modelName || modelId);

  if (normalizedName) {
    const matchedRule = modelIconRules.find((rule) =>
      rule.pattern.test(normalizedName),
    );

    if (matchedRule) {
      return matchedRule.asset;
    }
  }

  const providerKey = normalizeKey(providerId);
  const providerTypeKey = normalizeKey(providerType ?? undefined);

  if (providerIconMap[providerKey]) {
    return providerIconMap[providerKey];
  }

  if (providerIconMap[providerTypeKey]) {
    return providerIconMap[providerTypeKey];
  }

  return fallbackIcon;
}

export { fallbackIcon, modelIconRules, providerIconMap };
