"use client";

import { useState, useEffect } from "react";
import { Button } from "@heroui/react";
import { LLMConfig } from "@/app/types/chat";
import { DEFAULT_LLM_CONFIG, normalizeLLMConfig } from "@/app/lib/config-utils";
import { useStorageSettings } from "@/app/hooks/useStorageSettings";
import SettingsNav, { type SettingsTab } from "./settings/SettingsNav";
import FileSettingsPanel from "./settings/FileSettingsPanel";
import LLMSettingsPanel from "./settings/LLMSettingsPanel";
import { VersionSettingsPanel } from "./settings/VersionSettingsPanel";

interface SettingsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChange?: (settings: { defaultPath: string }) => void;
}

export default function SettingsSidebar({
  onSettingsChange,
}: SettingsSidebarProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("file");

  const {
    getLLMConfig,
    saveLLMConfig,
    getDefaultPath,
    saveDefaultPath,
    getSetting,
    setSetting,
  } = useStorageSettings();

  const [defaultPath, setDefaultPath] = useState("");
  const [savedPath, setSavedPath] = useState("");

  const [llmConfig, setLlmConfig] = useState<LLMConfig>(DEFAULT_LLM_CONFIG);
  const [savedLlmConfig, setSavedLlmConfig] =
    useState<LLMConfig>(DEFAULT_LLM_CONFIG);

  const [versionSettings, setVersionSettings] = useState({
    autoVersionOnAIEdit: true,
  });
  const [savedVersionSettings, setSavedVersionSettings] = useState({
    autoVersionOnAIEdit: true,
  });

  const [hasChanges, setHasChanges] = useState(false);

  // 加载保存的设置
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedPath = await getDefaultPath();
        const path = savedPath || "";
        setDefaultPath(path);
        setSavedPath(path);

        const savedConfig = await getLLMConfig();
        if (savedConfig) {
          const configWithDefaults = normalizeLLMConfig(savedConfig);
          setLlmConfig(configWithDefaults);
          setSavedLlmConfig(configWithDefaults);
        } else {
          setLlmConfig(DEFAULT_LLM_CONFIG);
          setSavedLlmConfig(DEFAULT_LLM_CONFIG);
        }

        const autoVersionSetting = await getSetting("autoVersionOnAIEdit");
        const autoVersionOnAIEdit = autoVersionSetting !== "false";
        setVersionSettings({ autoVersionOnAIEdit });
        setSavedVersionSettings({ autoVersionOnAIEdit });
      } catch (e) {
        console.error("加载设置失败:", e);
        setLlmConfig(DEFAULT_LLM_CONFIG);
        setSavedLlmConfig(DEFAULT_LLM_CONFIG);
        setVersionSettings({ autoVersionOnAIEdit: true });
        setSavedVersionSettings({ autoVersionOnAIEdit: true });
      }
    };

    loadSettings();
  }, [getDefaultPath, getLLMConfig, getSetting]);

  // 监听变化，检测是否有修改
  useEffect(() => {
    const pathChanged = defaultPath !== savedPath;
    const llmConfigChanged =
      JSON.stringify(llmConfig) !== JSON.stringify(savedLlmConfig);
    const versionSettingsChanged =
      versionSettings.autoVersionOnAIEdit !==
      savedVersionSettings.autoVersionOnAIEdit;
    setHasChanges(pathChanged || llmConfigChanged || versionSettingsChanged);
  }, [
    defaultPath,
    savedPath,
    llmConfig,
    savedLlmConfig,
    versionSettings,
    savedVersionSettings,
  ]);

  // 选择文件夹
  const handleSelectFolder = async () => {
    if (typeof window !== "undefined" && window.electron) {
      const result = await window.electron.selectFolder();
      if (result) {
        setDefaultPath(result);
      }
    } else {
      alert("文件夹选择功能仅在 Electron 环境下可用");
    }
  };

  // 保存设置
  const handleSave = async () => {
    try {
      await saveDefaultPath(defaultPath);
      setSavedPath(defaultPath);

      const normalizedLlmConfig = normalizeLLMConfig(llmConfig);
      await saveLLMConfig(normalizedLlmConfig);
      setLlmConfig(normalizedLlmConfig);
      setSavedLlmConfig(normalizedLlmConfig);

      await setSetting(
        "autoVersionOnAIEdit",
        versionSettings.autoVersionOnAIEdit.toString(),
      );
      setSavedVersionSettings({ ...versionSettings });

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
    setVersionSettings({ ...savedVersionSettings });
  };

  // LLM 配置变更处理
  const handleLLMConfigChange = (updates: Partial<LLMConfig>) => {
    setLlmConfig((prev) => ({ ...prev, ...updates }));
  };

  return (
    <div className="sidebar-container settings-sidebar-new">
      <div className="settings-layout">
        <SettingsNav activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="settings-content">
          {activeTab === "file" && (
            <FileSettingsPanel
              defaultPath={defaultPath}
              onChange={setDefaultPath}
              onBrowse={handleSelectFolder}
            />
          )}

          {activeTab === "llm" && (
            <LLMSettingsPanel
              config={llmConfig}
              onChange={handleLLMConfigChange}
            />
          )}

          {activeTab === "version" && (
            <VersionSettingsPanel
              settings={versionSettings}
              onChange={setVersionSettings}
            />
          )}
        </div>
      </div>

      {hasChanges && (
        <div className="settings-action-bar" role="status">
          <div className="settings-action-status">
            <span className="status-dot" aria-hidden="true" />
            <span className="status-text">有未保存的更改</span>
          </div>
          <div className="settings-action-buttons">
            <Button variant="ghost" size="sm" onPress={handleCancel}>
              取消
            </Button>
            <Button variant="primary" size="sm" onPress={handleSave}>
              保存
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
