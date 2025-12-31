import { SkillSettings } from "@/app/types/chat";
import {
  getKnowledgeById,
  getRequiredKnowledge,
  getThemeById,
} from "@/app/config/skill-elements";
import { CANVAS_CONTEXT_GUIDE } from "@/app/lib/config-utils";

/**
 * Check if system prompt contains template variables.
 */
export function hasTemplateVariables(prompt: string): boolean {
  return (
    /\{\{theme\}\}/.test(prompt) ||
    /\{\{knowledge\}\}/.test(prompt) ||
    /\{\{canvas_context_guide\}\}/.test(prompt)
  );
}

/**
 * Check if the theme variable exists.
 */
export function hasThemeVariable(prompt: string): boolean {
  return /\{\{theme\}\}/.test(prompt);
}

/**
 * Check if the knowledge variable exists.
 */
export function hasKnowledgeVariable(prompt: string): boolean {
  return /\{\{knowledge\}\}/.test(prompt);
}

/**
 * Check if the canvas context guide variable exists.
 */
export function hasCanvasContextGuideVariable(prompt: string): boolean {
  return /\{\{canvas_context_guide\}\}/.test(prompt);
}

/**
 * Build theme prompt fragment from skill settings.
 */
export function buildThemePrompt(skillSettings: SkillSettings): string {
  const theme = getThemeById(
    skillSettings.selectedTheme as Parameters<typeof getThemeById>[0],
  );
  if (!theme) {
    return "";
  }

  if (theme.id === "custom") {
    const customPrompt = skillSettings.customThemePrompt?.trim();
    return customPrompt && customPrompt.length > 0
      ? customPrompt
      : theme.promptFragment;
  }
  return theme.promptFragment;
}

/**
 * Build knowledge prompt fragments from skill settings.
 */
export function buildKnowledgePrompt(skillSettings: SkillSettings): string {
  const requiredIds = getRequiredKnowledge().map((item) => item.id);
  const allSelectedIds = [
    ...new Set([...requiredIds, ...skillSettings.selectedKnowledge]),
  ];

  const fragments = allSelectedIds
    .map((id) => getKnowledgeById(id as Parameters<typeof getKnowledgeById>[0]))
    .filter(Boolean)
    .map((item) => item!.promptFragment);

  return fragments.join("\n\n");
}

/**
 * Apply template variable replacements.
 */
export function applyTemplateVariables(
  prompt: string,
  skillSettings: SkillSettings,
  options?: {
    isCanvasContextEnabled?: boolean;
  },
): string {
  let result = prompt;

  if (hasThemeVariable(result)) {
    result = result.replace(/\{\{theme\}\}/g, buildThemePrompt(skillSettings));
  }

  if (hasKnowledgeVariable(result)) {
    result = result.replace(
      /\{\{knowledge\}\}/g,
      buildKnowledgePrompt(skillSettings),
    );
  }

  if (hasCanvasContextGuideVariable(result)) {
    const replacement =
      options?.isCanvasContextEnabled === true ? CANVAS_CONTEXT_GUIDE : "";
    result = result.replace(/\{\{canvas_context_guide\}\}/g, replacement);
  }

  return result;
}
