"use client";

import { useMemo, useState, useCallback } from "react";
import {
  Button,
  Description,
  FieldError,
  Label,
  ListBox,
  Select,
  TextArea,
  TextField,
} from "@heroui/react";
import { RotateCcw } from "lucide-react";
import Image from "next/image";
import type { Selection } from "react-aria-components";
import { useTranslation } from "react-i18next";

import ConfirmDialog from "../common/ConfirmDialog";
import { useAppTranslation } from "@/app/i18n/hooks";
import { DEFAULT_SYSTEM_PROMPT } from "@/app/lib/config-utils";
import type { SkillKnowledgeId, SkillSettings } from "@/app/types/chat";
import {
  getColorThemeById,
  getRequiredKnowledge,
  getThemeById,
  skillKnowledgeConfig,
  type SkillColorThemeId,
} from "@/app/config/skill-elements";

export interface AgentSettingsPanelProps {
  systemPrompt: string;
  onChange: (systemPrompt: string) => void;
  skillSettings: SkillSettings;
  onSkillSettingsChange: (settings: SkillSettings) => void;
  // 可选：由父组件传入的错误信息
  error?: string;
}

export const isSystemPromptValid = (value: string): boolean =>
  value.trim().length > 0;

export const getSystemPromptError = (value: string): string | null =>
  isSystemPromptValid(value) ? null : "系统提示词不能为空";

const themeOptions = skillKnowledgeConfig.themes;
const colorThemeOptions = skillKnowledgeConfig.colorThemes;
const knowledgeOptions = skillKnowledgeConfig.knowledge;
const knowledgeOrder = knowledgeOptions.map((item) => item.id);

const formatPromptBytes = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes}B`;
  }
  return `${(bytes / 1024).toFixed(1)}KB`;
};

const buildOrderedKnowledge = (
  ids: Set<SkillKnowledgeId>,
): SkillKnowledgeId[] => {
  return knowledgeOrder.filter((id) => ids.has(id));
};

export default function AgentSettingsPanel({
  systemPrompt,
  onChange,
  skillSettings,
  onSkillSettingsChange,
  error,
}: AgentSettingsPanelProps) {
  const { t } = useTranslation("settings");
  const { t: tChat } = useAppTranslation("chat");
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const knowledgeByteSizes = useMemo(() => {
    const encoder = new TextEncoder();
    return new Map(
      knowledgeOptions.map((item) => [
        item.id,
        encoder.encode(item.promptFragment ?? "").length,
      ]),
    );
  }, []);

  const handleReset = useCallback(() => {
    onChange(DEFAULT_SYSTEM_PROMPT);
  }, [onChange]);

  const derivedError = useMemo(() => {
    if (error) return error;
    return isSystemPromptValid(systemPrompt)
      ? undefined
      : t("agent.systemPrompt.errorEmpty", "系统提示词不能为空");
  }, [error, systemPrompt, t]);

  const requiredKnowledgeIds = useMemo<Set<SkillKnowledgeId>>(
    () => new Set(getRequiredKnowledge().map((item) => item.id)),
    [],
  );

  const availableKnowledgeIds = useMemo<Set<SkillKnowledgeId>>(
    () => new Set(knowledgeOptions.map((item) => item.id)),
    [],
  );

  const selectedKnowledgeIds = useMemo(() => {
    const next = new Set<SkillKnowledgeId>();
    for (const id of skillSettings.selectedKnowledge) {
      if (availableKnowledgeIds.has(id)) {
        next.add(id);
      }
    }
    for (const id of requiredKnowledgeIds) {
      next.add(id);
    }
    return next;
  }, [
    availableKnowledgeIds,
    skillSettings.selectedKnowledge,
    requiredKnowledgeIds,
  ]);

  const selectedTheme = useMemo(() => {
    return (
      getThemeById(
        skillSettings.selectedTheme as Parameters<typeof getThemeById>[0],
      ) ?? themeOptions[0]
    );
  }, [skillSettings.selectedTheme]);

  const selectedColorTheme = useMemo(() => {
    const colorThemeId =
      skillSettings.selectedColorTheme ?? ("none" as SkillColorThemeId);
    return (
      getColorThemeById(colorThemeId as SkillColorThemeId) ??
      colorThemeOptions.find((ct) => ct.id === "none")!
    );
  }, [skillSettings.selectedColorTheme]);

  const handleThemeChange = useCallback(
    (value: string) => {
      if (!value || value === skillSettings.selectedTheme) return;
      onSkillSettingsChange({
        ...skillSettings,
        selectedTheme: value,
      });
    },
    [onSkillSettingsChange, skillSettings],
  );

  const handleColorThemeChange = useCallback(
    (value: string) => {
      if (!value || value === skillSettings.selectedColorTheme) return;
      setTimeout(() => {
        onSkillSettingsChange({
          ...skillSettings,
          selectedColorTheme: value,
        });
      }, 150);
    },
    [onSkillSettingsChange, skillSettings],
  );

  const handleKnowledgeChange = useCallback(
    (keys: Selection) => {
      if (keys === "all") {
        const allIds = new Set<SkillKnowledgeId>(knowledgeOrder);
        for (const id of requiredKnowledgeIds) {
          allIds.add(id);
        }
        onSkillSettingsChange({
          ...skillSettings,
          selectedKnowledge: buildOrderedKnowledge(allIds),
        });
        return;
      }

      const next = new Set<SkillKnowledgeId>();
      for (const key of keys) {
        const id = String(key) as SkillKnowledgeId;
        if (availableKnowledgeIds.has(id)) {
          next.add(id);
        }
      }
      for (const id of requiredKnowledgeIds) {
        next.add(id);
      }

      onSkillSettingsChange({
        ...skillSettings,
        selectedKnowledge: buildOrderedKnowledge(next),
      });
    },
    [
      availableKnowledgeIds,
      onSkillSettingsChange,
      requiredKnowledgeIds,
      skillSettings,
    ],
  );

  return (
    <div className="settings-panel flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h3 className="section-title">{t("agent.title", "Agent 设置")}</h3>
        <p className="section-description">
          {t("agent.description", "配置 AI 助手的全局行为")}
        </p>
      </div>

      <TextField className="w-full">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <Label className="text-sm text-foreground">
              {t("agent.systemPrompt.label", "系统提示词")}
            </Label>
            <Description className="break-words text-sm text-default-500">
              {t(
                "agent.systemPrompt.description",
                "定义 AI 助手的行为规则和工作模式，对所有模型生效",
              )}
            </Description>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onPress={() => setIsResetDialogOpen(true)}
            className="shrink-0 sm:self-start"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            {t("agent.systemPrompt.reset", "恢复默认")}
          </Button>
        </div>

        <TextArea
          value={systemPrompt}
          onChange={(event) => onChange(event.target.value)}
          rows={15}
          aria-label={t("agent.systemPrompt.label", "系统提示词")}
          className="mt-4 w-full min-h-[15rem] max-h-[60vh]"
        />

        {derivedError ? (
          <FieldError className="mt-2 text-sm">{derivedError}</FieldError>
        ) : null}
      </TextField>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-sm font-semibold text-foreground">
            {t("agent.defaultSettings.title", "新对话默认设置")}
          </Label>
          <Description className="break-words text-sm text-default-500">
            {t("agent.defaultSettings.description", "新对话将使用这些默认设置")}
          </Description>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-6">
            <div className="skill-section">
              <div className="skill-section__header">
                <Label className="skill-section__title">
                  {t("agent.defaultSettings.themeLabel", "默认风格设置")}
                </Label>
                <p className="skill-section__hint break-words">
                  {tChat("skill.theme.description")}
                </p>
              </div>
              <div
                className="skill-theme-grid"
                role="radiogroup"
                aria-label={t(
                  "agent.defaultSettings.themeLabel",
                  "默认风格设置",
                )}
              >
                {themeOptions.map((theme) => {
                  const isSelected =
                    (selectedTheme?.id ?? skillSettings.selectedTheme) ===
                    theme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      aria-label={tChat(theme.nameKey)}
                      className={[
                        "skill-theme-card",
                        isSelected && "skill-theme-card--selected",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => handleThemeChange(theme.id)}
                    >
                      <span className="skill-theme-thumbnail">
                        <Image
                          src={`/images/skill-themes/${theme.id}.svg`}
                          alt=""
                          aria-hidden="true"
                          className="skill-theme-thumbnail__image"
                          width={80}
                          height={60}
                        />
                      </span>
                      <span className="skill-theme-label">
                        {tChat(theme.nameKey)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="skill-section">
              <div className="skill-section__header">
                <Label className="skill-section__title">
                  {tChat("skill.colorTheme.label")}
                </Label>
                <p className="skill-section__hint break-words">
                  {tChat("skill.colorTheme.description")}
                </p>
              </div>
              <div className="skill-color-theme-selector">
                <div className="skill-color-dots">
                  {selectedColorTheme.colors.map((color, index) => (
                    <span
                      key={index}
                      className="skill-color-dot"
                      style={{ backgroundColor: color }}
                      aria-hidden="true"
                    />
                  ))}
                </div>
                <Select
                  selectedKey={
                    skillSettings.selectedColorTheme ?? ("none" as string)
                  }
                  onSelectionChange={(key) => {
                    if (key && key !== "all") {
                      handleColorThemeChange(String(key));
                    }
                  }}
                  aria-label={tChat("skill.colorTheme.label")}
                  className="skill-color-theme-select"
                >
                  <Select.Trigger>
                    {tChat(selectedColorTheme.nameKey)}
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {colorThemeOptions.map((theme) => (
                        <ListBox.Item
                          key={theme.id}
                          id={theme.id}
                          textValue={tChat(theme.nameKey)}
                        >
                          <div className="skill-color-option">
                            <span className="skill-color-dots-small">
                              {theme.colors.slice(0, 3).map((c, i) => (
                                <span
                                  key={i}
                                  className="skill-color-dot-small"
                                  style={{ backgroundColor: c }}
                                  aria-hidden="true"
                                />
                              ))}
                            </span>
                            <span>{tChat(theme.nameKey)}</span>
                          </div>
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
              </div>
            </div>

            {(selectedTheme?.id ?? skillSettings.selectedTheme) === "custom" ? (
              <div className="skill-section">
                <div className="skill-section__header">
                  <Label className="skill-section__title">
                    {tChat("skill.customThemePrompt.label", "自定义风格提示词")}
                  </Label>
                  <p className="skill-section__hint break-words">
                    {tChat(
                      "skill.customThemePrompt.description",
                      "仅在选择「自定义」风格时生效，用于替换 {{theme}} 内容。",
                    )}
                  </p>
                </div>
                <TextArea
                  value={skillSettings.customThemePrompt ?? ""}
                  onChange={(event) => {
                    onSkillSettingsChange({
                      ...skillSettings,
                      customThemePrompt: event.target.value,
                    });
                  }}
                  placeholder={tChat("skill.custom.placeholder")}
                  aria-label={tChat(
                    "skill.customThemePrompt.label",
                    "自定义风格提示词",
                  )}
                  rows={6}
                  className="w-full"
                />
              </div>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            <div className="skill-section">
              <div className="skill-section__header">
                <Label className="skill-section__title">
                  {t("agent.defaultSettings.knowledgeLabel", "默认知识选择")}
                </Label>
                <p className="skill-section__hint break-words">
                  {tChat("skill.knowledge.description")}
                </p>
              </div>
              <ListBox
                aria-label={t(
                  "agent.defaultSettings.knowledgeLabel",
                  "默认知识选择",
                )}
                selectionMode="multiple"
                selectedKeys={selectedKnowledgeIds}
                onSelectionChange={handleKnowledgeChange}
                disabledKeys={new Set(requiredKnowledgeIds.values())}
                className="skill-elements-list"
              >
                {knowledgeOptions.map((item) => {
                  const isRequired = requiredKnowledgeIds.has(item.id);
                  const byteSize = knowledgeByteSizes.get(item.id) ?? 0;
                  return (
                    <ListBox.Item
                      key={item.id}
                      id={item.id}
                      textValue={tChat(item.nameKey)}
                      className="skill-element-item"
                    >
                      <span className="skill-element-item__label">
                        {tChat(item.nameKey)}
                      </span>
                      {isRequired ? (
                        <span className="skill-element-item__required">
                          {tChat("skill.knowledge.required")}
                        </span>
                      ) : null}
                      <span className="skill-element-item__bytes">
                        {formatPromptBytes(byteSize)}
                      </span>
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  );
                })}
              </ListBox>
            </div>

            <div className="skill-section">
              <div className="skill-section__header">
                <Label className="skill-section__title">
                  {tChat("skill.customKnowledge.label", "自定义知识内容")}
                </Label>
                <p className="skill-section__hint break-words">
                  {tChat(
                    "skill.customKnowledge.description",
                    "可选：追加到 {{knowledge}} 的末尾，用于补充你自己的知识或约束。",
                  )}
                </p>
              </div>
              <TextArea
                value={skillSettings.customKnowledgeContent ?? ""}
                onChange={(event) => {
                  onSkillSettingsChange({
                    ...skillSettings,
                    customKnowledgeContent: event.target.value,
                  });
                }}
                placeholder={tChat(
                  "skill.customKnowledge.placeholder",
                  "例如：请优先使用公司内部术语/命名规范；或补充特定图形库/业务规则等。",
                )}
                aria-label={tChat(
                  "skill.customKnowledge.label",
                  "自定义知识内容",
                )}
                rows={6}
                className="w-full"
              />
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={isResetDialogOpen}
        onOpenChange={setIsResetDialogOpen}
        title={t("agent.systemPrompt.resetTitle", "恢复默认系统提示词")}
        description={t(
          "agent.systemPrompt.resetConfirm",
          "此操作将丢失当前编辑的内容，确认恢复默认系统提示词吗？",
        )}
        confirmText={t("common.confirm", "确认")}
        cancelText={t("common.cancel", "取消")}
        variant="danger"
        onConfirm={handleReset}
      />
    </div>
  );
}
