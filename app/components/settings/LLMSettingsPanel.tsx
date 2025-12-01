"use client";

import { useMemo } from "react";
import {
  TextField,
  Label,
  Input,
  Description,
  Select,
  ListBox,
  Slider,
  FieldError,
} from "@heroui/react";
import { LLMConfig, ProviderType } from "@/app/types/chat";
import { getProviderOptions } from "./constants";
import SystemPromptEditor from "./SystemPromptEditor";
import ConnectionTester from "./ConnectionTester";
import { useAppTranslation } from "@/app/i18n/hooks";

interface LLMSettingsPanelProps {
  config: LLMConfig;
  onChange: (updates: Partial<LLMConfig>) => void;
}

/**
 * LLM 设置面板组件
 * 包含所有 LLM 配置字段和功能
 */
export default function LLMSettingsPanel({
  config,
  onChange,
}: LLMSettingsPanelProps) {
  const { t } = useAppTranslation("settings");
  const { t: tValidation } = useAppTranslation("validation");
  const providerOptions = useMemo(() => getProviderOptions(t), [t]);

  const temperatureMin = 0;
  const temperatureMax = 2;

  const isValidHttpUrl = (value: string) => {
    if (!value.trim()) return false;
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  };

  const apiKeyError = !config.apiKey.trim()
    ? tValidation("llm.apiKeyRequired")
    : "";
  const modelError = !config.modelName.trim()
    ? tValidation("llm.modelRequired")
    : "";
  const baseUrlError =
    config.apiUrl.trim() && !isValidHttpUrl(config.apiUrl.trim())
      ? tValidation("llm.baseUrlInvalid")
      : "";
  const temperatureError =
    config.temperature < temperatureMin || config.temperature > temperatureMax
      ? tValidation("llm.temperatureRange", {
          min: temperatureMin,
          max: temperatureMax,
        })
      : "";

  return (
    <div className="settings-panel">
      <h3 className="section-title">{t("llm.title")}</h3>
      <p className="section-description">{t("llm.description")}</p>

      {/* 请求地址 */}
      <TextField className="w-full mt-6" isInvalid={!!baseUrlError}>
        <Label>{t("llm.apiUrl.label")}</Label>
        <Input
          value={config.apiUrl}
          onChange={(e) => onChange({ apiUrl: e.target.value })}
          placeholder={t(
            "llm.apiUrl.placeholder",
            "https://api.example.com/v1",
          )}
          className="mt-3"
        />
        <Description className="mt-3">
          {t("llm.apiUrl.description")}
        </Description>
        {baseUrlError && (
          <FieldError className="mt-2">{baseUrlError}</FieldError>
        )}
      </TextField>

      {/* 供应商选择 */}
      <Select
        className="w-full mt-6"
        value={config.providerType}
        onChange={(value) =>
          onChange({
            providerType: value as ProviderType,
          })
        }
      >
        <Label>{t("llm.provider.label")}</Label>
        <Select.Trigger className="mt-3 flex w-full items-center justify-between rounded-md border border-default-200 bg-content1 px-3 py-2 text-left text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 hover:border-primary">
          <Select.Value className="text-sm leading-6 text-foreground" />
          <Select.Indicator className="text-default-500" />
        </Select.Trigger>
        <Select.Content className="rounded-2xl border border-default-200 bg-content1 p-2 shadow-2xl">
          <ListBox className="flex flex-col gap-1">
            {providerOptions.map((option) => (
              <ListBox.Item
                key={option.value}
                id={option.value}
                textValue={option.label}
                isDisabled={option.disabled}
                className="select-item flex items-center justify-between rounded-xl text-sm text-foreground hover:bg-primary-50"
              >
                {option.label}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Content>
        <Description className="mt-3">
          {t("llm.provider.description")}
        </Description>
        <Description className="mt-2 text-xs">
          {
            providerOptions.find(
              (option) => option.value === config.providerType,
            )?.description
          }
        </Description>
      </Select>

      {/* 请求密钥 */}
      <TextField className="w-full mt-6" isInvalid={!!apiKeyError}>
        <Label>{t("llm.apiKey.label")}</Label>
        <Input
          type="password"
          value={config.apiKey}
          onChange={(e) => onChange({ apiKey: e.target.value })}
          placeholder={t("llm.apiKey.placeholder", "sk-...")}
          className="mt-3"
        />
        <Description className="mt-3">
          {t("llm.apiKey.description")}
        </Description>
        {apiKeyError && <FieldError className="mt-2">{apiKeyError}</FieldError>}
      </TextField>

      {/* 请求模型名 */}
      <TextField className="w-full mt-6" isInvalid={!!modelError}>
        <Label>{t("llm.modelName.label")}</Label>
        <Input
          value={config.modelName}
          onChange={(e) => onChange({ modelName: e.target.value })}
          placeholder={t("llm.modelName.placeholder", "gpt-4o")}
          className="mt-3"
        />
        <Description className="mt-3">
          {t("llm.modelName.description")}
        </Description>
        {modelError && <FieldError className="mt-2">{modelError}</FieldError>}
      </TextField>

      {/* 请求温度 */}
      <Slider
        className="w-full mt-6"
        minValue={0}
        maxValue={2}
        step={0.01}
        value={config.temperature}
        onChange={(value) =>
          onChange({
            temperature: value as number,
          })
        }
      >
        <Label>{t("llm.temperature.label")}</Label>
        <Slider.Output />
        <Slider.Track>
          <Slider.Fill />
          <Slider.Thumb />
        </Slider.Track>
        <Description className="mt-3">
          {t("llm.temperature.description")}
        </Description>
        {temperatureError && (
          <FieldError className="mt-2">{temperatureError}</FieldError>
        )}
      </Slider>

      {/* 最大工具调用轮次 */}
      <Slider
        className="w-full mt-6"
        minValue={1}
        maxValue={20}
        step={1}
        value={config.maxToolRounds}
        onChange={(value) =>
          onChange({
            maxToolRounds: value as number,
          })
        }
      >
        <Label>{t("llm.maxToolRounds.label")}</Label>
        <Slider.Output />
        <Slider.Track>
          <Slider.Fill />
          <Slider.Thumb />
        </Slider.Track>
        <Description className="mt-3">
          {t("llm.maxToolRounds.description")}
        </Description>
      </Slider>

      {/* 系统提示词编辑器 */}
      <SystemPromptEditor
        value={config.systemPrompt}
        onChange={(systemPrompt) => onChange({ systemPrompt })}
      />

      {/* 连接测试器 */}
      <ConnectionTester config={config} />
    </div>
  );
}
