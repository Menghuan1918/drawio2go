"use client";

import { useState, useEffect } from "react";
import {
  Button,
  TextField,
  Label,
  Input,
  Description,
  TextArea,
  Select,
  ListBox,
  Slider,
  Popover,
  Spinner,
} from "@heroui/react";
import { Folder, Bot } from "lucide-react";
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

type SettingsTab = "file" | "llm";

export default function SettingsSidebar({
  onSettingsChange,
}: SettingsSidebarProps) {
  // 当前选中的标签
  const [activeTab, setActiveTab] = useState<SettingsTab>("file");

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
    <div className="sidebar-container settings-sidebar-new">
      {/* 左右分栏布局 */}
      <div className="settings-layout">
        {/* 左侧图标导航栏 */}
        <div className="settings-nav">
          <Button
            className={`settings-nav-item ${activeTab === "file" ? "active" : ""}`}
            onPress={() => setActiveTab("file")}
            aria-label="文件配置"
          >
            <Folder size={24} />
          </Button>
          <Button
            className={`settings-nav-item ${activeTab === "llm" ? "active" : ""}`}
            onPress={() => setActiveTab("llm")}
            aria-label="LLM 配置"
          >
            <Bot size={24} />
          </Button>
        </div>

        {/* 右侧设置内容区 */}
        <div className="settings-content">
          {/* 文件配置 */}
          {activeTab === "file" && (
            <div className="settings-panel">
              <h3 className="section-title">文件路径配置</h3>
              <p className="section-description">
                设置 DrawIO 文件的默认保存位置
              </p>

              <TextField className="w-full mt-6">
                <Label>默认启动路径</Label>
                <div className="flex gap-3 mt-3">
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
                <Description className="mt-3">
                  保存文件时将优先使用此路径,仅在 Electron 环境下生效
                </Description>
              </TextField>
            </div>
          )}

          {/* LLM 配置 */}
          {activeTab === "llm" && (
            <div className="settings-panel">
              <h3 className="section-title">LLM 配置</h3>
              <p className="section-description">
                配置 AI 助手的连接参数和行为
              </p>

              {/* 请求地址 */}
              <TextField className="w-full mt-6">
                <Label>请求地址</Label>
                <Input
                  value={llmConfig.apiUrl}
                  onChange={(e) =>
                    setLlmConfig({ ...llmConfig, apiUrl: e.target.value })
                  }
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
                value={llmConfig.providerType}
                onChange={(value) =>
                  setLlmConfig({
                    ...llmConfig,
                    providerType: value as ProviderType,
                  })
                }
              >
                <Label>请求供应商</Label>
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Content>
                  <ListBox>
                    {PROVIDER_OPTIONS.map((option) => (
                      <ListBox.Item
                        key={option.value}
                        id={option.value}
                        textValue={option.label}
                        isDisabled={option.disabled}
                      >
                        {option.label}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Content>
                <Description className="mt-3">
                  根据接口兼容性选择请求方式，Responses 模式支持最新 Response
                  API
                </Description>
                <Description className="mt-2 text-xs">
                  {
                    PROVIDER_OPTIONS.find(
                      (option) => option.value === llmConfig.providerType,
                    )?.description
                  }
                </Description>
              </Select>

              {/* 请求密钥 */}
              <TextField className="w-full mt-6">
                <Label>请求密钥</Label>
                <Input
                  type="password"
                  value={llmConfig.apiKey}
                  onChange={(e) =>
                    setLlmConfig({ ...llmConfig, apiKey: e.target.value })
                  }
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
                  value={llmConfig.modelName}
                  onChange={(e) =>
                    setLlmConfig({ ...llmConfig, modelName: e.target.value })
                  }
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
                value={llmConfig.temperature}
                onChange={(value) =>
                  setLlmConfig({
                    ...llmConfig,
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
                value={llmConfig.maxToolRounds}
                onChange={(value) =>
                  setLlmConfig({
                    ...llmConfig,
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

              {/* 系统提示词 */}
              <Popover
                isOpen={isPromptModalOpen}
                onOpenChange={setIsPromptModalOpen}
              >
                <div className="w-full mt-6">
                  <Label>系统提示词</Label>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="button-small-optimized button-secondary mt-3 w-full"
                  >
                    编辑系统提示词
                  </Button>
                  <Description className="mt-3">
                    定义 AI 助手的行为和角色
                  </Description>
                </div>
                <Popover.Content
                  className="modal-overlay-popover"
                  placement="bottom"
                >
                  <Popover.Dialog className="modal-content prompt-modal">
                    <Popover.Heading className="modal-title">
                      编辑系统提示词
                    </Popover.Heading>
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
                  </Popover.Dialog>
                </Popover.Content>
              </Popover>

              {/* 测试按钮 */}
              <Popover
                isOpen={isTestModalOpen}
                onOpenChange={setIsTestModalOpen}
              >
                <div className="w-full mt-6">
                  <Button
                    variant="primary"
                    size="sm"
                    className="button-primary mt-3 w-full"
                    onPress={handleTest}
                    isDisabled={isTesting}
                  >
                    {isTesting ? "测试中..." : "测试连接"}
                  </Button>
                  <Description className="mt-3">
                    测试当前配置是否正确，发送一个简单的测试请求
                  </Description>
                </div>
                <Popover.Content
                  className="modal-overlay-popover"
                  placement="bottom"
                >
                  <Popover.Dialog className="modal-content test-modal">
                    <Popover.Heading className="modal-title">
                      测试结果
                    </Popover.Heading>
                    {isTesting ? (
                      <div className="test-loading">
                        <Spinner />
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
                  </Popover.Dialog>
                </Popover.Content>
              </Popover>
            </div>
          )}
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
    </div>
  );
}
