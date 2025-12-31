"use client";

import { useState, useEffect, useCallback } from "react";
import { getStorage } from "@/app/lib/storage";
import type {
  ActiveModelReference,
  AgentSettings,
  ModelCapabilities,
  ModelConfig,
  RuntimeLLMConfig,
  ProviderConfig,
  SkillKnowledgeId,
  SkillSettings,
} from "@/app/types/chat";
import {
  DEFAULT_AGENT_SETTINGS,
  DEFAULT_GENERAL_SETTINGS,
  DEFAULT_SKILL_SETTINGS,
  type GeneralSettings,
  STORAGE_KEY_ACTIVE_MODEL,
  STORAGE_KEY_AGENT_SETTINGS,
  STORAGE_KEY_GENERAL_SETTINGS,
  STORAGE_KEY_LLM_MODELS,
  STORAGE_KEY_LLM_PROVIDERS,
  isDrawioTheme,
  normalizeLLMConfig,
  stripTrailingSlashes,
} from "@/app/lib/config-utils";
import { getDefaultCapabilities } from "@/app/lib/model-capabilities";
import { createLogger } from "@/app/lib/logger";
import { generateUUID, runStorageTask } from "@/app/lib/utils";
import {
  getStorageTimeoutMessage,
  withStorageTimeout,
} from "@/app/lib/storage/timeout-utils";

const logger = createLogger("useStorageSettings");
const STORAGE_TIMEOUT_MESSAGE = getStorageTimeoutMessage();

type SettingsUpdatedType =
  | "provider"
  | "model"
  | "agent"
  | "activeModel"
  | "general"
  | "update";
type SettingsUpdatedDetail = { type: SettingsUpdatedType };

type StorageInstance = Awaited<ReturnType<typeof getStorage>>;

const safeParseJSON = <T>(
  raw: string | null,
  key: string,
  fallback: T | null = null,
): T | null => {
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    logger.error(`[useStorageSettings] 解析 ${key} 失败`, error);
    return fallback;
  }
};

const normalizeDrawioUrlParams = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const withoutQuestionMark = trimmed.startsWith("?")
    ? trimmed.slice(1).trim()
    : trimmed;
  return withoutQuestionMark ? withoutQuestionMark : undefined;
};

const normalizeGeneralSettings = (parsed: unknown): GeneralSettings | null => {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const record = parsed as Record<string, unknown>;

  const normalizeDrawioBaseUrl = (value: unknown): string | undefined => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    try {
      const url = new URL(trimmed);
      if (!url.protocol.startsWith("http")) return undefined;
    } catch {
      return undefined;
    }
    return stripTrailingSlashes(trimmed);
  };

  const normalizeDrawioIdentifier = (value: unknown): string | undefined => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  };

  const normalizeDrawioTheme = (
    value: unknown,
  ): GeneralSettings["drawioTheme"] =>
    isDrawioTheme(value) ? value : undefined;

  return {
    sidebarExpanded:
      typeof record.sidebarExpanded === "boolean"
        ? record.sidebarExpanded
        : DEFAULT_GENERAL_SETTINGS.sidebarExpanded,
    defaultPath:
      typeof record.defaultPath === "string"
        ? record.defaultPath
        : DEFAULT_GENERAL_SETTINGS.defaultPath,
    drawioBaseUrl: normalizeDrawioBaseUrl(record.drawioBaseUrl),
    drawioIdentifier: normalizeDrawioIdentifier(record.drawioIdentifier),
    drawioTheme: normalizeDrawioTheme(record.drawioTheme),
    drawioUrlParams: normalizeDrawioUrlParams(record.drawioUrlParams),
  };
};

const normalizeSkillSettings = (parsed: unknown): SkillSettings => {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return DEFAULT_SKILL_SETTINGS;
  }

  const record = parsed as Record<string, unknown>;
  const selectedTheme =
    typeof record.selectedTheme === "string" && record.selectedTheme.trim()
      ? record.selectedTheme
      : DEFAULT_SKILL_SETTINGS.selectedTheme;

  const selectedKnowledge = Array.isArray(record.selectedKnowledge)
    ? record.selectedKnowledge.filter(
        (item): item is SkillKnowledgeId =>
          typeof item === "string" && item.trim().length > 0,
      )
    : DEFAULT_SKILL_SETTINGS.selectedKnowledge;

  const customThemePrompt =
    typeof record.customThemePrompt === "string"
      ? record.customThemePrompt
      : DEFAULT_SKILL_SETTINGS.customThemePrompt;

  const customKnowledgeContent =
    typeof record.customKnowledgeContent === "string"
      ? record.customKnowledgeContent
      : DEFAULT_SKILL_SETTINGS.customKnowledgeContent;

  const selectedColorTheme =
    typeof record.selectedColorTheme === "string" &&
    record.selectedColorTheme.trim()
      ? record.selectedColorTheme
      : DEFAULT_SKILL_SETTINGS.selectedColorTheme;

  return {
    selectedTheme,
    selectedKnowledge:
      selectedKnowledge.length > 0
        ? selectedKnowledge
        : DEFAULT_SKILL_SETTINGS.selectedKnowledge,
    customThemePrompt,
    customKnowledgeContent,
    selectedColorTheme,
  };
};

const pickFallbackActiveModel = (
  providers: ProviderConfig[],
  models: ModelConfig[],
  preferredProviderId?: string,
): ActiveModelReference | null => {
  const pickFromProvider = (
    providerId: string,
  ): ActiveModelReference | null => {
    const candidateModels = models.filter(
      (model) => model.providerId === providerId,
    );
    if (candidateModels.length === 0) return null;
    const target =
      candidateModels.find((model) => model.isDefault) ?? candidateModels[0];
    return {
      providerId,
      modelId: target.id,
      updatedAt: Date.now(),
    };
  };

  const orderedProviderIds = preferredProviderId
    ? [
        preferredProviderId,
        ...providers
          .map((provider) => provider.id)
          .filter((id) => id !== preferredProviderId),
      ]
    : providers.map((provider) => provider.id);

  for (const providerId of orderedProviderIds) {
    const picked = pickFromProvider(providerId);
    if (picked) return picked;
  }

  return null;
};

const dispatchSettingsUpdated = (type: SettingsUpdatedType) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<SettingsUpdatedDetail>("settings-updated", {
      detail: { type },
    }),
  );
};

const buildModelIdSet = (models: ModelConfig[]) =>
  new Set(models.map((model) => model.id));

const pruneProviderModelIds = (
  providers: ProviderConfig[],
  allowedModelIds: Set<string>,
): ProviderConfig[] =>
  providers.map((provider) => ({
    ...provider,
    models: provider.models.filter((modelId) => allowedModelIds.has(modelId)),
  }));

const removeModelFromProviders = (
  providers: ProviderConfig[],
  providerId: string,
  modelId: string,
  updatedAt: number,
): ProviderConfig[] =>
  providers.map((provider) =>
    provider.id === providerId
      ? {
          ...provider,
          models: provider.models.filter((id) => id !== modelId),
          updatedAt,
        }
      : provider,
  );

export type CreateProviderInput = Pick<
  ProviderConfig,
  "displayName" | "providerType" | "apiUrl" | "apiKey"
> & { customConfig?: ProviderConfig["customConfig"] };

export type UpdateProviderInput = Partial<
  Pick<ProviderConfig, "displayName" | "providerType" | "apiUrl" | "apiKey">
> & { customConfig?: ProviderConfig["customConfig"] };

export type CreateModelInput = Pick<
  ModelConfig,
  "modelName" | "displayName" | "temperature" | "maxToolRounds" | "isDefault"
> & {
  capabilities?: ModelCapabilities;
  enableToolsInThinking?: boolean;
  customConfig?: ModelConfig["customConfig"];
};

export type UpdateModelInput = Partial<
  Pick<
    ModelConfig,
    | "modelName"
    | "displayName"
    | "temperature"
    | "maxToolRounds"
    | "isDefault"
    | "capabilities"
    | "enableToolsInThinking"
  >
> & { customConfig?: ModelConfig["customConfig"] };

/**
 * 设置管理 Hook
 *
 * 提供设置的读取、保存和删除功能，
 * 自动处理加载状态和错误
 */
export function useStorageSettings() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const resolveStorage = useCallback(
    () => withStorageTimeout(getStorage(), STORAGE_TIMEOUT_MESSAGE),
    [],
  );

  const execute = useCallback(
    async <T>(task: (storage: StorageInstance) => Promise<T>): Promise<T> =>
      runStorageTask(
        async () => {
          const storage = await resolveStorage();
          return task(storage);
        },
        { setLoading, setError },
      ),
    [resolveStorage],
  );

  const subscribeSettingsUpdates = useCallback(
    (callback: (detail: SettingsUpdatedDetail) => void): (() => void) => {
      if (typeof window === "undefined") return () => undefined;

      const handler = (event: Event) => {
        const detail = (event as CustomEvent<SettingsUpdatedDetail>).detail;
        if (!detail) return;
        try {
          callback(detail);
        } catch (error) {
          logger.warn("settings subscriber failed", { error });
        }
      };

      window.addEventListener("settings-updated", handler);
      return () => window.removeEventListener("settings-updated", handler);
    },
    [],
  );

  const loadProviders = useCallback(
    async (storage: StorageInstance): Promise<ProviderConfig[]> => {
      const raw = await withStorageTimeout(
        storage.getSetting(STORAGE_KEY_LLM_PROVIDERS),
      );

      if (raw === null) {
        logger.info("[useStorageSettings] 未找到 LLM providers，返回空列表");
        return [];
      }

      const parsed = safeParseJSON<ProviderConfig[]>(
        raw,
        STORAGE_KEY_LLM_PROVIDERS,
        [],
      );
      return parsed ?? [];
    },
    [],
  );

  const loadModels = useCallback(
    async (storage: StorageInstance): Promise<ModelConfig[]> => {
      const raw = await withStorageTimeout(
        storage.getSetting(STORAGE_KEY_LLM_MODELS),
      );

      if (raw === null) {
        logger.info("[useStorageSettings] 未找到 LLM models，返回空列表");
        return [];
      }

      const parsed = safeParseJSON<ModelConfig[]>(
        raw,
        STORAGE_KEY_LLM_MODELS,
        [],
      );
      return parsed ?? [];
    },
    [],
  );

  const loadAgentSettings = useCallback(
    async (storage: StorageInstance): Promise<AgentSettings> => {
      const raw = await withStorageTimeout(
        storage.getSetting(STORAGE_KEY_AGENT_SETTINGS),
      );
      const parsed = safeParseJSON<AgentSettings>(
        raw,
        STORAGE_KEY_AGENT_SETTINGS,
        null,
      );
      if (!parsed) {
        return DEFAULT_AGENT_SETTINGS;
      }
      return {
        ...DEFAULT_AGENT_SETTINGS,
        ...parsed,
        skillSettings:
          normalizeSkillSettings(parsed.skillSettings) ??
          DEFAULT_SKILL_SETTINGS,
      };
    },
    [],
  );

  const loadActiveModel = useCallback(
    async (storage: StorageInstance): Promise<ActiveModelReference | null> => {
      const raw = await withStorageTimeout(
        storage.getSetting(STORAGE_KEY_ACTIVE_MODEL),
      );
      return safeParseJSON<ActiveModelReference>(
        raw,
        STORAGE_KEY_ACTIVE_MODEL,
        null,
      );
    },
    [],
  );

  const persistProviders = useCallback(
    async (storage: StorageInstance, providers: ProviderConfig[]) => {
      await withStorageTimeout(
        storage.setSetting(
          STORAGE_KEY_LLM_PROVIDERS,
          JSON.stringify(providers),
        ),
      );
    },
    [],
  );

  const persistModels = useCallback(
    async (storage: StorageInstance, models: ModelConfig[]) => {
      await withStorageTimeout(
        storage.setSetting(STORAGE_KEY_LLM_MODELS, JSON.stringify(models)),
      );
    },
    [],
  );

  const persistAgentSettings = useCallback(
    async (storage: StorageInstance, settings: AgentSettings) => {
      await withStorageTimeout(
        storage.setSetting(
          STORAGE_KEY_AGENT_SETTINGS,
          JSON.stringify(settings),
        ),
      );
    },
    [],
  );

  const persistActiveModel = useCallback(
    async (storage: StorageInstance, active: ActiveModelReference | null) => {
      if (active) {
        await withStorageTimeout(
          storage.setSetting(STORAGE_KEY_ACTIVE_MODEL, JSON.stringify(active)),
        );
        return;
      }
      await withStorageTimeout(storage.deleteSetting(STORAGE_KEY_ACTIVE_MODEL));
    },
    [],
  );

  const loadGeneralSettings = useCallback(
    async (storage: StorageInstance): Promise<GeneralSettings> => {
      const rawGeneral = await withStorageTimeout(
        storage.getSetting(STORAGE_KEY_GENERAL_SETTINGS),
      );

      const parsed = safeParseJSON<unknown>(
        rawGeneral,
        STORAGE_KEY_GENERAL_SETTINGS,
        null,
      );

      const normalized = normalizeGeneralSettings(parsed);
      return normalized ?? DEFAULT_GENERAL_SETTINGS;
    },
    [],
  );

  const persistGeneralSettings = useCallback(
    async (storage: StorageInstance, settings: GeneralSettings) => {
      await withStorageTimeout(
        storage.setSetting(
          STORAGE_KEY_GENERAL_SETTINGS,
          JSON.stringify(settings),
        ),
      );
    },
    [],
  );

  /**
   * 获取设置值
   */
  const getSetting = useCallback(
    async (key: string): Promise<string | null> => {
      return execute((storage) => withStorageTimeout(storage.getSetting(key)));
    },
    [execute],
  );

  /**
   * 设置值
   */
  const setSetting = useCallback(
    async (key: string, value: string): Promise<void> => {
      await execute((storage) =>
        withStorageTimeout(storage.setSetting(key, value)),
      );
    },
    [execute],
  );

  /**
   * 获取所有设置
   */
  const getAllSettings = useCallback(async () => {
    return execute((storage) => withStorageTimeout(storage.getAllSettings()));
  }, [execute]);

  /**
   * 获取通用设置（v1）
   */
  const getGeneralSettings = useCallback(async (): Promise<GeneralSettings> => {
    return execute(async (storage) => {
      const settings = await loadGeneralSettings(storage);
      return settings;
    });
  }, [execute, loadGeneralSettings]);

  /**
   * 保存通用设置（全量覆盖）
   */
  const saveGeneralSettings = useCallback(
    async (settings: GeneralSettings): Promise<void> => {
      await execute(async (storage) => {
        await persistGeneralSettings(storage, settings);
        dispatchSettingsUpdated("general");
      });
    },
    [execute, persistGeneralSettings],
  );

  /**
   * 更新通用设置（Partial 合并）
   */
  const updateGeneralSettings = useCallback(
    async (updates: Partial<GeneralSettings>): Promise<GeneralSettings> => {
      return execute(async (storage) => {
        const current = await loadGeneralSettings(storage);
        const next: GeneralSettings = {
          sidebarExpanded:
            typeof updates.sidebarExpanded === "boolean"
              ? updates.sidebarExpanded
              : current.sidebarExpanded,
          defaultPath:
            typeof updates.defaultPath === "string"
              ? updates.defaultPath
              : current.defaultPath,
          drawioBaseUrl:
            typeof updates.drawioBaseUrl === "string"
              ? updates.drawioBaseUrl
              : current.drawioBaseUrl,
          drawioIdentifier:
            typeof updates.drawioIdentifier === "string"
              ? updates.drawioIdentifier
              : current.drawioIdentifier,
          drawioTheme: isDrawioTheme(updates.drawioTheme)
            ? updates.drawioTheme
            : current.drawioTheme,
          drawioUrlParams:
            typeof updates.drawioUrlParams === "string"
              ? normalizeDrawioUrlParams(updates.drawioUrlParams)
              : current.drawioUrlParams,
        };

        await persistGeneralSettings(storage, next);
        dispatchSettingsUpdated("general");
        return next;
      });
    },
    [execute, loadGeneralSettings, persistGeneralSettings],
  );

  /**
   * 获取默认路径（便捷方法，内部使用通用设置）
   */
  const getDefaultPath = useCallback(async (): Promise<string | null> => {
    const settings = await getGeneralSettings();
    const normalized = settings.defaultPath.trim();
    return normalized ? normalized : null;
  }, [getGeneralSettings]);

  /**
   * 保存默认路径（便捷方法，内部使用通用设置）
   */
  const saveDefaultPath = useCallback(
    async (path: string): Promise<void> => {
      await updateGeneralSettings({ defaultPath: path });
    },
    [updateGeneralSettings],
  );

  /**
   * 获取供应商列表
   */
  const getProviders = useCallback(async (): Promise<ProviderConfig[]> => {
    return execute(async (storage) => {
      const providers = await loadProviders(storage);
      return providers;
    });
  }, [execute, loadProviders]);

  /**
   * 获取模型列表
   */
  const getModels = useCallback(async (): Promise<ModelConfig[]> => {
    return execute(async (storage) => {
      const models = await loadModels(storage);
      return models;
    });
  }, [execute, loadModels]);

  /**
   * 保存供应商列表
   */
  const saveProviders = useCallback(
    async (providers: ProviderConfig[]): Promise<void> => {
      await execute(async (storage) => {
        await persistProviders(storage, providers);
        dispatchSettingsUpdated("provider");
      });
    },
    [execute, persistProviders],
  );

  /**
   * 新增供应商
   */
  const addProvider = useCallback(
    async (providerData: CreateProviderInput): Promise<ProviderConfig> => {
      return execute(async (storage) => {
        const providers = await loadProviders(storage);
        const now = Date.now();
        const newProvider: ProviderConfig = {
          id: generateUUID("provider"),
          displayName: providerData.displayName,
          providerType: providerData.providerType,
          apiUrl: providerData.apiUrl,
          apiKey: providerData.apiKey,
          models: [],
          customConfig: providerData.customConfig ?? {},
          createdAt: now,
          updatedAt: now,
        };

        await persistProviders(storage, [...providers, newProvider]);
        dispatchSettingsUpdated("provider");
        return newProvider;
      });
    },
    [execute, loadProviders, persistProviders],
  );

  /**
   * 更新供应商
   */
  const updateProvider = useCallback(
    async (
      providerId: string,
      updates: UpdateProviderInput,
    ): Promise<ProviderConfig> => {
      return execute(async (storage) => {
        const providers = await loadProviders(storage);
        const index = providers.findIndex(
          (provider) => provider.id === providerId,
        );

        if (index === -1) {
          throw new Error(`供应商 ${providerId} 不存在，无法更新`);
        }

        const current = providers[index];
        const mergedCustomConfig =
          updates.customConfig !== undefined
            ? { ...current.customConfig, ...updates.customConfig }
            : current.customConfig;

        const updatedProvider: ProviderConfig = {
          ...current,
          ...updates,
          customConfig: mergedCustomConfig,
          updatedAt: Date.now(),
        };

        providers[index] = updatedProvider;
        await persistProviders(storage, providers);
        dispatchSettingsUpdated("provider");
        return updatedProvider;
      });
    },
    [execute, loadProviders, persistProviders],
  );

  /**
   * 删除供应商（级联删除模型与活动引用）
   */
  const deleteProvider = useCallback(
    async (providerId: string): Promise<void> => {
      await execute(async (storage) => {
        const [providers, models, activeModel] = await Promise.all([
          loadProviders(storage),
          loadModels(storage),
          loadActiveModel(storage),
        ]);

        const provider = providers.find((item) => item.id === providerId);
        if (!provider) {
          throw new Error(`供应商 ${providerId} 不存在，无法删除`);
        }

        const remainingProviders = providers.filter(
          (item) => item.id !== providerId,
        );
        const remainingModels = models.filter(
          (model) => model.providerId !== providerId,
        );

        const remainingModelIds = buildModelIdSet(remainingModels);
        const sanitizedProviders = pruneProviderModelIds(
          remainingProviders,
          remainingModelIds,
        );

        const shouldSwitchActive =
          activeModel?.providerId === providerId ||
          (activeModel &&
            !remainingModels.some((model) => model.id === activeModel.modelId));

        const nextActive = shouldSwitchActive
          ? pickFallbackActiveModel(sanitizedProviders, remainingModels)
          : (activeModel ?? null);

        await Promise.all([
          persistProviders(storage, sanitizedProviders),
          persistModels(storage, remainingModels),
          persistActiveModel(storage, nextActive),
        ]);
        dispatchSettingsUpdated("provider");
      });
    },
    [
      execute,
      loadActiveModel,
      loadModels,
      loadProviders,
      persistActiveModel,
      persistModels,
      persistProviders,
    ],
  );

  /**
   * 新增模型
   */
  const addModel = useCallback(
    async (
      providerId: string,
      modelData: CreateModelInput,
    ): Promise<ModelConfig> => {
      return execute(async (storage) => {
        const [providers, models] = await Promise.all([
          loadProviders(storage),
          loadModels(storage),
        ]);
        const provider = providers.find((item) => item.id === providerId);

        if (!provider) {
          throw new Error(`供应商 ${providerId} 不存在，无法添加模型`);
        }

        const now = Date.now();
        const capabilities =
          modelData.capabilities ?? getDefaultCapabilities(modelData.modelName);
        const enableToolsInThinking =
          modelData.enableToolsInThinking ?? capabilities.supportsThinking;

        const newModel: ModelConfig = {
          id: generateUUID("model"),
          providerId,
          modelName: modelData.modelName,
          displayName: modelData.displayName,
          temperature: modelData.temperature,
          maxToolRounds: modelData.maxToolRounds,
          isDefault: modelData.isDefault,
          capabilities,
          enableToolsInThinking,
          customConfig: modelData.customConfig ?? {},
          createdAt: now,
          updatedAt: now,
        };

        // 若设置为默认模型，需清除同一供应商下其他模型的默认标记
        const normalizedModels = modelData.isDefault
          ? models.map((m) =>
              m.providerId === providerId
                ? { ...m, isDefault: false, updatedAt: now }
                : m,
            )
          : models;

        const updatedModels = [...normalizedModels, newModel];
        const updatedProviders = providers.map((item) =>
          item.id === providerId
            ? {
                ...item,
                models: Array.from(new Set([...item.models, newModel.id])),
                updatedAt: now,
              }
            : item,
        );

        await Promise.all([
          persistModels(storage, updatedModels),
          persistProviders(storage, updatedProviders),
        ]);

        dispatchSettingsUpdated("model");
        return newModel;
      });
    },
    [execute, loadModels, loadProviders, persistModels, persistProviders],
  );

  /**
   * 更新模型
   */
  const updateModel = useCallback(
    async (
      providerId: string,
      modelId: string,
      updates: UpdateModelInput,
    ): Promise<ModelConfig> => {
      return execute(async (storage) => {
        const [providers, models] = await Promise.all([
          loadProviders(storage),
          loadModels(storage),
        ]);

        const providerExists = providers.some(
          (provider) => provider.id === providerId,
        );
        if (!providerExists) {
          throw new Error(`供应商 ${providerId} 不存在，无法更新模型`);
        }

        const index = models.findIndex((model) => model.id === modelId);
        if (index === -1) {
          throw new Error(`模型 ${modelId} 不存在，无法更新`);
        }

        const current = models[index];
        if (current.providerId !== providerId) {
          throw new Error(
            `模型 ${modelId} 不属于供应商 ${providerId}，无法更新`,
          );
        }

        const mergedCustomConfig =
          updates.customConfig !== undefined
            ? { ...current.customConfig, ...updates.customConfig }
            : current.customConfig;

        const capabilities =
          updates.capabilities ??
          (updates.modelName && updates.modelName !== current.modelName
            ? getDefaultCapabilities(updates.modelName)
            : current.capabilities);

        const enableToolsInThinking =
          typeof updates.enableToolsInThinking === "boolean"
            ? updates.enableToolsInThinking
            : current.enableToolsInThinking;

        const updatedModel: ModelConfig = {
          ...current,
          ...updates,
          capabilities,
          enableToolsInThinking,
          customConfig: mergedCustomConfig,
          updatedAt: Date.now(),
        };

        let nextModels = [...models];
        nextModels[index] = updatedModel;

        // 若当前更新将模型设为默认，则取消同一供应商下其他模型的默认标记
        if (updates.isDefault === true && !current.isDefault) {
          nextModels = nextModels.map((m) =>
            m.providerId === providerId && m.id !== modelId
              ? { ...m, isDefault: false, updatedAt: Date.now() }
              : m,
          );
        }

        const updatedProviders = providers.map((provider) =>
          provider.id === providerId
            ? {
                ...provider,
                models: Array.from(new Set([...provider.models, modelId])),
                updatedAt: Date.now(),
              }
            : provider,
        );

        await Promise.all([
          persistModels(storage, nextModels),
          persistProviders(storage, updatedProviders),
        ]);
        dispatchSettingsUpdated("model");
        return updatedModel;
      });
    },
    [execute, loadModels, loadProviders, persistModels, persistProviders],
  );

  /**
   * 删除模型
   */
  const deleteModel = useCallback(
    async (providerId: string, modelId: string): Promise<void> => {
      await execute(async (storage) => {
        const [providers, models, activeModel] = await Promise.all([
          loadProviders(storage),
          loadModels(storage),
          loadActiveModel(storage),
        ]);

        const provider = providers.find((item) => item.id === providerId);
        if (!provider) {
          throw new Error(`供应商 ${providerId} 不存在，无法删除模型`);
        }

        const model = models.find((item) => item.id === modelId);
        if (!model) {
          throw new Error(`模型 ${modelId} 不存在，无法删除`);
        }

        if (model.providerId !== providerId) {
          throw new Error(
            `模型 ${modelId} 不属于供应商 ${providerId}，无法删除`,
          );
        }

        const now = Date.now();
        const remainingModels = models.filter((item) => item.id !== modelId);
        const updatedProviders = removeModelFromProviders(
          providers,
          providerId,
          modelId,
          now,
        );

        const shouldSwitchActive =
          activeModel?.modelId === modelId ||
          (activeModel &&
            !remainingModels.some((m) => m.id === activeModel.modelId));

        const nextActive = shouldSwitchActive
          ? pickFallbackActiveModel(
              updatedProviders,
              remainingModels,
              providerId,
            )
          : (activeModel ?? null);

        await Promise.all([
          persistModels(storage, remainingModels),
          persistProviders(storage, updatedProviders),
          persistActiveModel(storage, nextActive),
        ]);
        dispatchSettingsUpdated("model");
      });
    },
    [
      execute,
      loadActiveModel,
      loadModels,
      loadProviders,
      persistActiveModel,
      persistModels,
      persistProviders,
    ],
  );

  /**
   * 获取 Agent 设置
   */
  const getAgentSettings = useCallback(async (): Promise<AgentSettings> => {
    return execute(async (storage) => {
      const settings = await loadAgentSettings(storage);
      return settings;
    });
  }, [execute, loadAgentSettings]);

  /**
   * 保存 Agent 设置
   */
  const saveAgentSettings = useCallback(
    async (updates: Partial<AgentSettings>): Promise<AgentSettings> => {
      return execute(async (storage) => {
        const current = await loadAgentSettings(storage);
        const next: AgentSettings = {
          ...current,
          ...updates,
          skillSettings:
            updates.skillSettings ??
            current.skillSettings ??
            DEFAULT_SKILL_SETTINGS,
          updatedAt: Date.now(),
        };
        await persistAgentSettings(storage, next);
        dispatchSettingsUpdated("agent");
        return next;
      });
    },
    [execute, loadAgentSettings, persistAgentSettings],
  );

  /**
   * 获取 Skill 设置（便捷方法）
   */
  const getSkillSettings = useCallback(async (): Promise<SkillSettings> => {
    const settings = await getAgentSettings();
    return settings.skillSettings ?? DEFAULT_SKILL_SETTINGS;
  }, [getAgentSettings]);

  /**
   * 保存 Skill 设置（便捷方法）
   */
  const saveSkillSettings = useCallback(
    async (settings: SkillSettings): Promise<SkillSettings> => {
      const next = await saveAgentSettings({ skillSettings: settings });
      return next.skillSettings ?? DEFAULT_SKILL_SETTINGS;
    },
    [saveAgentSettings],
  );

  /**
   * 获取当前活动模型引用
   */
  const getActiveModel =
    useCallback(async (): Promise<ActiveModelReference | null> => {
      return execute(async (storage) => {
        const active = await loadActiveModel(storage);
        return active;
      });
    }, [execute, loadActiveModel]);

  /**
   * 设置当前活动模型
   */
  const setActiveModel = useCallback(
    async (
      providerId: string,
      modelId: string,
    ): Promise<ActiveModelReference> => {
      return execute(async (storage) => {
        const [providers, models] = await Promise.all([
          loadProviders(storage),
          loadModels(storage),
        ]);

        const providerExists = providers.some(
          (provider) => provider.id === providerId,
        );
        if (!providerExists) {
          throw new Error(`供应商 ${providerId} 不存在，无法设置活动模型`);
        }

        const model = models.find(
          (item) => item.id === modelId && item.providerId === providerId,
        );
        if (!model) {
          throw new Error(`模型 ${modelId} 不存在或不属于供应商 ${providerId}`);
        }

        const active: ActiveModelReference = {
          providerId,
          modelId,
          updatedAt: Date.now(),
        };
        await persistActiveModel(storage, active);
        dispatchSettingsUpdated("activeModel");
        return active;
      });
    },
    [execute, loadModels, loadProviders, persistActiveModel],
  );

  /**
   * 获取运行时合并配置（Provider + Model + Agent）
   * - 可选传入 providerId/modelId；未提供时使用当前活动模型
   * - 任一数据缺失返回 null
   * - 8 秒超时 + runStorageTask 保护
   */
  const getRuntimeConfig = useCallback(
    async (
      providerId?: string,
      modelId?: string,
    ): Promise<RuntimeLLMConfig | null> => {
      return execute(async (storage) => {
        const [providers, models, agentSettings, activeModel] =
          await Promise.all([
            loadProviders(storage),
            loadModels(storage),
            loadAgentSettings(storage),
            loadActiveModel(storage),
          ]);

        let resolvedProviderId = providerId ?? null;
        let resolvedModelId = modelId ?? null;

        // 如果仅提供了模型 ID，则反推 provider
        if (!resolvedProviderId && resolvedModelId) {
          const matchedModel = models.find(
            (item) => item.id === resolvedModelId,
          );
          resolvedProviderId = matchedModel?.providerId ?? null;
        }

        // 未指定 provider 时，使用当前活动模型
        if (!resolvedProviderId && activeModel) {
          resolvedProviderId = activeModel.providerId;
        }

        // 仍未解析到 provider，尝试从默认/首个模型推断
        if (!resolvedProviderId) {
          const fallback = pickFallbackActiveModel(providers, models);
          if (fallback) {
            resolvedProviderId = fallback.providerId;
            resolvedModelId = resolvedModelId ?? fallback.modelId;
          }
        }

        // 未指定模型时，优先选择该 provider 的默认模型
        if (!resolvedModelId && resolvedProviderId) {
          const modelsOfProvider = models.filter(
            (item) => item.providerId === resolvedProviderId,
          );

          if (modelsOfProvider.length > 0) {
            const preferred =
              modelsOfProvider.find((item) => item.isDefault) ??
              modelsOfProvider[0];
            resolvedModelId = preferred.id;
          }
        }

        if (!resolvedProviderId || !resolvedModelId) {
          logger.warn(
            "[useStorageSettings] getRuntimeConfig 无法解析目标模型",
            { providerId, modelId },
          );
          return null;
        }

        const provider = providers.find(
          (item) => item.id === resolvedProviderId,
        );
        const model = models.find(
          (item) =>
            item.id === resolvedModelId &&
            item.providerId === resolvedProviderId,
        );

        if (!provider || !model) {
          logger.warn(
            "[useStorageSettings] getRuntimeConfig 找不到 provider/model",
            { providerId: resolvedProviderId, modelId: resolvedModelId },
          );
          return null;
        }

        const capabilities =
          model.capabilities ?? getDefaultCapabilities(model.modelName);

        const mergedConfig: RuntimeLLMConfig = {
          apiUrl: provider.apiUrl,
          apiKey: provider.apiKey,
          providerType: provider.providerType,
          modelName: model.modelName,
          temperature: model.temperature,
          maxToolRounds: model.maxToolRounds,
          capabilities,
          enableToolsInThinking:
            typeof model.enableToolsInThinking === "boolean"
              ? model.enableToolsInThinking
              : capabilities.supportsThinking,
          systemPrompt:
            agentSettings.systemPrompt ?? DEFAULT_AGENT_SETTINGS.systemPrompt,
          skillSettings: agentSettings.skillSettings,
          customConfig: {
            ...provider.customConfig,
            ...model.customConfig,
          },
        };

        return normalizeLLMConfig(mergedConfig);
      });
    },
    [execute, loadActiveModel, loadAgentSettings, loadModels, loadProviders],
  );

  // 初始化时检查存储可用性
  useEffect(() => {
    void runStorageTask(
      async () => {
        await withStorageTimeout(getStorage());
      },
      { setLoading, setError },
    );
  }, []);

  return {
    loading,
    error,
    subscribeSettingsUpdates,
    getSetting,
    setSetting,
    getAllSettings,
    getGeneralSettings,
    saveGeneralSettings,
    updateGeneralSettings,
    getDefaultPath,
    saveDefaultPath,
    getProviders,
    getModels,
    saveProviders,
    addProvider,
    updateProvider,
    deleteProvider,
    addModel,
    updateModel,
    deleteModel,
    getAgentSettings,
    saveAgentSettings,
    getSkillSettings,
    saveSkillSettings,
    getActiveModel,
    setActiveModel,
    getRuntimeConfig,
  };
}
