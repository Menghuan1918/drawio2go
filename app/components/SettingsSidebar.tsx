"use client";

import { useState, useEffect } from "react";
import {
  Button,
  TextField,
  Label,
  Input,
  Description,
  TextArea,
} from "@heroui/react";
import { LLMConfig, ProviderType } from "@/app/types/chat";
import {
  DEFAULT_LLM_CONFIG,
  DEFAULT_SYSTEM_PROMPT,
  normalizeLLMConfig,
} from "@/app/lib/config-utils";
import { useStorageSettings } from "@/app/hooks/useStorageSettings";

interface SettingsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChange?: (settings: { defaultPath: string }) => void;
}

const PROVIDER_OPTIONS: Array<{
  value: ProviderType;
  label: string;
  description: string;
  disabled?: boolean;
}> = [
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

export default function SettingsSidebar({
  onSettingsChange,
}: SettingsSidebarProps) {
  // 存储 Hook
  const { getLLMConfig, saveLLMConfig, getDefaultPath, saveDefaultPath } =
    useStorageSettings();

  const [defaultPath, setDefaultPath] = useState("");
  const [savedPath, setSavedPath] = useState("");

  // LLM 配置状态
  const [llmConfig, setLlmConfig] = useState<LLMConfig>({
    ...DEFAULT_LLM_CONFIG,
  });
  const [savedLlmConfig, setSavedLlmConfig] = useState<LLMConfig>({
    ...DEFAULT_LLM_CONFIG,
  });

  // 系统提示词弹窗状态
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [tempSystemPrompt, setTempSystemPrompt] = useState(
    DEFAULT_SYSTEM_PROMPT,
  );

  // 测试状态
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const [hasChanges, setHasChanges] = useState(false);

  // 加载保存的设置
  useEffect(() => {
    const loadSettings = async () => {
      try {
        // 加载默认路径
        const savedPath = await getDefaultPath();
        const path = savedPath || "";
        setDefaultPath(path);
        setSavedPath(path);

        // 加载 LLM 配置
        const savedConfig = await getLLMConfig();
        if (savedConfig) {
          const configWithDefaults = normalizeLLMConfig(savedConfig);
          setLlmConfig(configWithDefaults);
          setSavedLlmConfig(configWithDefaults);
          setTempSystemPrompt(configWithDefaults.systemPrompt);
        } else {
          setLlmConfig({ ...DEFAULT_LLM_CONFIG });
          setSavedLlmConfig({ ...DEFAULT_LLM_CONFIG });
          setTempSystemPrompt(DEFAULT_SYSTEM_PROMPT);
        }
      } catch (e) {
        console.error("加载设置失败:", e);
        setLlmConfig({ ...DEFAULT_LLM_CONFIG });
        setSavedLlmConfig({ ...DEFAULT_LLM_CONFIG });
        setTempSystemPrompt(DEFAULT_SYSTEM_PROMPT);
      }
    };

    loadSettings();
  }, [getDefaultPath, getLLMConfig]);

  // 监听变化，检测是否有修改
  useEffect(() => {
    const pathChanged = defaultPath !== savedPath;
    const llmConfigChanged =
      JSON.stringify(llmConfig) !== JSON.stringify(savedLlmConfig);
    setHasChanges(pathChanged || llmConfigChanged);
  }, [defaultPath, savedPath, llmConfig, savedLlmConfig]);

  // 选择文件夹
  const handleSelectFolder = async () => {
    if (typeof window !== "undefined" && window.electron) {
      const result = await window.electron.selectFolder();
      if (result) {
        setDefaultPath(result);
      }
    } else {
      // 浏览器模式下的占位逻辑
      alert("文件夹选择功能仅在 Electron 环境下可用");
    }
  };

  // 保存设置
  const handleSave = async () => {
    try {
      // 保存默认路径
      await saveDefaultPath(defaultPath);
      setSavedPath(defaultPath);

      // 保存 LLM 配置
      const normalizedLlmConfig = normalizeLLMConfig(llmConfig);
      await saveLLMConfig(normalizedLlmConfig);
      setLlmConfig(normalizedLlmConfig);
      setSavedLlmConfig(normalizedLlmConfig);

      if (onSettingsChange) {
        onSettingsChange({ defaultPath });
      }
    } catch (e) {
      console.error("保存设置失败:", e);
    }
  };

  // 取消修改
  const handleCancel = () => {
    setDefaultPath(savedPath);
    setLlmConfig({ ...savedLlmConfig });
    setTempSystemPrompt(savedLlmConfig.systemPrompt);
  };

  // 打开系统提示词编辑弹窗
  const handleOpenPromptModal = () => {
    setTempSystemPrompt(llmConfig.systemPrompt);
    setIsPromptModalOpen(true);
  };

  // 关闭系统提示词编辑弹窗
  const handleClosePromptModal = () => {
    setIsPromptModalOpen(false);
  };

  // 保存系统提示词
  const handleSavePrompt = () => {
    setLlmConfig({ ...llmConfig, systemPrompt: tempSystemPrompt });
    setIsPromptModalOpen(false);
  };

  // 恢复默认系统提示词
  const handleResetPrompt = () => {
    setTempSystemPrompt(DEFAULT_SYSTEM_PROMPT);
  };

  // 测试 LLM 配置
  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    setIsTestModalOpen(true);

    try {
      const requestConfig = normalizeLLMConfig(llmConfig);

      const response = await fetch("/api/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          apiUrl: requestConfig.apiUrl,
          apiKey: requestConfig.apiKey,
          temperature: requestConfig.temperature,
          modelName: requestConfig.modelName,
          providerType: requestConfig.providerType,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setTestResult({
          success: true,
          message: `测试成功！模型响应：${data.response}`,
        });
      } else {
        setTestResult({
          success: false,
          message: `测试失败：${data.error}`,
        });
      }
    } catch (error: unknown) {
      setTestResult({
        success: false,
        message: `测试失败：${(error as Error).message || "网络错误"}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  // 关闭测试结果弹窗
  const handleCloseTestModal = () => {
    setIsTestModalOpen(false);
    setTestResult(null);
  };

  return (
    <div className="sidebar-container">
      {/* 设置内容区域 */}
      <div className="sidebar-content">
        <div className="settings-section">
          <h3 className="section-title">文件路径配置</h3>
          <p className="section-description">设置 DrawIO 文件的默认保存位置</p>

          <TextField className="w-full mt-4">
            <Label>默认启动路径</Label>
            <div className="flex gap-2 mt-2">
              <Input
                value={defaultPath}
                onChange={(e) => setDefaultPath(e.target.value)}
                placeholder="/path/to/folder"
                className="flex-1"
              />
              <Button
                variant="secondary"
                size="sm"
                className="button-small-optimized button-secondary"
                onPress={handleSelectFolder}
              >
                浏览
              </Button>
            </div>
            <Description className="mt-2">
              保存文件时将优先使用此路径,仅在 Electron 环境下生效
            </Description>
          </TextField>
        </div>

        {/* LLM 配置区域 */}
        <div className="settings-section">
          <h3 className="section-title">LLM 配置</h3>
          <p className="section-description">配置 AI 助手的连接参数和行为</p>

          {/* 请求地址 */}
          <TextField className="w-full mt-4">
            <Label>请求地址</Label>
            <Input
              value={llmConfig.apiUrl}
              onChange={(e) =>
                setLlmConfig({ ...llmConfig, apiUrl: e.target.value })
              }
              placeholder="https://api.deepseek.com/v1"
              className="mt-2"
            />
            <Description className="mt-2">
              API 端点地址，支持 OpenAI 兼容服务，推荐包含 /v1 路径
            </Description>
          </TextField>

          {/* 供应商选择 */}
          <TextField className="w-full mt-4">
            <Label>请求供应商</Label>
            <select
              className="mt-2 provider-select"
              value={llmConfig.providerType}
              onChange={(e) =>
                setLlmConfig({
                  ...llmConfig,
                  providerType: e.target.value as ProviderType,
                })
              }
            >
              {PROVIDER_OPTIONS.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                >
                  {option.label}
                </option>
              ))}
            </select>
            <Description className="mt-2">
              根据接口兼容性选择请求方式，Responses 模式支持最新 Response API
            </Description>
            <Description className="mt-1 text-xs">
              {
                PROVIDER_OPTIONS.find(
                  (option) => option.value === llmConfig.providerType,
                )?.description
              }
            </Description>
          </TextField>

          {/* 请求密钥 */}
          <TextField className="w-full mt-4">
            <Label>请求密钥</Label>
            <Input
              type="password"
              value={llmConfig.apiKey}
              onChange={(e) =>
                setLlmConfig({ ...llmConfig, apiKey: e.target.value })
              }
              placeholder="sk-..."
              className="mt-2"
            />
            <Description className="mt-2">
              API 密钥，用于身份验证（留空则不使用密钥）
            </Description>
          </TextField>

          {/* 请求模型名 */}
          <TextField className="w-full mt-4">
            <Label>请求模型名</Label>
            <Input
              value={llmConfig.modelName}
              onChange={(e) =>
                setLlmConfig({ ...llmConfig, modelName: e.target.value })
              }
              placeholder="deepseek-chat"
              className="mt-2"
            />
            <Description className="mt-2">
              使用的模型名称，如 deepseek-chat
            </Description>
          </TextField>

          {/* 请求温度 */}
          <div className="w-full mt-4">
            <Label>请求温度: {llmConfig.temperature.toFixed(2)}</Label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.01"
              value={llmConfig.temperature}
              onChange={(e) =>
                setLlmConfig({
                  ...llmConfig,
                  temperature: parseFloat(e.target.value),
                })
              }
              className="w-full mt-2 temperature-slider"
            />
            <Description className="mt-2">
              控制生成的随机性，范围 0-2，值越大越随机
            </Description>
          </div>

          {/* 最大工具调用轮次 */}
          <div className="w-full mt-4">
            <Label>最大工具调用轮次: {llmConfig.maxToolRounds}</Label>
            <input
              type="range"
              min="1"
              max="20"
              step="1"
              value={llmConfig.maxToolRounds}
              onChange={(e) =>
                setLlmConfig({
                  ...llmConfig,
                  maxToolRounds: parseInt(e.target.value),
                })
              }
              className="w-full mt-2 temperature-slider"
            />
            <Description className="mt-2">
              限制 AI 工具调用的最大循环次数，防止无限循环（范围 1-20）
            </Description>
          </div>

          {/* 系统提示词 */}
          <div className="w-full mt-4">
            <Label>系统提示词</Label>
            <Button
              variant="secondary"
              size="sm"
              className="button-small-optimized button-secondary mt-2 w-full"
              onPress={handleOpenPromptModal}
            >
              编辑系统提示词
            </Button>
            <Description className="mt-2">定义 AI 助手的行为和角色</Description>
          </div>

          {/* 测试按钮 */}
          <div className="w-full mt-4">
            <Button
              variant="primary"
              size="sm"
              className="button-primary mt-2 w-full"
              onPress={handleTest}
              isDisabled={isTesting}
            >
              {isTesting ? "测试中..." : "测试连接"}
            </Button>
            <Description className="mt-2">
              测试当前配置是否正确，发送一个简单的测试请求
            </Description>
          </div>
        </div>
      </div>

      {/* 浮动操作按钮 - 仅在有修改时显示 */}
      {hasChanges && (
        <div className="floating-actions">
          <Button
            variant="ghost"
            size="sm"
            className="sidebar-button"
            onPress={handleCancel}
          >
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            className="sidebar-button button-primary"
            onPress={handleSave}
          >
            保存
          </Button>
        </div>
      )}

      {/* 系统提示词编辑弹窗 */}
      {isPromptModalOpen && (
        <div className="modal-overlay" onClick={handleClosePromptModal}>
          <div
            className="modal-content prompt-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="modal-title">编辑系统提示词</h3>
            <TextArea
              value={tempSystemPrompt}
              onChange={(e) => setTempSystemPrompt(e.target.value)}
              placeholder="输入系统提示词..."
              className="prompt-textarea"
              rows={15}
            />
            <div className="modal-actions">
              <Button
                variant="ghost"
                size="sm"
                className="sidebar-button"
                onPress={handleClosePromptModal}
              >
                取消
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="sidebar-button button-secondary"
                onPress={handleResetPrompt}
              >
                恢复默认
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="sidebar-button button-primary"
                onPress={handleSavePrompt}
              >
                保存
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 测试结果弹窗 */}
      {isTestModalOpen && (
        <div className="modal-overlay" onClick={handleCloseTestModal}>
          <div
            className="modal-content test-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="modal-title">测试结果</h3>
            {isTesting ? (
              <div className="test-loading">
                <div className="spinner"></div>
                <p>正在测试连接...</p>
              </div>
            ) : testResult ? (
              <div
                className={`test-result ${
                  testResult.success ? "test-success" : "test-error"
                }`}
              >
                <div className="test-icon">
                  {testResult.success ? "✓" : "✗"}
                </div>
                <p className="test-message">{testResult.message}</p>
              </div>
            ) : null}
            <div className="modal-actions">
              <Button
                variant="primary"
                size="sm"
                className="sidebar-button button-primary"
                onPress={handleCloseTestModal}
                isDisabled={isTesting}
              >
                关闭
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
