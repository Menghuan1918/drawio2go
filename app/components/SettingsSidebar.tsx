"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  type ActiveModelReference,
  type AgentSettings,
  type ModelConfig,
  type ProviderConfig,
  type SkillSettings,
} from "@/app/types/chat";
import {
  DEFAULT_AGENT_SETTINGS,
  DEFAULT_DRAWIO_BASE_URL,
  DEFAULT_DRAWIO_IDENTIFIER,
  DEFAULT_DRAWIO_THEME,
  stripTrailingSlashes,
  type DrawioTheme,
} from "@/app/lib/config-utils";
import { debounce } from "@/app/lib/utils";
import { useStorageSettings } from "@/app/hooks/useStorageSettings";
import SettingsNav, { type SettingsTab } from "./settings/SettingsNav";
import DrawioSettingsPanel from "./settings/DrawioSettingsPanel";
import ModelsSettingsPanel from "./settings/ModelsSettingsPanel";
import { VersionSettingsPanel } from "./settings/VersionSettingsPanel";
import AboutSettingsPanel from "./settings/AboutSettingsPanel";
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
    getGeneralSettings,
    updateGeneralSettings,
    getSetting,
    setSetting,
    subscribeSettingsUpdates,
  } = useStorageSettings();

  const [defaultPath, setDefaultPath] = useState("");
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [drawioBaseUrl, setDrawioBaseUrl] = useState(DEFAULT_DRAWIO_BASE_URL);
  const [drawioIdentifier, setDrawioIdentifier] = useState(
    DEFAULT_DRAWIO_IDENTIFIER,
  );
  const [drawioTheme, setDrawioTheme] =
    useState<DrawioTheme>(DEFAULT_DRAWIO_THEME);
  const [drawioUrlParams, setDrawioUrlParams] = useState("");

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
  const [autoCheckEnabled, setAutoCheckEnabled] = useState(true);

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
  const saveDrawioBaseUrlNowRef = useRef<(url: string) => Promise<void>>(
    async () => {},
  );
  const saveDrawioIdentifierNowRef = useRef<
    (identifier: string) => Promise<void>
  >(async () => {});
  const saveDrawioUrlParamsNowRef = useRef<(params: string) => Promise<void>>(
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
        await updateGeneralSettings({ defaultPath: path });
        onSettingsChange?.({ defaultPath: path });
      });
    },
    [onSettingsChange, runSaveTask, updateGeneralSettings],
  );

  const saveSidebarExpandedNow = useCallback(
    async (expanded: boolean) => {
      await runSaveTask(async () => {
        await updateGeneralSettings({ sidebarExpanded: expanded });
      });
    },
    [runSaveTask, updateGeneralSettings],
  );

  const saveDrawioBaseUrlNow = useCallback(
    async (url: string) => {
      const trimmed = stripTrailingSlashes(url.trim());
      if (!trimmed) return;

      try {
        const parsed = new URL(trimmed);
        if (!parsed.protocol.startsWith("http")) return;
      } catch {
        return;
      }

      await runSaveTask(async () => {
        await updateGeneralSettings({ drawioBaseUrl: trimmed });
      });
    },
    [runSaveTask, updateGeneralSettings],
  );

  const saveDrawioIdentifierNow = useCallback(
    async (identifier: string) => {
      const trimmed = identifier.trim();
      if (!trimmed) return;

      await runSaveTask(async () => {
        await updateGeneralSettings({ drawioIdentifier: trimmed });
      });
    },
    [runSaveTask, updateGeneralSettings],
  );

  const saveDrawioThemeNow = useCallback(
    async (theme: DrawioTheme) => {
      await runSaveTask(async () => {
        await updateGeneralSettings({ drawioTheme: theme });
      });
    },
    [runSaveTask, updateGeneralSettings],
  );

  const saveDrawioUrlParamsNow = useCallback(
    async (params: string) => {
      await runSaveTask(async () => {
        await updateGeneralSettings({ drawioUrlParams: params });
      });
    },
    [runSaveTask, updateGeneralSettings],
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

  const saveUpdateAutoCheckNow = useCallback(
    async (enabled: boolean) => {
      await runSaveTask(async () => {
        await setSetting("update.autoCheck", enabled ? "1" : "0");
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("settings-updated", {
              detail: { type: "update" },
            }),
          );
        }
      });
    },
    [runSaveTask, setSetting],
  );

  useEffect(() => {
    saveDefaultPathNowRef.current = saveDefaultPathNow;
  }, [saveDefaultPathNow]);

  useEffect(() => {
    saveDrawioBaseUrlNowRef.current = saveDrawioBaseUrlNow;
  }, [saveDrawioBaseUrlNow]);

  useEffect(() => {
    saveDrawioIdentifierNowRef.current = saveDrawioIdentifierNow;
  }, [saveDrawioIdentifierNow]);

  useEffect(() => {
    saveDrawioUrlParamsNowRef.current = saveDrawioUrlParamsNow;
  }, [saveDrawioUrlParamsNow]);

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

  const debouncedSaveDrawioBaseUrl = useMemo(
    () =>
      debounce((url: string) => {
        saveDrawioBaseUrlNowRef.current(url).catch(() => {});
      }, 800),
    [],
  );

  const debouncedSaveDrawioIdentifier = useMemo(
    () =>
      debounce((identifier: string) => {
        saveDrawioIdentifierNowRef.current(identifier).catch(() => {});
      }, 800),
    [],
  );

  const debouncedSaveDrawioUrlParams = useMemo(
    () =>
      debounce((params: string) => {
        saveDrawioUrlParamsNowRef.current(params).catch(() => {});
      }, 800),
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
    debouncedSaveDrawioBaseUrl.flush();
    debouncedSaveDrawioIdentifier.flush();
    debouncedSaveDrawioUrlParams.flush();
    debouncedSaveAgentSettings.flush();
  }, [
    debouncedSaveAgentSettings,
    debouncedSaveDefaultPath,
    debouncedSaveDrawioBaseUrl,
    debouncedSaveDrawioIdentifier,
    debouncedSaveDrawioUrlParams,
  ]);

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
          generalSettings,
          loadedProviders,
          loadedModels,
          loadedAgent,
          loadedActiveModel,
          versionSetting,
          autoCheckSetting,
        ] = await Promise.all([
          getGeneralSettings(),
          getProviders(),
          getModels(),
          getAgentSettings(),
          getActiveModel(),
          getSetting("version.autoVersionOnAIEdit"),
          getSetting("update.autoCheck"),
        ]);

        const normalizedPath = generalSettings.defaultPath || "";
        setDefaultPath(normalizedPath);
        setSidebarExpanded(generalSettings.sidebarExpanded);
        setDrawioBaseUrl(
          generalSettings.drawioBaseUrl?.trim() || DEFAULT_DRAWIO_BASE_URL,
        );
        setDrawioIdentifier(
          generalSettings.drawioIdentifier?.trim() || DEFAULT_DRAWIO_IDENTIFIER,
        );
        setDrawioTheme(generalSettings.drawioTheme ?? DEFAULT_DRAWIO_THEME);
        setDrawioUrlParams(generalSettings.drawioUrlParams?.trim() || "");

        setProviders(loadedProviders);

        setModels(loadedModels);

        const agent = loadedAgent ?? DEFAULT_AGENT_SETTINGS;
        setAgentSettings(agent);

        setActiveModelState(loadedActiveModel);

        const autoVersionOnAIEdit =
          versionSetting !== "0" && versionSetting !== "false";
        setVersionSettings({ autoVersionOnAIEdit });

        const enabled =
          autoCheckSetting !== "0" && autoCheckSetting !== "false";
        setAutoCheckEnabled(enabled);
      } catch (e) {
        logger.error(t("errors.loadFailed"), e);
        setProviders([]);
        setModels([]);
        setAgentSettings(DEFAULT_AGENT_SETTINGS);
        setActiveModelState(null);
        setVersionSettings({ autoVersionOnAIEdit: true });
        setAutoCheckEnabled(true);
        setSidebarExpanded(true);
        setDrawioBaseUrl(DEFAULT_DRAWIO_BASE_URL);
        setDrawioIdentifier(DEFAULT_DRAWIO_IDENTIFIER);
        setDrawioTheme(DEFAULT_DRAWIO_THEME);
        setDrawioUrlParams("");
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
    getGeneralSettings,
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

  // 订阅 settings-updated 事件，当 Agent 设置被外部更新时（如提示词升级）重新加载
  useEffect(() => {
    const unsubscribe = subscribeSettingsUpdates(async (detail) => {
      if (detail.type !== "agent") return;

      try {
        // 取消防抖队列中的待保存任务，避免覆盖新值
        debouncedSaveAgentSettings.cancel();

        // 重新加载 Agent 设置
        const loadedAgent = await getAgentSettings();
        setAgentSettings(loadedAgent ?? DEFAULT_AGENT_SETTINGS);

        logger.info("[SettingsSidebar] Agent 设置已从外部更新，重新加载完成");
      } catch (e) {
        logger.warn("[SettingsSidebar] 重新加载 Agent 设置失败", e);
      }
    });

    return unsubscribe;
  }, [subscribeSettingsUpdates, getAgentSettings, debouncedSaveAgentSettings]);

  const systemPromptError = useMemo(
    () =>
      isSystemPromptValid(agentSettings.systemPrompt)
        ? undefined
        : t("agent.systemPrompt.errorEmpty", "系统提示词不能为空"),
    [agentSettings.systemPrompt, t],
  );

  const drawioBaseUrlError = useMemo(() => {
    const trimmed = drawioBaseUrl.trim();
    if (!trimmed) return t("errors.required");
    try {
      const url = new URL(trimmed);
      if (!url.protocol.startsWith("http")) {
        return t("errors.invalidUrl");
      }
    } catch {
      return t("errors.invalidUrl");
    }
    return undefined;
  }, [drawioBaseUrl, t]);

  const drawioIdentifierError = useMemo(() => {
    return drawioIdentifier.trim().length > 0
      ? undefined
      : t("errors.required");
  }, [drawioIdentifier, t]);

  const handleDefaultPathChange = useCallback(
    (path: string) => {
      setDefaultPath(path);
      debouncedSaveDefaultPath(path);
    },
    [debouncedSaveDefaultPath],
  );

  const handleDrawioBaseUrlChange = useCallback(
    (url: string) => {
      setDrawioBaseUrl(url);
      debouncedSaveDrawioBaseUrl(url);
    },
    [debouncedSaveDrawioBaseUrl],
  );

  const handleDrawioIdentifierChange = useCallback(
    (identifier: string) => {
      setDrawioIdentifier(identifier);
      debouncedSaveDrawioIdentifier(identifier);
    },
    [debouncedSaveDrawioIdentifier],
  );

  const handleDrawioThemeChange = useCallback(
    (theme: DrawioTheme) => {
      setDrawioTheme(theme);
      saveDrawioThemeNow(theme).catch(() => {});
    },
    [saveDrawioThemeNow],
  );

  const handleDrawioUrlParamsChange = useCallback(
    (params: string) => {
      setDrawioUrlParams(params);
      debouncedSaveDrawioUrlParams(params);
    },
    [debouncedSaveDrawioUrlParams],
  );

  const handleResetDrawioBaseUrl = useCallback(() => {
    debouncedSaveDrawioBaseUrl.cancel();
    setDrawioBaseUrl(DEFAULT_DRAWIO_BASE_URL);
    saveDrawioBaseUrlNow(DEFAULT_DRAWIO_BASE_URL).catch(() => {});
  }, [debouncedSaveDrawioBaseUrl, saveDrawioBaseUrlNow]);

  const handleResetDrawioIdentifier = useCallback(() => {
    debouncedSaveDrawioIdentifier.cancel();
    setDrawioIdentifier(DEFAULT_DRAWIO_IDENTIFIER);
    saveDrawioIdentifierNow(DEFAULT_DRAWIO_IDENTIFIER).catch(() => {});
  }, [debouncedSaveDrawioIdentifier, saveDrawioIdentifierNow]);

  const handleResetDrawioUrlParams = useCallback(() => {
    debouncedSaveDrawioUrlParams.cancel();
    setDrawioUrlParams("");
    saveDrawioUrlParamsNow("").catch(() => {});
  }, [debouncedSaveDrawioUrlParams, saveDrawioUrlParamsNow]);

  const handleSidebarExpandedChange = useCallback(
    (expanded: boolean) => {
      setSidebarExpanded(expanded);
      saveSidebarExpandedNow(expanded).catch(() => {});
    },
    [saveSidebarExpandedNow],
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

  const handleAgentSkillSettingsChange = useCallback(
    (nextSkillSettings: SkillSettings) => {
      const nextSettings: AgentSettings = {
        ...agentSettingsRef.current,
        skillSettings: nextSkillSettings,
        updatedAt: Date.now(),
      };

      setAgentSettings(nextSettings);
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

  const handleAutoCheckChange = useCallback(
    (enabled: boolean) => {
      setAutoCheckEnabled(enabled);
      saveUpdateAutoCheckNow(enabled).catch(() => {});
    },
    [saveUpdateAutoCheckNow],
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
              sidebarExpanded={sidebarExpanded}
              onSidebarExpandedChange={handleSidebarExpandedChange}
              defaultPath={defaultPath}
              onDefaultPathChange={handleDefaultPathChange}
            />
          )}

          {activeTab === "drawio" && (
            <DrawioSettingsPanel
              drawioBaseUrl={drawioBaseUrl}
              drawioIdentifier={drawioIdentifier}
              drawioTheme={drawioTheme}
              drawioUrlParams={drawioUrlParams}
              drawioBaseUrlError={drawioBaseUrlError}
              drawioIdentifierError={drawioIdentifierError}
              onDrawioBaseUrlChange={handleDrawioBaseUrlChange}
              onDrawioIdentifierChange={handleDrawioIdentifierChange}
              onDrawioThemeChange={handleDrawioThemeChange}
              onDrawioUrlParamsChange={handleDrawioUrlParamsChange}
              onResetDrawioBaseUrl={handleResetDrawioBaseUrl}
              onResetDrawioIdentifier={handleResetDrawioIdentifier}
              onResetDrawioUrlParams={handleResetDrawioUrlParams}
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
              skillSettings={
                agentSettings.skillSettings ??
                DEFAULT_AGENT_SETTINGS.skillSettings
              }
              onSkillSettingsChange={handleAgentSkillSettingsChange}
              error={systemPromptError}
            />
          )}

          {activeTab === "version" && (
            <VersionSettingsPanel
              settings={versionSettings}
              onChange={handleVersionSettingsChange}
            />
          )}

          {activeTab === "about" && (
            <AboutSettingsPanel
              autoCheckEnabled={autoCheckEnabled}
              onAutoCheckChange={handleAutoCheckChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}
