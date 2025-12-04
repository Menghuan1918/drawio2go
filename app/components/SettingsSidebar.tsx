"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@heroui/react";
import {
  type ActiveModelReference,
  type AgentSettings,
  type ModelConfig,
  type ProviderConfig,
} from "@/app/types/chat";
import { DEFAULT_AGENT_SETTINGS } from "@/app/lib/config-utils";
import { useStorageSettings } from "@/app/hooks/useStorageSettings";
import SettingsNav, { type SettingsTab } from "./settings/SettingsNav";
import ModelsSettingsPanel from "./settings/ModelsSettingsPanel";
import { VersionSettingsPanel } from "./settings/VersionSettingsPanel";
import {
  AgentSettingsPanel,
  GeneralSettingsPanel,
} from "@/app/components/settings";
import { useAppTranslation } from "@/app/i18n/hooks";
import { useToast } from "@/app/components/toast";
import { createLogger } from "@/lib/logger";

const logger = createLogger("SettingsSidebar");

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
    getProviders,
    getModels,
    getAgentSettings,
    saveAgentSettings,
    getActiveModel,
    getDefaultPath,
    saveDefaultPath,
    getSetting,
    setSetting,
  } = useStorageSettings();

  const [defaultPath, setDefaultPath] = useState("");
  const [savedPath, setSavedPath] = useState("");

  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [savedProviders, setSavedProviders] = useState<ProviderConfig[]>([]);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [savedModels, setSavedModels] = useState<ModelConfig[]>([]);
  const [agentSettings, setAgentSettings] = useState<AgentSettings>(
    DEFAULT_AGENT_SETTINGS,
  );
  const [savedAgentSettings, setSavedAgentSettings] = useState<AgentSettings>(
    DEFAULT_AGENT_SETTINGS,
  );
  const [activeModel, setActiveModelState] =
    useState<ActiveModelReference | null>(null);
  const [savedActiveModel, setSavedActiveModel] =
    useState<ActiveModelReference | null>(null);

  const [versionSettings, setVersionSettings] = useState({
    autoVersionOnAIEdit: true,
  });
  const [savedVersionSettings, setSavedVersionSettings] = useState({
    autoVersionOnAIEdit: true,
  });

  const [hasChanges, setHasChanges] = useState(false);
  const { push } = useToast();

  const showToast = useCallback(
    (params: Parameters<typeof push>[0]) => {
      push(params);
    },
    [push],
  );

  // 加载保存的设置
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [
          path,
          loadedProviders,
          loadedModels,
          loadedAgent,
          loadedActiveModel,
          versionSetting,
        ] = await Promise.all([
          getDefaultPath(),
          getProviders(),
          getModels(),
          getAgentSettings(),
          getActiveModel(),
          getSetting("version.autoVersionOnAIEdit"),
        ]);

        const normalizedPath = path || "";
        setDefaultPath(normalizedPath);
        setSavedPath(normalizedPath);

        setProviders(loadedProviders);
        setSavedProviders(loadedProviders);

        setModels(loadedModels);
        setSavedModels(loadedModels);

        const agent = loadedAgent ?? DEFAULT_AGENT_SETTINGS;
        setAgentSettings(agent);
        setSavedAgentSettings(agent);

        setActiveModelState(loadedActiveModel);
        setSavedActiveModel(loadedActiveModel);

        const autoVersionOnAIEdit =
          versionSetting !== "0" && versionSetting !== "false";
        setVersionSettings({ autoVersionOnAIEdit });
        setSavedVersionSettings({ autoVersionOnAIEdit });
      } catch (e) {
        logger.error(t("errors.loadFailed"), e);
        setProviders([]);
        setSavedProviders([]);
        setModels([]);
        setSavedModels([]);
        setAgentSettings(DEFAULT_AGENT_SETTINGS);
        setSavedAgentSettings(DEFAULT_AGENT_SETTINGS);
        setActiveModelState(null);
        setSavedActiveModel(null);
        setVersionSettings({ autoVersionOnAIEdit: true });
        setSavedVersionSettings({ autoVersionOnAIEdit: true });
        showToast({
          variant: "danger",
          description: t("toasts.loadFailed", {
            error: (e as Error)?.message || "unknown",
          }),
        });
      }
    };

    void loadSettings();
  }, [
    getAgentSettings,
    getDefaultPath,
    getModels,
    getProviders,
    getActiveModel,
    getSetting,
    showToast,
    t,
  ]);

  // 监听变化，检测是否有修改
  useEffect(() => {
    const pathChanged = defaultPath !== savedPath;
    const providersChanged =
      JSON.stringify(providers) !== JSON.stringify(savedProviders);
    const modelsChanged =
      JSON.stringify(models) !== JSON.stringify(savedModels);
    const agentChanged =
      JSON.stringify(agentSettings) !== JSON.stringify(savedAgentSettings);
    const activeModelChanged =
      JSON.stringify(activeModel) !== JSON.stringify(savedActiveModel);
    const versionSettingsChanged =
      versionSettings.autoVersionOnAIEdit !==
      savedVersionSettings.autoVersionOnAIEdit;

    setHasChanges(
      pathChanged ||
        providersChanged ||
        modelsChanged ||
        agentChanged ||
        activeModelChanged ||
        versionSettingsChanged,
    );
  }, [
    defaultPath,
    savedPath,
    providers,
    savedProviders,
    models,
    savedModels,
    agentSettings,
    savedAgentSettings,
    activeModel,
    savedActiveModel,
    versionSettings,
    savedVersionSettings,
  ]);

  const handleDefaultPathChange = (path: string) => {
    setDefaultPath(path);
  };

  const handleProvidersChange = (items: ProviderConfig[]) => {
    setProviders(items);
  };

  const handleModelsChange = (items: ModelConfig[]) => {
    setModels(items);
  };

  const handleActiveModelChange = (model: ActiveModelReference | null) => {
    setActiveModelState(model);
  };

  const handleAgentSettingsChange = (settings: AgentSettings) => {
    setAgentSettings(settings);
  };

  // 保存设置（providers/models 保存由各自面板负责，这里同步 agent/version/defaultPath 状态）
  const handleSave = async () => {
    try {
      await Promise.all([
        saveDefaultPath(defaultPath),
        saveAgentSettings(agentSettings),
        setSetting(
          "version.autoVersionOnAIEdit",
          versionSettings.autoVersionOnAIEdit ? "1" : "0",
        ),
      ]);

      setSavedPath(defaultPath);
      setSavedAgentSettings(agentSettings);
      setSavedVersionSettings({ ...versionSettings });
      setSavedProviders(providers);
      setSavedModels(models);
      setSavedActiveModel(activeModel);

      onSettingsChange?.({ defaultPath });

      showToast({ variant: "success", description: t("toasts.saveSuccess") });
    } catch (e) {
      logger.error(t("errors.saveFailed"), e);
      showToast({
        variant: "danger",
        description: t("toasts.saveFailed", {
          error: (e as Error)?.message || "unknown",
        }),
      });
    }
  };

  // 取消修改
  const handleCancel = () => {
    setDefaultPath(savedPath);
    setProviders([...savedProviders]);
    setModels([...savedModels]);
    setAgentSettings({ ...savedAgentSettings });
    setActiveModelState(savedActiveModel);
    setVersionSettings({ ...savedVersionSettings });
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

          {activeTab === "models" && (
            <ModelsSettingsPanel
              providers={providers}
              models={models}
              activeModel={activeModel}
              onProvidersChange={handleProvidersChange}
              onModelsChange={handleModelsChange}
              onActiveModelChange={handleActiveModelChange}
            />
          )}

          {activeTab === "agent" && (
            <AgentSettingsPanel
              agentSettings={agentSettings}
              onChange={handleAgentSettingsChange}
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
            <Button variant="tertiary" size="sm" onPress={handleCancel}>
              {t("actionBar.cancel")}
            </Button>
            <Button variant="primary" size="sm" onPress={handleSave}>
              {t("actionBar.save")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
