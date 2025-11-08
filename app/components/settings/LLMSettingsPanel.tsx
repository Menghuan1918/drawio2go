"use client";

import {
  TextField,
  Label,
  Input,
  Description,
  Select,
  ListBox,
  Slider,
} from "@heroui/react";
import { LLMConfig, ProviderType } from "@/app/types/chat";
import { PROVIDER_OPTIONS } from "./constants";
import SystemPromptEditor from "./SystemPromptEditor";
import ConnectionTester from "./ConnectionTester";

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
  return (
    <div className="settings-panel">
      <h3 className="section-title">LLM 配置</h3>
      <p className="section-description">配置 AI 助手的连接参数和行为</p>

      {/* 请求地址 */}
      <TextField className="w-full mt-6">
        <Label>请求地址</Label>
        <Input
          value={config.apiUrl}
          onChange={(e) => onChange({ apiUrl: e.target.value })}
          placeholder="https://api.deepseek.com/v1"
          className="mt-3"
        />
        <Description className="mt-3">
          API 端点地址，支持 OpenAI 兼容服务，推荐包含 /v1 路径
        </Description>
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
        <Label>请求供应商</Label>
        <Select.Trigger className="mt-3 flex w-full items-center justify-between rounded-md border border-default-200 bg-content1 px-3 py-2 text-left text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 hover:border-primary">
          <Select.Value className="text-sm leading-6 text-foreground" />
          <Select.Indicator className="text-default-500" />
        </Select.Trigger>
        <Select.Content className="rounded-2xl border border-default-200 bg-content1 p-2 shadow-2xl">
          <ListBox className="flex flex-col gap-1">
            {PROVIDER_OPTIONS.map((option) => (
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
          根据接口兼容性选择请求方式，Responses 模式支持最新 Response API
        </Description>
        <Description className="mt-2 text-xs">
          {
            PROVIDER_OPTIONS.find(
              (option) => option.value === config.providerType,
            )?.description
          }
        </Description>
      </Select>

      {/* 请求密钥 */}
      <TextField className="w-full mt-6">
        <Label>请求密钥</Label>
        <Input
          type="password"
          value={config.apiKey}
          onChange={(e) => onChange({ apiKey: e.target.value })}
          placeholder="sk-..."
          className="mt-3"
        />
        <Description className="mt-3">
          API 密钥，用于身份验证（留空则不使用密钥）
        </Description>
      </TextField>

      {/* 请求模型名 */}
      <TextField className="w-full mt-6">
        <Label>请求模型名</Label>
        <Input
          value={config.modelName}
          onChange={(e) => onChange({ modelName: e.target.value })}
          placeholder="deepseek-chat"
          className="mt-3"
        />
        <Description className="mt-3">
          使用的模型名称，如 deepseek-chat
        </Description>
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
        <Label>请求温度</Label>
        <Slider.Output />
        <Slider.Track>
          <Slider.Fill />
          <Slider.Thumb />
        </Slider.Track>
        <Description className="mt-3">
          控制生成的随机性，范围 0-2，值越大越随机
        </Description>
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
        <Label>最大工具调用轮次</Label>
        <Slider.Output />
        <Slider.Track>
          <Slider.Fill />
          <Slider.Thumb />
        </Slider.Track>
        <Description className="mt-3">
          限制 AI 工具调用的最大循环次数，防止无限循环（范围 1-20）
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
