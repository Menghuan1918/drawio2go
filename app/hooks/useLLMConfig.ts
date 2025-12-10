"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/app/i18n/hooks";
import type {
  ActiveModelReference,
  LLMConfig,
  ModelConfig,
  ProviderConfig,
} from "@/app/types/chat";
import { DEFAULT_LLM_CONFIG, normalizeLLMConfig } from "@/app/lib/config-utils";
import { useStorageSettings } from "./useStorageSettings";
import { useOperationToast } from "./useOperationToast";

interface LoadOptions {
  preserveSelection?: boolean;
}

interface UseLLMConfigResult {
  llmConfig: LLMConfig | null;
  configLoading: boolean;
  selectorLoading: boolean;
  providers: ProviderConfig[];
  models: ModelConfig[];
  selectedModelId: string | null;
  selectedModelLabel: string;
  loadModelSelector: (options?: LoadOptions) => Promise<void>;
  handleModelChange: (modelId: string) => Promise<void>;
}

const resolveModelSelection = (
  providerList: ProviderConfig[],
  modelList: ModelConfig[],
  activeModel: ActiveModelReference | null,
  currentModelId?: string | null,
): { providerId: string | null; modelId: string | null } => {
  if (activeModel) {
    const activeProviderExists = providerList.some(
      (provider) => provider.id === activeModel.providerId,
    );
    const activeModelMatch = modelList.find(
      (model) =>
        model.id === activeModel.modelId &&
        model.providerId === activeModel.providerId,
    );

    if (activeProviderExists && activeModelMatch) {
      return {
        providerId: activeModel.providerId,
        modelId: activeModel.modelId,
      };
    }
  }

  if (currentModelId) {
    const currentModel = modelList.find((model) => model.id === currentModelId);
    if (currentModel) {
      return {
        providerId: currentModel.providerId,
        modelId: currentModel.id,
      };
    }
  }

  const fallbackModel =
    modelList.find((model) => model.isDefault) ?? modelList[0];

  return {
    providerId: fallbackModel?.providerId ?? null,
    modelId: fallbackModel?.id ?? null,
  };
};

export function useLLMConfig(): UseLLMConfigResult {
  const { t } = useI18n();
  const { pushErrorToast } = useOperationToast();
  const {
    getActiveModel,
    getProviders,
    getModels,
    setActiveModel,
    getRuntimeConfig,
    subscribeSettingsUpdates,
  } = useStorageSettings();

  const [llmConfig, setLlmConfig] = useState<LLMConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [selectorLoading, setSelectorLoading] = useState(true);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const requestIdRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadModelSelector = useCallback(
    async (options?: LoadOptions) => {
      const currentRequestId = ++requestIdRef.current;
      const preserveSelection = options?.preserveSelection ?? false;

      setSelectorLoading(true);
      setConfigLoading(true);

      try {
        const [providerList, modelList, activeModel] = await Promise.all([
          getProviders(),
          getModels(),
          getActiveModel(),
        ]);

        setProviders(providerList);
        setModels(modelList);

        const { providerId, modelId } = resolveModelSelection(
          providerList,
          modelList,
          activeModel,
          preserveSelection ? selectedModelId : null,
        );

        setSelectedModelId(modelId);

        // 如果存储里还没有活动模型，但已经解析出可用的 provider/model，则立即写回，避免后续读取为 null
        if (
          providerId &&
          modelId &&
          (!activeModel ||
            activeModel.providerId !== providerId ||
            activeModel.modelId !== modelId)
        ) {
          try {
            await setActiveModel(providerId, modelId);
          } catch {
            // ignore write-back error, 保持后续流程继续使用内存态
          }
        }

        if (providerId && modelId) {
          const runtimeConfig = await getRuntimeConfig(providerId, modelId);

          setLlmConfig(
            runtimeConfig
              ? normalizeLLMConfig(runtimeConfig)
              : { ...DEFAULT_LLM_CONFIG },
          );
        } else {
          setLlmConfig({ ...DEFAULT_LLM_CONFIG });
        }
      } catch {
        if (currentRequestId === requestIdRef.current && isMountedRef.current) {
          // 不中断流程，使用上一次的 llmConfig 或默认值
          setLlmConfig((prev) => prev ?? { ...DEFAULT_LLM_CONFIG });
        }
      } finally {
        setSelectorLoading(false);
        setConfigLoading(false);
      }
    },
    [
      getActiveModel,
      getModels,
      getProviders,
      getRuntimeConfig,
      setActiveModel,
      selectedModelId,
    ],
  );

  useEffect(() => {
    const unsubscribe = subscribeSettingsUpdates((detail) => {
      if (
        detail.type === "provider" ||
        detail.type === "model" ||
        detail.type === "activeModel"
      ) {
        void loadModelSelector({ preserveSelection: true });
      }
    });

    return unsubscribe;
  }, [loadModelSelector, subscribeSettingsUpdates]);

  const handleModelChange = useCallback(
    async (modelId: string) => {
      const currentRequestId = ++requestIdRef.current;
      if (!modelId) return;

      const previousModelId = selectedModelId;
      const previousConfig = llmConfig;
      const targetModel = models.find((model) => model.id === modelId);
      const providerId = targetModel?.providerId ?? null;

      setSelectedModelId(modelId);

      if (!providerId) {
        pushErrorToast(
          t("chat:messages.providerMissing", "未找到该模型的供应商"),
        );
        return;
      }

      setSelectorLoading(true);
      setConfigLoading(true);

      try {
        await setActiveModel(providerId, modelId);

        if (currentRequestId !== requestIdRef.current || !isMountedRef.current)
          return;

        const runtimeConfig = await getRuntimeConfig(providerId, modelId);

        if (currentRequestId !== requestIdRef.current || !isMountedRef.current)
          return;

        setLlmConfig(
          runtimeConfig
            ? normalizeLLMConfig(runtimeConfig)
            : { ...DEFAULT_LLM_CONFIG },
        );
      } catch {
        // 只有最新请求的错误才显示给用户
        if (currentRequestId === requestIdRef.current && isMountedRef.current) {
          pushErrorToast(
            t("chat:messages.modelSwitchFailed", "模型切换失败，请稍后重试"),
          );

          setSelectedModelId(previousModelId);

          if (previousConfig) {
            setLlmConfig(previousConfig);
          } else if (previousModelId) {
            const previousProviderId =
              models.find((model) => model.id === previousModelId)
                ?.providerId ?? null;

            if (previousProviderId) {
              try {
                const rollbackConfig = await getRuntimeConfig(
                  previousProviderId,
                  previousModelId,
                );

                if (
                  currentRequestId !== requestIdRef.current ||
                  !isMountedRef.current
                )
                  return;

                setLlmConfig(
                  rollbackConfig
                    ? normalizeLLMConfig(rollbackConfig)
                    : { ...DEFAULT_LLM_CONFIG },
                );
              } catch {
                setLlmConfig((prev) => prev ?? { ...DEFAULT_LLM_CONFIG });
              }
            } else {
              setLlmConfig((prev) => prev ?? { ...DEFAULT_LLM_CONFIG });
            }
          } else {
            setLlmConfig((prev) => prev ?? { ...DEFAULT_LLM_CONFIG });
          }
        }
      } finally {
        if (currentRequestId === requestIdRef.current && isMountedRef.current) {
          setSelectorLoading(false);
          setConfigLoading(false);
        }
      }
    },
    [
      getRuntimeConfig,
      llmConfig,
      models,
      pushErrorToast,
      selectedModelId,
      setActiveModel,
      t,
    ],
  );

  const selectedModelLabel = useMemo(() => {
    const matchedModel = models.find((model) => model.id === selectedModelId);
    if (matchedModel) {
      return matchedModel.displayName || matchedModel.modelName;
    }
    if (llmConfig?.modelName) return llmConfig.modelName;
    return t("chat:modelSelector.label");
  }, [llmConfig, models, selectedModelId, t]);

  return {
    llmConfig,
    configLoading,
    selectorLoading,
    providers,
    models,
    selectedModelId,
    selectedModelLabel,
    loadModelSelector,
    handleModelChange,
  };
}
