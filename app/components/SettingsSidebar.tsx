"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@heroui/react";
import { LLMConfig } from "@/app/types/chat";
import { DEFAULT_LLM_CONFIG, normalizeLLMConfig } from "@/app/lib/config-utils";
import { useStorageSettings } from "@/app/hooks/useStorageSettings";
import SettingsNav, { type SettingsTab } from "./settings/SettingsNav";
import LLMSettingsPanel from "./settings/LLMSettingsPanel";
import { VersionSettingsPanel } from "./settings/VersionSettingsPanel";
import { GeneralSettingsPanel } from "@/app/components/settings";
import { useAppTranslation } from "@/app/i18n/hooks";

interface SettingsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChange?: (settings: { defaultPath: string }) => void;
}

export default function SettingsSidebar({
  onSettingsChange,
}: SettingsSidebarProps) {
  const { t } = useAppTranslation("settings");
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

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
  const [toast, setToast] = useState<
    | {
        message: string;
        variant: "success" | "error";
      }
    | null
  >(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, variant: "success" | "error" = "success") => {
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }
    setToast({ message, variant });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

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
        console.error(t("errors.loadFailed"), e);
        setLlmConfig(DEFAULT_LLM_CONFIG);
        setSavedLlmConfig(DEFAULT_LLM_CONFIG);
        setVersionSettings({ autoVersionOnAIEdit: true });
        setSavedVersionSettings({ autoVersionOnAIEdit: true });
        showToast(
          t("toasts.loadFailed", {
            error: (e as Error)?.message || "unknown",
          }),
          "error",
        );
      }
    };

    loadSettings();
  }, [getDefaultPath, getLLMConfig, getSetting, t, showToast]);

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

  const handleDefaultPathChange = (path: string) => {
    setDefaultPath(path);
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

      showToast(t("toasts.saveSuccess"), "success");
    } catch (e) {
      console.error(t("errors.saveFailed"), e);
      showToast(
        t("toasts.saveFailed", { error: (e as Error)?.message || "unknown" }),
        "error",
      );
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
          {activeTab === "general" && (
            <GeneralSettingsPanel
              defaultPath={defaultPath}
              onDefaultPathChange={handleDefaultPathChange}
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
            <span className="status-text">{t("actionBar.unsavedChanges")}</span>
          </div>
          <div className="settings-action-buttons">
            <Button variant="ghost" size="sm" onPress={handleCancel}>
              {t("actionBar.cancel")}
            </Button>
            <Button variant="primary" size="sm" onPress={handleSave}>
              {t("actionBar.save")}
            </Button>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex max-w-sm items-start gap-3 rounded-xl px-4 py-3 shadow-2xl"
          style={{
            backgroundColor:
              toast.variant === "success" ? "var(--success-50, #ecfdf3)" : "var(--danger-50, #fef2f2)",
            color:
              toast.variant === "success" ? "var(--success-700, #047857)" : "var(--danger-700, #b91c1c)",
            border: "1px solid var(--border-color, rgba(0,0,0,0.08))",
          }}
          role="status"
        >
          <span aria-hidden className="text-lg leading-none">
            {toast.variant === "success" ? "✓" : "✗"}
          </span>
          <span className="text-sm leading-6">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
