"use client";

import {
  ComboBox,
  Input,
  Label,
  ListBox,
  Header,
  Chip,
  Spinner,
  type Key,
} from "@heroui/react";
import { Cpu } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
} from "react";
import { useI18n } from "@/app/i18n/hooks";
import type { ModelConfig, ProviderConfig } from "@/app/types/chat";

export interface ModelComboBoxProps {
  providers: ProviderConfig[];
  models: ModelConfig[];
  selectedModelId: string | null;
  onSelect: (modelId: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
}

interface GroupedModels {
  provider: ProviderConfig;
  models: ModelConfig[];
}

const normalize = (value: string) => value.toLowerCase().trim();

const getModelLabel = (model: ModelConfig) =>
  model.displayName || model.modelName;

export default function ModelComboBox({
  providers,
  models,
  selectedModelId,
  onSelect,
  disabled = false,
  isLoading = false,
}: ModelComboBoxProps) {
  const [inputValue, setInputValue] = useState("");
  const { t } = useI18n();

  const groupedModels = useMemo<GroupedModels[]>(() => {
    if (providers.length === 0 || models.length === 0) return [];

    const modelsByProvider = models.reduce<Map<string, ModelConfig[]>>(
      (acc, model) => {
        const list = acc.get(model.providerId);
        if (list) {
          list.push(model);
        } else {
          acc.set(model.providerId, [model]);
        }
        return acc;
      },
      new Map(),
    );

    return providers.reduce<GroupedModels[]>((acc, provider) => {
      const providerModels = modelsByProvider.get(provider.id);
      if (providerModels?.length) {
        acc.push({ provider, models: providerModels });
      }
      return acc;
    }, []);
  }, [providers, models]);

  const filteredGroups = useMemo<GroupedModels[]>(() => {
    if (!inputValue.trim()) return groupedModels;

    const keyword = normalize(inputValue);

    return groupedModels
      .map((group) => {
        const providerMatched = normalize(group.provider.displayName).includes(
          keyword,
        );

        const filteredModels = providerMatched
          ? group.models
          : group.models.filter((model) =>
              normalize(getModelLabel(model)).includes(keyword),
            );

        if (providerMatched && filteredModels.length === 0) {
          return { ...group, models: group.models };
        }

        if (filteredModels.length === 0) return null;
        return { ...group, models: filteredModels };
      })
      .filter(Boolean) as GroupedModels[];
  }, [groupedModels, inputValue]);

  const selectedLabel = useMemo(() => {
    const selected = models.find((model) => model.id === selectedModelId);
    return selected ? getModelLabel(selected) : "";
  }, [models, selectedModelId]);

  useEffect(() => {
    setInputValue(selectedLabel);
  }, [selectedLabel]);

  const handleSelectionChange = useCallback(
    (key: Key | null) => {
      if (key !== null && key !== undefined) {
        onSelect(String(key));
      }
    },
    [onSelect],
  );

  const handleInputChange = useCallback((value: string) => {
    setInputValue(value);
  }, []);

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setInputValue("");
      }
    },
    [],
  );

  const isDisabled =
    disabled || isLoading || providers.length === 0 || models.length === 0;

  const noResult = filteredGroups.length === 0;

  return (
    <div className="model-selector-container model-selector-container--inline">
      {providers.length === 0 || models.length === 0 ? (
        <p className="model-selector-empty">{t("chat:modelSelector.empty")}</p>
      ) : (
        <div className="model-combobox-wrapper">
          <ComboBox
            aria-label="当前模型"
            className="model-selector model-selector--inline model-combobox"
            selectedKey={selectedModelId ?? null}
            onSelectionChange={handleSelectionChange}
            inputValue={inputValue}
            onInputChange={handleInputChange}
            isDisabled={isDisabled}
          >
            <Label>{t("chat:modelSelector.label")}</Label>
            <Input
              placeholder={t("chat:modelSelector.placeholder")}
              aria-label={t("chat:modelSelector.placeholder")}
              onKeyDown={handleInputKeyDown}
              className="model-combobox-input"
            />
            <ListBox>
              {noResult ? (
                <ListBox.Item
                  key="no-result"
                  id="no-result"
                  textValue={t("chat:modelSelector.noResult")}
                  isDisabled
                >
                  <div className="model-selector-empty">
                    {t("chat:modelSelector.noResult")}
                  </div>
                </ListBox.Item>
              ) : (
                filteredGroups.map(({ provider, models: providerModels }) => (
                  <ListBox.Section key={provider.id}>
                    <Header>{provider.displayName}</Header>
                    {providerModels.map((model) => (
                      <ListBox.Item
                        key={model.id}
                        id={model.id}
                        textValue={getModelLabel(model)}
                      >
                        <div className="model-option-content">
                          <div className="model-option-header">
                            <span className="model-name">
                              {getModelLabel(model)}
                            </span>
                            {model.isDefault && (
                              <Chip size="sm" variant="secondary">
                                默认
                              </Chip>
                            )}
                          </div>
                          <div className="model-option-meta">
                            <span className="model-params">
                              温度: {model.temperature} | 工具轮次:{" "}
                              {model.maxToolRounds}
                            </span>
                            <span className="provider-name">
                              <Cpu size={14} aria-hidden />
                              <span>{provider.displayName}</span>
                            </span>
                          </div>
                        </div>
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox.Section>
                ))
              )}
            </ListBox>
          </ComboBox>

          {isLoading && (
            <div className="model-combobox-spinner" aria-hidden>
              <Spinner size="sm" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
