"use client";

import { useCallback, useMemo, useState } from "react";
import { Accordion, Button, Card, Chip, ListBox, Popover } from "@heroui/react";
import {
  Brain,
  Edit,
  Eye,
  MoreVertical,
  Plus,
  Star,
  Trash2,
  Wrench,
} from "lucide-react";

import { useAppTranslation } from "@/app/i18n/hooks";
import { useStorageSettings } from "@/app/hooks/useStorageSettings";
import { useToast } from "@/app/components/toast";
import ProviderEditDialog from "./ProviderEditDialog";
import ModelEditDialog from "./ModelEditDialog";
import ConfirmDialog from "@/app/components/common/ConfirmDialog";
import ModelIcon from "@/app/components/common/ModelIcon";
import type {
  ActiveModelReference,
  ModelConfig,
  ProviderConfig,
} from "@/app/types/chat";
import { createLogger } from "@/lib/logger";

interface ModelsSettingsPanelProps {
  providers: ProviderConfig[];
  models: ModelConfig[];
  activeModel: ActiveModelReference | null;
  onProvidersChange: (providers: ProviderConfig[]) => void;
  onModelsChange: (models: ModelConfig[]) => void;
  onActiveModelChange: (activeModel: ActiveModelReference | null) => void;
}

const logger = createLogger("ModelsSettingsPanel");

type ModelDialogState = {
  isOpen: boolean;
  providerId: string | null;
  model: ModelConfig | null;
};

type DeleteModelState = {
  isOpen: boolean;
  providerId: string | null;
  model: ModelConfig | null;
};

type DeleteProviderState = {
  isOpen: boolean;
  provider: ProviderConfig | null;
};

/**
 * 模型供应商管理面板（Accordion 展示）
 * - 展示供应商列表与模型预览
 * - 支持删除供应商（级联删除模型，并处理活动模型切换）
 * - 编辑/新增供应商功能占位，后续由 ProviderEditDialog 接入
 */
export default function ModelsSettingsPanel({
  providers,
  models,
  activeModel,
  onProvidersChange,
  onModelsChange,
  onActiveModelChange,
}: ModelsSettingsPanelProps) {
  const { t } = useAppTranslation("settings");
  const { push } = useToast();
  const {
    deleteProvider,
    deleteModel,
    getProviders,
    getModels,
    getActiveModel,
    updateModel,
  } = useStorageSettings();

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderConfig | null>(
    null,
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [modelDialogState, setModelDialogState] = useState<ModelDialogState>({
    isOpen: false,
    providerId: null,
    model: null,
  });
  const [deleteModelState, setDeleteModelState] = useState<DeleteModelState>({
    isOpen: false,
    providerId: null,
    model: null,
  });
  const [deleteProviderState, setDeleteProviderState] =
    useState<DeleteProviderState>({
      isOpen: false,
      provider: null,
    });
  const [modelDeletingId, setModelDeletingId] = useState<string | null>(null);

  const showToast = useCallback(
    (variant: Parameters<typeof push>[0]["variant"], description: string) => {
      push({ variant, description });
    },
    [push],
  );

  const refreshSettings = useCallback(async () => {
    const [newProviders, newModels, newActiveModel] = await Promise.all([
      getProviders(),
      getModels(),
      getActiveModel(),
    ]);

    onProvidersChange(newProviders);
    onModelsChange(newModels);
    onActiveModelChange(newActiveModel);

    return { newProviders, newModels, newActiveModel };
  }, [
    getActiveModel,
    getModels,
    getProviders,
    onActiveModelChange,
    onModelsChange,
    onProvidersChange,
  ]);

  const modelsMap = useMemo(() => {
    const map = new Map<string, ModelConfig[]>();
    models.forEach((model) => {
      const list = map.get(model.providerId) ?? [];
      list.push(model);
      map.set(model.providerId, list);
    });
    return map;
  }, [models]);

  const handleAddProvider = useCallback(() => {
    setEditingProvider(null);
    setIsEditDialogOpen(true);
  }, []);

  const handleEditProvider = useCallback((provider: ProviderConfig) => {
    setEditingProvider(provider);
    setIsEditDialogOpen(true);
  }, []);

  const handleCloseDialog = useCallback(() => {
    setIsEditDialogOpen(false);
    setEditingProvider(null);
  }, []);

  const handleSaveProvider = useCallback(
    async (_savedProvider: ProviderConfig) => {
      try {
        await refreshSettings();
      } catch (error) {
        logger.error("刷新供应商列表失败", { error });
      }
    },
    [refreshSettings],
  );

  const handleDeleteProvider = useCallback(
    async (provider: ProviderConfig) => {
      setDeletingId(provider.id);

      try {
        const isActive = activeModel?.providerId === provider.id;

        await deleteProvider(provider.id);

        const { newModels, newActiveModel } = await refreshSettings();

        const newActiveModelConfig = newActiveModel
          ? newModels.find((model) => model.id === newActiveModel.modelId)
          : undefined;

        if (isActive && newActiveModel) {
          showToast(
            "success",
            t("models.delete.successWithSwitch", {
              name: provider.displayName,
              newModel: newActiveModelConfig?.displayName ?? "Unknown",
            }),
          );
        } else if (isActive && !newActiveModel) {
          showToast(
            "warning",
            t("models.delete.successNoActiveModel", {
              name: provider.displayName,
              defaultValue: "供应商已删除，没有可用的活动模型，请先创建模型。",
            }),
          );
        } else {
          showToast(
            "success",
            t("models.delete.success", { name: provider.displayName }),
          );
        }
      } catch (error) {
        logger.error("[ModelsSettingsPanel] 删除供应商失败", error);
        showToast("danger", t("models.delete.error"));
      } finally {
        setDeletingId(null);
        setDeleteProviderState({ isOpen: false, provider: null });
      }
    },
    [activeModel, deleteProvider, refreshSettings, showToast, t],
  );

  const handleAddModel = useCallback((providerId: string) => {
    setModelDialogState({ isOpen: true, providerId, model: null });
  }, []);

  const handleEditModel = useCallback((model: ModelConfig) => {
    setModelDialogState({
      isOpen: true,
      providerId: model.providerId,
      model,
    });
  }, []);

  const handleModelDialogOpenChange = useCallback((open: boolean) => {
    setModelDialogState((prev) => ({
      isOpen: open,
      providerId: open ? prev.providerId : null,
      model: open ? prev.model : null,
    }));
  }, []);

  const handleModelSaved = useCallback(async () => {
    await refreshSettings();
  }, [refreshSettings]);

  const handleDeleteModel = useCallback(
    (providerId: string, model: ModelConfig) => {
      setDeleteModelState({
        isOpen: true,
        providerId,
        model,
      });
    },
    [],
  );

  const handleConfirmDeleteModel = useCallback(async () => {
    if (!deleteModelState.providerId || !deleteModelState.model) return;

    const targetModel = deleteModelState.model;
    const providerId = deleteModelState.providerId;
    setModelDeletingId(targetModel.id);

    try {
      await deleteModel(providerId, targetModel.id);
      await refreshSettings();
      showToast(
        "success",
        t("models.deleteModel.success", {
          name: targetModel.displayName || targetModel.modelName,
          defaultValue: "模型已删除",
        }),
      );
    } catch (error) {
      logger.error("[ModelsSettingsPanel] 删除模型失败", error);
      showToast(
        "danger",
        t("models.deleteModel.error", "删除模型失败，请稍后重试"),
      );
    } finally {
      setModelDeletingId(null);
      setDeleteModelState({ isOpen: false, providerId: null, model: null });
    }
  }, [
    deleteModel,
    deleteModelState.model,
    deleteModelState.providerId,
    refreshSettings,
    showToast,
    t,
  ]);

  const handleSetDefaultModel = useCallback(
    async (providerId: string, model: ModelConfig) => {
      try {
        const siblings = models.filter(
          (item) => item.providerId === providerId && item.id !== model.id,
        );

        await Promise.all([
          updateModel(providerId, model.id, { isDefault: true }),
          ...siblings
            .filter((item) => item.isDefault)
            .map((item) =>
              updateModel(item.providerId, item.id, { isDefault: false }),
            ),
        ]);

        await refreshSettings();
        showToast(
          "success",
          t("models.setDefault.success", {
            name: model.displayName || model.modelName,
            defaultValue: "已设为默认模型",
          }),
        );
      } catch (error) {
        logger.error("[ModelsSettingsPanel] 设置默认模型失败", error);
        showToast(
          "danger",
          t("models.setDefault.error", "设置默认模型失败，请稍后重试"),
        );
      }
    },
    [models, refreshSettings, showToast, t, updateModel],
  );

  return (
    <div className="settings-panel">
      <h3 className="section-title">{t("nav.models")}</h3>
      <p className="section-description">
        {t("llm.description", "Manage model providers and models")}
      </p>

      {providers.length === 0 && (
        <div className="mt-4 rounded-lg border border-default-200 bg-content1 px-6 py-4 text-center">
          <p className="text-base font-medium text-foreground">
            {t("models.emptyState.title")}
          </p>
          <p className="mt-2 text-sm text-default-500">
            {t("models.emptyState.description")}
          </p>
        </div>
      )}

      {providers.length > 0 && (
        <Accordion
          variant="surface"
          className="mt-4 flex w-full max-w-[760px] flex-col gap-2 rounded-2xl border border-default-200 bg-content1 p-2"
        >
          {providers.map((provider) => {
            const providerModels = modelsMap.get(provider.id) ?? [];
            const isDeleting = deletingId === provider.id;

            return (
              <Accordion.Item
                key={provider.id}
                className="rounded-xl border border-default-200 bg-content1"
              >
                <Accordion.Heading className="px-2">
                  <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-2">
                    <Accordion.Trigger className="flex flex-1 items-center justify-between gap-2 text-left">
                      <div className="flex items-center gap-2">
                        <ModelIcon
                          size={18}
                          providerId={provider.id}
                          providerType={provider.providerType}
                          className="text-primary"
                        />
                        <span className="text-base font-medium text-foreground">
                          {provider.displayName}
                        </span>
                        <Chip
                          size="sm"
                          variant="secondary"
                          color="accent"
                          className="text-xs"
                        >
                          {t("models.modelsList.title")} (
                          {providerModels.length})
                        </Chip>
                      </div>
                      <Accordion.Indicator />
                    </Accordion.Trigger>

                    <Popover>
                      <Popover.Trigger className="flex items-center">
                        <Button
                          variant="tertiary"
                          size="sm"
                          isIconOnly
                          isDisabled={isDeleting}
                          aria-label={t("models.actions.edit")}
                          onPress={(event) => {
                            const pressEvent = event as unknown as {
                              stopPropagation?: () => void;
                            };
                            pressEvent.stopPropagation?.();
                          }}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </Popover.Trigger>
                      <Popover.Content className="min-w-[160px] rounded-xl border border-default-200 bg-content1 p-1 shadow-2xl">
                        <ListBox
                          aria-label="provider-actions"
                          selectionMode="single"
                          onAction={(key) => {
                            if (key === "edit") {
                              handleEditProvider(provider);
                            } else if (key === "delete") {
                              setDeleteProviderState({
                                isOpen: true,
                                provider,
                              });
                            }
                          }}
                        >
                          <ListBox.Item
                            id="edit"
                            key="edit"
                            textValue="edit"
                            className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-primary-50"
                            isDisabled={isDeleting}
                          >
                            <Edit className="h-4 w-4" />
                            {t("models.actions.edit")}
                          </ListBox.Item>
                          <ListBox.Item
                            id="delete"
                            key="delete"
                            textValue="delete"
                            className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger-50"
                            isDisabled={isDeleting}
                          >
                            <Trash2 className="h-4 w-4" />
                            {t("models.actions.delete")}
                          </ListBox.Item>
                        </ListBox>
                      </Popover.Content>
                    </Popover>
                  </div>
                </Accordion.Heading>

                <Accordion.Panel className="px-2 pb-3">
                  <Accordion.Body>
                    <div className="rounded-lg border border-default-200 bg-content1 px-3 py-2">
                      <div className="flex flex-col gap-1.5 text-sm text-foreground">
                        <div className="grid grid-cols-[minmax(96px,0.3fr)_minmax(0,1fr)] items-start gap-2 sm:flex sm:items-center sm:gap-2">
                          <span className="text-default-500 sm:w-24 sm:flex-shrink-0">
                            {t("models.provider.type")}
                          </span>
                          <span className="font-medium min-w-0 break-words">
                            {provider.providerType}
                          </span>
                        </div>
                        <div className="grid grid-cols-[minmax(96px,0.3fr)_minmax(0,1fr)] items-start gap-2 sm:flex sm:items-center sm:gap-2">
                          <span className="text-default-500 sm:w-24 sm:flex-shrink-0">
                            {t("models.provider.apiUrl")}
                          </span>
                          <span className="font-medium min-w-0 break-all">
                            {provider.apiUrl || "—"}
                          </span>
                        </div>
                        <div className="grid grid-cols-[minmax(96px,0.3fr)_minmax(0,1fr)] items-start gap-2 sm:flex sm:items-center sm:gap-2">
                          <span className="text-default-500 sm:w-24 sm:flex-shrink-0">
                            {t("models.provider.apiKey")}
                          </span>
                          <span className="font-medium min-w-0 break-words">
                            {provider.apiKey
                              ? "••••••"
                              : t("models.provider.noApiKey")}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-col gap-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-sm font-semibold text-foreground">
                            {t("models.modelsList.title")} (
                            {providerModels.length})
                          </h4>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onPress={() => handleAddModel(provider.id)}
                        >
                          <Plus className="h-4 w-4" />
                          {t("models.addModel", "添加模型")}
                        </Button>
                      </div>

                      {providerModels.length === 0 ? (
                        <div className="flex flex-col gap-1 rounded-lg border border-dashed border-default-200 bg-content2 px-3 py-2 text-sm text-default-500">
                          <span>
                            {t("models.modelsList.empty", "暂无模型配置")}
                          </span>
                          <span className="text-xs text-default-500">
                            {t(
                              "models.modelsList.emptyWithAction",
                              "该供应商还没有模型，点击添加按钮创建模型",
                            )}
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {providerModels.map((model) => {
                            const modelDisplayName =
                              model.displayName || model.modelName;
                            const isActiveModel =
                              activeModel?.modelId === model.id;
                            const isModelOperating =
                              modelDeletingId === model.id || isDeleting;
                            const unlimitedRounds =
                              model.maxToolRounds === 999
                                ? t("models.unlimited", "无限制")
                                : model.maxToolRounds;

                            return (
                              <Card.Root
                                key={model.id}
                                className="border border-default-200 bg-content1"
                              >
                                <Card.Content className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                                  <div className="flex flex-col gap-1.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <ModelIcon
                                        size={18}
                                        modelId={model.id}
                                        modelName={modelDisplayName}
                                        providerId={provider.id}
                                        providerType={provider.providerType}
                                        className="text-primary"
                                      />
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="text-sm font-semibold text-foreground">
                                          {modelDisplayName}
                                        </span>
                                        {[
                                          {
                                            key: "thinking",
                                            enabled:
                                              model.capabilities
                                                .supportsThinking,
                                            icon: Brain,
                                            label: t(
                                              "models.capabilities.thinking",
                                              "思考",
                                            ),
                                          },
                                          {
                                            key: "vision",
                                            enabled:
                                              model.capabilities.supportsVision,
                                            icon: Eye,
                                            label: t(
                                              "models.capabilities.vision",
                                              "视觉",
                                            ),
                                          },
                                          {
                                            key: "tools",
                                            enabled:
                                              model.enableToolsInThinking,
                                            icon: Wrench,
                                            label: t(
                                              "models.capabilities.tools",
                                              "工具",
                                            ),
                                          },
                                        ].map(
                                          ({
                                            key,
                                            enabled,
                                            icon: Icon,
                                            label,
                                          }) => (
                                            <Chip
                                              key={`${model.id}-${key}`}
                                              size="sm"
                                              variant={
                                                enabled
                                                  ? "secondary"
                                                  : "tertiary"
                                              }
                                              className={`flex items-center gap-1.5 ${
                                                enabled
                                                  ? ""
                                                  : "border border-default-200 opacity-70"
                                              }`}
                                            >
                                              <Icon
                                                className={`h-3 w-3 ${
                                                  enabled
                                                    ? "text-primary"
                                                    : "text-default-400"
                                                }`}
                                              />
                                              {enabled
                                                ? label
                                                : `${t(
                                                    "models.capabilities.disabled",
                                                    "未开启",
                                                  )} ${label}`}
                                            </Chip>
                                          ),
                                        )}
                                      </div>
                                    </div>
                                    <span className="text-xs text-default-500">
                                      {model.modelName}
                                    </span>
                                  </div>

                                  <div className="flex flex-col gap-1.5 text-xs text-default-500 sm:min-w-[200px]">
                                    <div className="grid grid-cols-[minmax(96px,0.3fr)_minmax(0,1fr)] items-start gap-2 sm:flex sm:items-center sm:gap-2">
                                      <span className="text-default-500 sm:w-24 sm:flex-shrink-0">
                                        {t(
                                          "llm.temperature.label",
                                          "Temperature",
                                        )}
                                      </span>
                                      <span className="text-default-600">
                                        {model.temperature}
                                      </span>
                                    </div>
                                    <div className="grid grid-cols-[minmax(96px,0.3fr)_minmax(0,1fr)] items-start gap-2 sm:flex sm:items-center sm:gap-2">
                                      <span className="text-default-500 sm:w-24 sm:flex-shrink-0">
                                        {t(
                                          "llm.maxToolRounds.label",
                                          "最大工具调用轮次",
                                        )}
                                      </span>
                                      <span className="text-default-600">
                                        {unlimitedRounds}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2">
                                    {model.isDefault && (
                                      <Chip
                                        size="sm"
                                        variant="secondary"
                                        color="accent"
                                      >
                                        {t("models.default")}
                                      </Chip>
                                    )}
                                    {isActiveModel && (
                                      <Chip
                                        size="sm"
                                        variant="secondary"
                                        color="success"
                                      >
                                        {t("models.active")}
                                      </Chip>
                                    )}
                                    <Popover>
                                      <Popover.Trigger>
                                        <Button
                                          className="flex items-center"
                                          variant="tertiary"
                                          size="sm"
                                          isIconOnly
                                          aria-label={t("models.actions.edit")}
                                          isDisabled={isModelOperating}
                                        >
                                          <MoreVertical className="h-4 w-4" />
                                        </Button>
                                      </Popover.Trigger>
                                      <Popover.Content className="min-w-[180px] rounded-xl border border-default-200 bg-content1 p-1 shadow-2xl">
                                        <ListBox
                                          aria-label="model-actions"
                                          selectionMode="single"
                                          onAction={(key) => {
                                            if (key === "edit") {
                                              handleEditModel(model);
                                            } else if (key === "set-default") {
                                              void handleSetDefaultModel(
                                                provider.id,
                                                model,
                                              );
                                            } else if (key === "delete") {
                                              handleDeleteModel(
                                                provider.id,
                                                model,
                                              );
                                            }
                                          }}
                                        >
                                          <ListBox.Item
                                            id="edit"
                                            key="edit"
                                            textValue="edit"
                                            className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-primary-50"
                                            isDisabled={isModelOperating}
                                          >
                                            <Edit className="h-4 w-4" />
                                            {t("models.actions.edit")}
                                          </ListBox.Item>
                                          <ListBox.Item
                                            id="set-default"
                                            key="set-default"
                                            textValue="set-default"
                                            className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-primary-50"
                                            isDisabled={
                                              isModelOperating ||
                                              model.isDefault
                                            }
                                          >
                                            <Star className="h-4 w-4" />
                                            {t(
                                              "models.actions.setDefault",
                                              "设为默认",
                                            )}
                                          </ListBox.Item>
                                          <ListBox.Item
                                            id="delete"
                                            key="delete"
                                            textValue="delete"
                                            className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger-50"
                                            isDisabled={isModelOperating}
                                          >
                                            <Trash2 className="h-4 w-4" />
                                            {t("models.actions.delete")}
                                          </ListBox.Item>
                                        </ListBox>
                                      </Popover.Content>
                                    </Popover>
                                  </div>
                                </Card.Content>
                              </Card.Root>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* TODO: 连接测试（按供应商），在 Milestone 4 接入 ConnectionTester */}
                  </Accordion.Body>
                </Accordion.Panel>
              </Accordion.Item>
            );
          })}
        </Accordion>
      )}

      <Button variant="secondary" className="mt-6" onPress={handleAddProvider}>
        <Plus className="h-4 w-4" />
        {t("models.addProvider")}
      </Button>

      <ModelEditDialog
        isOpen={modelDialogState.isOpen && Boolean(modelDialogState.providerId)}
        providerId={modelDialogState.providerId ?? ""}
        modelData={modelDialogState.model ?? undefined}
        onOpenChange={handleModelDialogOpenChange}
        onSaved={handleModelSaved}
      />

      <ConfirmDialog
        isOpen={deleteModelState.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteModelState({
              isOpen: false,
              providerId: null,
              model: null,
            });
          }
        }}
        title={t("models.deleteModel.title", "删除模型")}
        description={
          deleteModelState.model
            ? t("models.deleteModel.description", {
                name:
                  deleteModelState.model.displayName ||
                  deleteModelState.model.modelName,
                defaultValue: `确认删除模型 ${
                  deleteModelState.model.displayName ||
                  deleteModelState.model.modelName
                }？`,
              })
            : ""
        }
        confirmText={t("common.confirm", "确认")}
        cancelText={t("common.cancel", "取消")}
        variant="danger"
        onConfirm={handleConfirmDeleteModel}
      />

      <ConfirmDialog
        isOpen={deleteProviderState.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteProviderState({ isOpen: false, provider: null });
          }
        }}
        title={t("models.delete.confirmTitle", "删除供应商")}
        description={
          deleteProviderState.provider
            ? t("models.delete.confirmMessage", {
                name: deleteProviderState.provider.displayName,
                defaultValue: `确认删除供应商 ${deleteProviderState.provider.displayName}？这将同时删除所有关联的模型。`,
              })
            : ""
        }
        confirmText={t("common.confirm", "确认")}
        cancelText={t("common.cancel", "取消")}
        variant="danger"
        onConfirm={() =>
          deleteProviderState.provider
            ? handleDeleteProvider(deleteProviderState.provider)
            : Promise.resolve()
        }
      />

      {/* 供应商编辑对话框 */}
      <ProviderEditDialog
        isOpen={isEditDialogOpen}
        provider={editingProvider}
        onClose={handleCloseDialog}
        onSave={handleSaveProvider}
      />
    </div>
  );
}
