import type { SkillKnowledgeId } from "@/app/types/chat";
import rawConfig from "./skill-elements.json";

export type SkillThemeId = "modern" | "academic" | "minimal" | "custom";
export type SkillColorThemeId =
  | "default"
  | "blue"
  | "green"
  | "warm"
  | "cool"
  | "grayscale"
  | "earth"
  | "none";
export type { SkillKnowledgeId };

export type SkillThemeConfig = {
  id: SkillThemeId;
  nameKey: string;
  promptFragment: string;
};

export type SkillColorThemeConfig = {
  id: SkillColorThemeId;
  nameKey: string;
  colors: string[];
  promptFragment: string;
};

export type SkillKnowledgeConfig = {
  id: SkillKnowledgeId;
  nameKey: string;
  description?: string;
  required?: boolean;
  promptFragment: string;
  sizeBytes?: number;
};

export type SkillKnowledgeConfigSet = {
  themes: SkillThemeConfig[];
  colorThemes: SkillColorThemeConfig[];
  knowledge: SkillKnowledgeConfig[];
};

export const skillKnowledgeConfig = rawConfig as SkillKnowledgeConfigSet;

export function loadSkillKnowledgeConfig(): SkillKnowledgeConfigSet {
  return skillKnowledgeConfig;
}

export function getThemeById(
  id: SkillThemeId,
  config: SkillKnowledgeConfigSet = skillKnowledgeConfig,
): SkillThemeConfig | undefined {
  return config.themes.find((theme) => theme.id === id);
}

export function getKnowledgeById(
  id: SkillKnowledgeId,
  config: SkillKnowledgeConfigSet = skillKnowledgeConfig,
): SkillKnowledgeConfig | undefined {
  return config.knowledge.find((item) => item.id === id);
}

export function getRequiredKnowledge(
  config: SkillKnowledgeConfigSet = skillKnowledgeConfig,
): SkillKnowledgeConfig[] {
  return config.knowledge.filter((item) => item.required);
}

export function getOptionalKnowledge(
  config: SkillKnowledgeConfigSet = skillKnowledgeConfig,
): SkillKnowledgeConfig[] {
  return config.knowledge.filter((item) => !item.required);
}

export function getColorThemeById(
  id: SkillColorThemeId,
  config: SkillKnowledgeConfigSet = skillKnowledgeConfig,
): SkillColorThemeConfig | undefined {
  return config.colorThemes.find((theme) => theme.id === id);
}
