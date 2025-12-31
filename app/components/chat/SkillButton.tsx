"use client";

import {
  Button,
  Dropdown,
  Label,
  ListBox,
  Select,
  Surface,
  TextArea,
  TooltipContent,
  TooltipRoot,
  TooltipTrigger,
} from "@heroui/react";
import { Wand2 } from "lucide-react";
import Image from "next/image";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Dialog as AriaDialog,
  Heading,
  Modal as AriaModal,
  ModalOverlay,
  type Selection,
} from "react-aria-components";
import { useAppTranslation } from "@/app/i18n/hooks";
import type { SkillKnowledgeId, SkillSettings } from "@/app/types/chat";
import {
  getColorThemeById,
  getRequiredKnowledge,
  getThemeById,
  skillKnowledgeConfig,
  type SkillColorThemeId,
} from "@/app/config/skill-elements";
import {
  hasKnowledgeVariable,
  hasTemplateVariables,
  hasThemeVariable,
} from "@/app/lib/prompt-template";

export interface SkillButtonProps {
  skillSettings: SkillSettings;
  onSkillSettingsChange: (settings: SkillSettings) => void;
  systemPrompt: string;
  isDisabled?: boolean;
  isIconOnly?: boolean;
  className?: string;
}

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

export default function SkillButton({
  skillSettings,
  onSkillSettingsChange,
  systemPrompt,
  isDisabled,
  isIconOnly,
  className,
}: SkillButtonProps) {
  const { t } = useAppTranslation("chat");
  const [isOpen, setIsOpen] = useState(false);
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [customPromptDraft, setCustomPromptDraft] = useState("");
  const customModalTimerRef = useRef<number | null>(null);
  const customModalTitle = t("skill.custom.title");
  const customPlaceholder = t("skill.custom.placeholder");
  const customSaveLabel = t("skill.custom.save");
  const customCancelLabel = t("skill.custom.cancel");
  const headingId = useId();
  const knowledgeByteSizes = useMemo(() => {
    const encoder = new TextEncoder();
    return new Map(
      knowledgeOptions.map((item) => [
        item.id,
        encoder.encode(item.promptFragment ?? "").length,
      ]),
    );
  }, []);

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
    requiredKnowledgeIds,
    skillSettings.selectedKnowledge,
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

  const themeLabel = selectedTheme
    ? t(selectedTheme.nameKey)
    : t("skill.theme.unknown");

  const buttonLabel = t("skill.buttonLabel", {
    theme: themeLabel,
  });

  const customPromptValue = skillSettings.customThemePrompt ?? "";

  const hasAnyTemplate = hasTemplateVariables(systemPrompt);
  const hasAllTemplates =
    hasThemeVariable(systemPrompt) && hasKnowledgeVariable(systemPrompt);
  const isTemplateReady = hasAllTemplates;

  const isButtonDisabled = Boolean(isDisabled) || !isTemplateReady;
  let disabledReason: string | null = null;

  if (!isTemplateReady) {
    disabledReason = hasAnyTemplate
      ? t("skill.disabled.partialTemplate")
      : t("skill.disabled.missingTemplate");
  } else if (isDisabled) {
    disabledReason = t("skill.disabled.unavailable");
  }

  useEffect(() => {
    if (isButtonDisabled && isOpen) {
      setIsOpen(false);
    }
  }, [isButtonDisabled, isOpen]);

  useEffect(() => {
    if (isCustomModalOpen) {
      setCustomPromptDraft(customPromptValue);
    }
  }, [customPromptValue, isCustomModalOpen]);

  useEffect(() => {
    return () => {
      if (customModalTimerRef.current !== null) {
        window.clearTimeout(customModalTimerRef.current);
        customModalTimerRef.current = null;
      }
    };
  }, []);

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

  const handleCustomThemeClick = useCallback(() => {
    if (isButtonDisabled) return;
    const shouldSelect = skillSettings.selectedTheme !== "custom";
    if (shouldSelect) {
      handleThemeChange("custom");
    }
    if (customModalTimerRef.current !== null) {
      window.clearTimeout(customModalTimerRef.current);
      customModalTimerRef.current = null;
    }
    setIsOpen(false);
    setCustomPromptDraft(customPromptValue);
    customModalTimerRef.current = window.setTimeout(() => {
      setIsCustomModalOpen(true);
      customModalTimerRef.current = null;
    }, 300);
  }, [
    customPromptValue,
    handleThemeChange,
    isButtonDisabled,
    skillSettings.selectedTheme,
  ]);

  const handleCustomModalClose = useCallback(() => {
    setIsCustomModalOpen(false);
  }, []);

  const handleCustomPromptSave = useCallback(() => {
    const nextPrompt = customPromptDraft.trim();
    onSkillSettingsChange({
      ...skillSettings,
      selectedTheme: "custom",
      customThemePrompt: nextPrompt,
    });
    setIsCustomModalOpen(false);
  }, [customPromptDraft, onSkillSettingsChange, skillSettings]);

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

  const handleColorThemeChange = useCallback(
    (value: string) => {
      if (!value || value === skillSettings.selectedColorTheme) return;
      // 延时确保 Select 下拉框完全关闭后再更新状态
      setTimeout(() => {
        onSkillSettingsChange({
          ...skillSettings,
          selectedColorTheme: value,
        });
      }, 150);
    },
    [onSkillSettingsChange, skillSettings],
  );

  const button = (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      aria-label={t("skill.ariaLabel")}
      isDisabled={isButtonDisabled}
      isIconOnly={isIconOnly}
      className={["chat-icon-button", "skill-button", className]
        .filter(Boolean)
        .join(" ")}
    >
      <Wand2 size={16} aria-hidden />
      <span className="skill-button__label">{buttonLabel}</span>
    </Button>
  );

  return (
    <>
      <TooltipRoot delay={0} isDisabled={!disabledReason}>
        <Dropdown
          isOpen={isOpen}
          onOpenChange={(open) => {
            if (isButtonDisabled) {
              setIsOpen(false);
              return;
            }
            setIsOpen(open);
          }}
        >
          {isButtonDisabled ? (
            <TooltipTrigger className="inline-flex" aria-disabled="true">
              {button}
            </TooltipTrigger>
          ) : (
            button
          )}
          <Dropdown.Popover placement="top end" className="skill-popover">
            <div className="skill-section">
              <div className="skill-section__header">
                <Label className="skill-section__title">
                  {t("skill.theme.label")}
                </Label>
                <p className="skill-section__hint">
                  {t("skill.theme.description")}
                </p>
              </div>
              <div
                className="skill-theme-grid"
                role="radiogroup"
                aria-label={t("skill.theme.label")}
              >
                {themeOptions.map((theme) => {
                  const isSelected =
                    (selectedTheme?.id ?? skillSettings.selectedTheme) ===
                    theme.id;
                  const handleClick =
                    theme.id === "custom"
                      ? handleCustomThemeClick
                      : () => handleThemeChange(theme.id);
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      aria-label={t(theme.nameKey)}
                      className={[
                        "skill-theme-card",
                        isSelected && "skill-theme-card--selected",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={handleClick}
                      disabled={isButtonDisabled}
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
                        {t(theme.nameKey)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="skill-section">
              <div className="skill-section__header">
                <Label className="skill-section__title">
                  {t("skill.colorTheme.label")}
                </Label>
                <p className="skill-section__hint">
                  {t("skill.colorTheme.description")}
                </p>
              </div>
              <div
                className="skill-color-theme-selector"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
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
                  aria-label={t("skill.colorTheme.label")}
                  isDisabled={isButtonDisabled}
                  className="skill-color-theme-select"
                >
                  <Select.Trigger>
                    {t(selectedColorTheme.nameKey)}
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {colorThemeOptions.map((theme) => (
                        <ListBox.Item
                          key={theme.id}
                          id={theme.id}
                          textValue={t(theme.nameKey)}
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
                            <span>{t(theme.nameKey)}</span>
                          </div>
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
              </div>
            </div>

            <div className="skill-section">
              <div className="skill-section__header">
                <Label className="skill-section__title">
                  {t("skill.knowledge.label")}
                </Label>
                <p className="skill-section__hint">
                  {t("skill.knowledge.description")}
                </p>
              </div>
              <ListBox
                aria-label={t("skill.knowledge.label")}
                selectionMode="multiple"
                selectedKeys={selectedKnowledgeIds}
                onSelectionChange={handleKnowledgeChange}
                disabledKeys={
                  isButtonDisabled
                    ? "all"
                    : new Set(requiredKnowledgeIds.values())
                }
                className="skill-elements-list"
              >
                {knowledgeOptions.map((item) => {
                  const isRequired = requiredKnowledgeIds.has(item.id);
                  const byteSize = knowledgeByteSizes.get(item.id) ?? 0;
                  return (
                    <ListBox.Item
                      key={item.id}
                      id={item.id}
                      textValue={t(item.nameKey)}
                      className="skill-element-item"
                    >
                      <span className="skill-element-item__label">
                        {t(item.nameKey)}
                      </span>
                      {isRequired ? (
                        <span className="skill-element-item__required">
                          {t("skill.knowledge.required")}
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
          </Dropdown.Popover>
        </Dropdown>
        <TooltipContent placement="top">
          <p>{disabledReason}</p>
        </TooltipContent>
      </TooltipRoot>

      <ModalOverlay
        isOpen={isCustomModalOpen}
        onOpenChange={(open) => {
          if (!open) handleCustomModalClose();
        }}
        isDismissable
        isKeyboardDismissDisabled={false}
        className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      >
        <AriaModal className="w-full max-w-md px-4">
          <Surface className="w-full rounded-2xl bg-content1 p-4 shadow-2xl outline-none">
            <AriaDialog
              aria-labelledby={headingId}
              className="flex flex-col gap-4"
            >
              <Heading
                id={headingId}
                className="text-lg font-semibold text-foreground"
              >
                {customModalTitle}
              </Heading>

              <TextArea
                value={customPromptDraft}
                onChange={(event) => setCustomPromptDraft(event.target.value)}
                placeholder={customPlaceholder}
                aria-label={customModalTitle}
                rows={6}
                className="w-full"
              />

              <div className="flex items-center justify-end gap-2">
                <Button variant="tertiary" onPress={handleCustomModalClose}>
                  {customCancelLabel}
                </Button>
                <Button variant="primary" onPress={handleCustomPromptSave}>
                  {customSaveLabel}
                </Button>
              </div>
            </AriaDialog>
          </Surface>
        </AriaModal>
      </ModalOverlay>
    </>
  );
}
