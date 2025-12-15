"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  type ActiveModelReference,
  type AgentSettings,
  type ModelConfig,
  type ProviderConfig,
} from "@/app/types/chat";
import { DEFAULT_AGENT_SETTINGS } from "@/app/lib/config-utils";
import { debounce } from "@/app/lib/utils";
import { useStorageSettings } from "@/app/hooks/useStorageSettings";
import SettingsNav, { type SettingsTab } from "./settings/SettingsNav";
import ModelsSettingsPanel from "./settings/ModelsSettingsPanel";
import { VersionSettingsPanel } from "./settings/VersionSettingsPanel";
import {
  AgentSettingsPanel,
  isSystemPromptValid,
  GeneralSettingsPanel,
} from "@/app/components/settings";
import { useAppTranslation } from "@/app/i18n/hooks";
import { useToast } from "@/app/components/toast";
import { createLogger } from "@/lib/logger";
import { subscribeSidebarNavigate } from "@/app/lib/ui-events";

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

  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [agentSettings, setAgentSettings] = useState<AgentSettings>(
    DEFAULT_AGENT_SETTINGS,
  );
  const [activeModel, setActiveModelState] =
    useState<ActiveModelReference | null>(null);

  const [versionSettings, setVersionSettings] = useState({
    autoVersionOnAIEdit: true,
  });

  const { push } = useToast();

  const showToast = useCallback(
    (params: Parameters<typeof push>[0]) => {
      push(params);
    },
    [push],
  );

  const lastSaveErrorAtRef = useRef(0);

  const saveDefaultPathNowRef = useRef<(path: string) => Promise<void>>(
    async () => {},
  );
  const saveAgentSettingsNowRef = useRef<
    (settings: AgentSettings) => Promise<void>
  >(async () => {});

  const agentSettingsRef = useRef(agentSettings);
  useEffect(() => {
    agentSettingsRef.current = agentSettings;
  }, [agentSettings]);

  /**
   * 统一的保存包装器：
   * - 成功静默（不展示顶部状态条/Toast）
   * - 失败使用统一 Toast 通知（带简单去抖，避免输入时刷屏）
   */
  const runSaveTask = useCallback(
    async (task: () => Promise<void>) => {
      try {
        await task();
      } catch (e) {
        logger.error(t("errors.saveFailed"), e);

        const now = Date.now();
        const last = lastSaveErrorAtRef.current;
        if (now - last >= 2500) {
          lastSaveErrorAtRef.current = now;
          showToast({
            variant: "danger",
            description: t("toasts.saveFailed", {
              error: (e as Error)?.message || "unknown",
            }),
          });
        }
      }
    },
    [showToast, t],
  );

  const saveDefaultPathNow = useCallback(
    async (path: string) => {
      await runSaveTask(async () => {
        await saveDefaultPath(path);
        onSettingsChange?.({ defaultPath: path });
      });
    },
    [onSettingsChange, runSaveTask, saveDefaultPath],
  );

  const saveAgentSettingsNow = useCallback(
    async (settings: AgentSettings) => {
      if (!isSystemPromptValid(settings.systemPrompt)) return;

      await runSaveTask(async () => {
        await saveAgentSettings(settings);
      });
    },
    [runSaveTask, saveAgentSettings],
  );

  const saveVersionSettingsNow = useCallback(
    async (settings: { autoVersionOnAIEdit: boolean }) => {
      await runSaveTask(async () => {
        await setSetting(
          "version.autoVersionOnAIEdit",
          settings.autoVersionOnAIEdit ? "1" : "0",
        );
      });
    },
    [runSaveTask, setSetting],
  );

  useEffect(() => {
    saveDefaultPathNowRef.current = saveDefaultPathNow;
  }, [saveDefaultPathNow]);

  useEffect(() => {
    saveAgentSettingsNowRef.current = saveAgentSettingsNow;
  }, [saveAgentSettingsNow]);

  const debouncedSaveDefaultPath = useMemo(
    () =>
      debounce((path: string) => {
        saveDefaultPathNowRef.current(path).catch(() => {});
      }, 500),
    [],
  );

  const debouncedSaveAgentSettings = useMemo(
    () =>
      debounce((settings: AgentSettings) => {
        saveAgentSettingsNowRef.current(settings).catch(() => {});
      }, 800),
    [],
  );

  const flushPendingSaves = useCallback(() => {
    debouncedSaveDefaultPath.flush();
    debouncedSaveAgentSettings.flush();
  }, [debouncedSaveAgentSettings, debouncedSaveDefaultPath]);

  useEffect(() => {
    return subscribeSidebarNavigate((detail) => {
      if (detail.tab === "settings" && detail.settingsTab) {
        flushPendingSaves();
        setActiveTab(detail.settingsTab);
      }
    });
  }, [flushPendingSaves]);

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

        setProviders(loadedProviders);

        setModels(loadedModels);

        const agent = loadedAgent ?? DEFAULT_AGENT_SETTINGS;
        setAgentSettings(agent);

        setActiveModelState(loadedActiveModel);

        const autoVersionOnAIEdit =
          versionSetting !== "0" && versionSetting !== "false";
        setVersionSettings({ autoVersionOnAIEdit });
      } catch (e) {
        logger.error(t("errors.loadFailed"), e);
        setProviders([]);
        setModels([]);
        setAgentSettings(DEFAULT_AGENT_SETTINGS);
        setActiveModelState(null);
        setVersionSettings({ autoVersionOnAIEdit: true });
        showToast({
          variant: "danger",
          description: t("toasts.loadFailed", {
            error: (e as Error)?.message || "unknown",
          }),
        });
      }
    };

    loadSettings().catch(() => {});
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

  // 组件卸载时强制 flush，确保最后一次编辑被写入存储
  useEffect(() => {
    return () => {
      flushPendingSaves();
    };
  }, [flushPendingSaves]);

  const systemPromptError = useMemo(
    () =>
      isSystemPromptValid(agentSettings.systemPrompt)
        ? undefined
        : t("agent.systemPrompt.errorEmpty", "系统提示词不能为空"),
    [agentSettings.systemPrompt, t],
  );

  const handleDefaultPathChange = useCallback(
    (path: string) => {
      setDefaultPath(path);
      debouncedSaveDefaultPath(path);
    },
    [debouncedSaveDefaultPath],
  );

  const handleProvidersChange = (items: ProviderConfig[]) => {
    setProviders(items);
  };

  const handleModelsChange = (items: ModelConfig[]) => {
    setModels(items);
  };

  const handleActiveModelChange = (model: ActiveModelReference | null) => {
    setActiveModelState(model);
  };

  const handleAgentSystemPromptChange = useCallback(
    (nextPrompt: string) => {
      const nextSettings: AgentSettings = {
        ...agentSettingsRef.current,
        systemPrompt: nextPrompt,
        updatedAt: Date.now(),
      };

      setAgentSettings(nextSettings);

      // 文本输入频繁，使用更长的防抖；无效内容（空）不写入存储
      if (!isSystemPromptValid(nextSettings.systemPrompt)) {
        debouncedSaveAgentSettings.cancel();
        return;
      }

      debouncedSaveAgentSettings(nextSettings);
    },
    [debouncedSaveAgentSettings],
  );

  const handleVersionSettingsChange = useCallback(
    (settings: { autoVersionOnAIEdit: boolean }) => {
      setVersionSettings(settings);
      saveVersionSettingsNow(settings).catch(() => {});
    },
    [saveVersionSettingsNow],
  );

  const handleTabChange = useCallback(
    (tab: SettingsTab) => {
      // 切换 Tab 前 flush，避免最后一次输入还在防抖队列中
      flushPendingSaves();
      setActiveTab(tab);
    },
    [flushPendingSaves],
  );

  return (
    <div className="sidebar-container settings-sidebar-new">
      <div className="settings-layout">
        <SettingsNav activeTab={activeTab} onTabChange={handleTabChange} />

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
              systemPrompt={agentSettings.systemPrompt}
              onChange={handleAgentSystemPromptChange}
              error={systemPromptError}
            />
          )}

          {activeTab === "version" && (
            <VersionSettingsPanel
              settings={versionSettings}
              onChange={handleVersionSettingsChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}
