"use client";

import { useState, useEffect, useCallback } from "react";
import { getStorage } from "@/app/lib/storage";
import type {
  ActiveModelReference,
  AgentSettings,
  LLMConfig,
  ModelCapabilities,
  ModelConfig,
  RuntimeLLMConfig,
  ProviderConfig,
} from "@/app/types/chat";
import {
  DEFAULT_AGENT_SETTINGS,
  STORAGE_KEY_ACTIVE_MODEL,
  STORAGE_KEY_AGENT_SETTINGS,
  STORAGE_KEY_LLM_MODELS,
  STORAGE_KEY_LLM_PROVIDERS,
  initializeDefaultLLMConfig,
  normalizeLLMConfig,
} from "@/app/lib/config-utils";
import { getDefaultCapabilities } from "@/app/lib/model-capabilities";
import { createLogger } from "@/app/lib/logger";
import { generateUUID, runStorageTask, withTimeout } from "@/app/lib/utils";

const logger = createLogger("useStorageSettings");
const STORAGE_TIMEOUT_MS = 8000;
const STORAGE_TIMEOUT_MESSAGE = "[LLM] 存储操作超时（8秒）";

type SettingsUpdatedType = "provider" | "model" | "agent" | "activeModel";
type SettingsUpdatedDetail = { type: SettingsUpdatedType };

const withStorageTimeout = <T>(
  promise: Promise<T>,
  message: string = STORAGE_TIMEOUT_MESSAGE,
) => withTimeout(promise, STORAGE_TIMEOUT_MS, message);

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
    () => withStorageTimeout(getStorage()),
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
          console.warn(
            "[useStorageSettings] settings subscriber failed",
            error,
          );
        }
      };

      window.addEventListener("settings-updated", handler);
      return () => window.removeEventListener("settings-updated", handler);
    },
    [],
  );

  const loadProviders = useCallback(
    async (storage: StorageInstance): Promise<ProviderConfig[]> => {
      let raw = await withStorageTimeout(
        storage.getSetting(STORAGE_KEY_LLM_PROVIDERS),
      );

      if (raw === null) {
        logger.warn(
          "[useStorageSettings] 未找到 LLM providers，尝试初始化默认配置",
        );
        await initializeDefaultLLMConfig(storage);
        raw = await withStorageTimeout(
          storage.getSetting(STORAGE_KEY_LLM_PROVIDERS),
        );
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
      let raw = await withStorageTimeout(
        storage.getSetting(STORAGE_KEY_LLM_MODELS),
      );

      if (raw === null) {
        logger.warn(
          "[useStorageSettings] 未找到 LLM models，尝试初始化默认配置",
        );
        await initializeDefaultLLMConfig(storage);
        raw = await withStorageTimeout(
          storage.getSetting(STORAGE_KEY_LLM_MODELS),
        );
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
      return parsed;
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
   * 获取默认路径
   */
  const getDefaultPath = useCallback(async (): Promise<string | null> => {
    return execute((storage) =>
      withStorageTimeout(storage.getSetting("defaultPath")),
    );
  }, [execute]);

  /**
   * 保存默认路径
   */
  const saveDefaultPath = useCallback(
    async (path: string): Promise<void> => {
      await execute((storage) =>
        withStorageTimeout(storage.setSetting("defaultPath", path)),
      );
    },
    [execute],
  );

  /**
   * 获取供应商列表
   */
  const getProviders = useCallback(async (): Promise<ProviderConfig[]> => {
    return execute(async (storage) => {
      const providers = await loadProviders(storage);
      logger.info(
        "[useStorageSettings] getProviders loaded %d provider(s)",
        providers.length,
      );
      return providers;
    });
  }, [execute, loadProviders]);

  /**
   * 获取模型列表
   */
  const getModels = useCallback(async (): Promise<ModelConfig[]> => {
    return execute(async (storage) => {
      const models = await loadModels(storage);
      logger.info(
        "[useStorageSettings] getModels loaded %d model(s)",
        models.length,
      );
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
        logger.info(
          "[useStorageSettings] saveProviders saved %d provider(s)",
          providers.length,
        );
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
        logger.info(
          "[useStorageSettings] addProvider %s (%s)",
          newProvider.displayName,
          newProvider.id,
        );
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
        logger.info(
          "[useStorageSettings] updateProvider %s succeeded",
          providerId,
        );
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

        const sanitizedProviders = remainingProviders.map((item) => ({
          ...item,
          models: item.models.filter((modelId) =>
            remainingModels.some((model) => model.id === modelId),
          ),
        }));

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

        logger.info(
          "[useStorageSettings] deleteProvider %s, models removed %d, active -> %s",
          providerId,
          models.length - remainingModels.length,
          nextActive
            ? `${nextActive.providerId}/${nextActive.modelId}`
            : "null",
        );
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

        const updatedModels = [...models, newModel];
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

        logger.info(
          "[useStorageSettings] addModel %s/%s (%s)",
          providerId,
          newModel.modelName,
          newModel.id,
        );
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

        models[index] = updatedModel;

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
          persistModels(storage, models),
          persistProviders(storage, updatedProviders),
        ]);

        logger.info(
          "[useStorageSettings] updateModel %s/%s 完成",
          providerId,
          modelId,
        );
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

        const remainingModels = models.filter((item) => item.id !== modelId);
        const updatedProviders = providers.map((item) =>
          item.id === providerId
            ? {
                ...item,
                models: item.models.filter((id) => id !== modelId),
                updatedAt: Date.now(),
              }
            : item,
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

        logger.info(
          "[useStorageSettings] deleteModel %s/%s, active -> %s",
          providerId,
          modelId,
          nextActive
            ? `${nextActive.providerId}/${nextActive.modelId}`
            : "null",
        );
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
      logger.info("[useStorageSettings] getAgentSettings loaded");
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
          updatedAt: Date.now(),
        };
        await persistAgentSettings(storage, next);
        logger.info("[useStorageSettings] saveAgentSettings 更新成功");
        dispatchSettingsUpdated("agent");
        return next;
      });
    },
    [execute, loadAgentSettings, persistAgentSettings],
  );

  /**
   * 获取当前活动模型引用
   */
  const getActiveModel =
    useCallback(async (): Promise<ActiveModelReference | null> => {
      return execute(async (storage) => {
        const active = await loadActiveModel(storage);
        logger.info(
          "[useStorageSettings] getActiveModel -> %s",
          active ? `${active.providerId}/${active.modelId}` : "null",
        );
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
        logger.info(
          "[useStorageSettings] setActiveModel -> %s/%s",
          providerId,
          modelId,
        );
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

  /**
   * @deprecated 请使用 getRuntimeConfig；此方法仅为兼容旧调用
   */
  const getLLMConfig = useCallback(async (): Promise<LLMConfig | null> => {
    const runtimeConfig = await getRuntimeConfig();
    return runtimeConfig ? normalizeLLMConfig(runtimeConfig) : null;
  }, [getRuntimeConfig]);

  /**
   * @deprecated 请使用 provider/model/agent 级别接口；内部会同步到新存储结构
   */
  const saveLLMConfig = useCallback(
    async (config: Partial<LLMConfig>): Promise<void> => {
      const normalized = normalizeLLMConfig(config);

      await execute(async (storage) => {
        let [providers, models, agentSettings, activeModel] = await Promise.all(
          [
            loadProviders(storage),
            loadModels(storage),
            loadAgentSettings(storage),
            loadActiveModel(storage),
          ],
        );

        if (providers.length === 0 || models.length === 0) {
          await initializeDefaultLLMConfig(storage);
          [providers, models, agentSettings, activeModel] = await Promise.all([
            loadProviders(storage),
            loadModels(storage),
            loadAgentSettings(storage),
            loadActiveModel(storage),
          ]);
        }

        const fallbackActive = pickFallbackActiveModel(providers, models);
        const targetProviderId =
          activeModel?.providerId ??
          fallbackActive?.providerId ??
          providers[0]?.id ??
          null;

        if (!targetProviderId) {
          throw new Error(
            "[useStorageSettings] saveLLMConfig 无法解析目标供应商",
          );
        }

        const now = Date.now();
        const providerIndex = providers.findIndex(
          (item) => item.id === targetProviderId,
        );
        const currentProvider =
          providerIndex >= 0 ? providers[providerIndex] : null;

        if (!currentProvider) {
          throw new Error(
            `[useStorageSettings] saveLLMConfig 未找到供应商 ${targetProviderId}`,
          );
        }

        const modelsOfProvider = models.filter(
          (item) => item.providerId === targetProviderId,
        );

        let targetModel =
          modelsOfProvider.find(
            (item) => activeModel?.modelId && item.id === activeModel.modelId,
          ) ??
          modelsOfProvider[0] ??
          null;

        if (!targetModel) {
          targetModel = {
            id: generateUUID("model"),
            providerId: targetProviderId,
            modelName: normalized.modelName,
            displayName: normalized.modelName,
            temperature: normalized.temperature,
            maxToolRounds: normalized.maxToolRounds,
            isDefault: true,
            capabilities: normalized.capabilities,
            enableToolsInThinking: normalized.enableToolsInThinking,
            customConfig: { ...normalized.customConfig },
            createdAt: now,
            updatedAt: now,
          };
          models.push(targetModel);
        } else {
          targetModel = {
            ...targetModel,
            modelName: normalized.modelName,
            displayName: targetModel.displayName || normalized.modelName,
            temperature: normalized.temperature,
            maxToolRounds: normalized.maxToolRounds,
            capabilities: normalized.capabilities,
            enableToolsInThinking: normalized.enableToolsInThinking,
            customConfig: {
              ...targetModel.customConfig,
              ...normalized.customConfig,
            },
            updatedAt: now,
          };
          models = models.map((item) =>
            item.id === targetModel.id ? targetModel : item,
          );
        }

        const providerModels = new Set(currentProvider.models);
        providerModels.add(targetModel.id);

        const updatedProvider: ProviderConfig = {
          ...currentProvider,
          providerType: normalized.providerType,
          apiUrl: normalized.apiUrl,
          apiKey: normalized.apiKey,
          customConfig: {
            ...currentProvider.customConfig,
            ...normalized.customConfig,
          },
          models: Array.from(providerModels),
          updatedAt: now,
        };
        providers[providerIndex] = updatedProvider;

        const updatedAgentSettings: AgentSettings = {
          ...agentSettings,
          systemPrompt: normalized.systemPrompt,
          updatedAt: now,
        };

        const activeReference: ActiveModelReference = {
          providerId: updatedProvider.id,
          modelId: targetModel.id,
          updatedAt: now,
        };

        await Promise.all([
          persistProviders(storage, providers),
          persistModels(storage, models),
          persistAgentSettings(storage, updatedAgentSettings),
          persistActiveModel(storage, activeReference),
          (async () => {
            try {
              await withStorageTimeout(storage.deleteSetting("llmConfig"));
            } catch (cleanupError) {
              logger.warn(
                "[useStorageSettings] 清理旧 llmConfig 失败",
                cleanupError,
              );
            }
          })(),
        ]);

        dispatchSettingsUpdated("provider");
        dispatchSettingsUpdated("model");
        dispatchSettingsUpdated("agent");
        dispatchSettingsUpdated("activeModel");
      });
    },
    [
      execute,
      loadActiveModel,
      loadAgentSettings,
      loadModels,
      loadProviders,
      persistActiveModel,
      persistAgentSettings,
      persistModels,
      persistProviders,
    ],
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
    getLLMConfig,
    saveLLMConfig,
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
    getActiveModel,
    setActiveModel,
    getRuntimeConfig,
  };
}
