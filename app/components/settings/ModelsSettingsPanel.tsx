"use client";

import { useCallback, useMemo, useState } from "react";
import { Accordion, Button, Chip, ListBox, Popover } from "@heroui/react";
import { Edit, MoreVertical, Plus, Trash2 } from "lucide-react";

import { useAppTranslation } from "@/app/i18n/hooks";
import { useStorageSettings } from "@/app/hooks/useStorageSettings";
import { useToast } from "@/app/components/toast";
import ProviderEditDialog from "./ProviderEditDialog";
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
  const { deleteProvider, getProviders, getModels, getActiveModel } =
    useStorageSettings();

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderConfig | null>(
    null,
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const showToast = useCallback(
    (variant: Parameters<typeof push>[0]["variant"], description: string) => {
      push({ variant, description });
    },
    [push],
  );

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
        const newProviders = await getProviders();
        onProvidersChange(newProviders);

        const newModels = await getModels();
        onModelsChange(newModels);

        // 若需要，可在此处根据 savedProvider 处理选中状态
      } catch (error) {
        console.error("[ModelsSettingsPanel] 刷新供应商列表失败", error);
      }
    },
    [getModels, getProviders, onModelsChange, onProvidersChange],
  );

  const handleDeleteProvider = useCallback(
    async (providerId: string) => {
      const provider = providers.find((item) => item.id === providerId);
      if (!provider) return;

      const confirmed =
        typeof window !== "undefined"
          ? window.confirm(
              t("models.delete.confirmMessage", {
                name: provider.displayName,
              }),
            )
          : false;

      if (!confirmed) return;

      setDeletingId(providerId);

      try {
        const isActive = activeModel?.providerId === providerId;

        await deleteProvider(providerId);

        const [newProviders, newModels, newActiveModel] = await Promise.all([
          getProviders(),
          getModels(),
          getActiveModel(),
        ]);

        onProvidersChange(newProviders);
        onModelsChange(newModels);
        onActiveModelChange(newActiveModel);

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
      }
    },
    [
      activeModel,
      deleteProvider,
      getActiveModel,
      getModels,
      getProviders,
      onActiveModelChange,
      onModelsChange,
      onProvidersChange,
      providers,
      showToast,
      t,
    ],
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
          className="mt-4 flex flex-col gap-3 rounded-2xl border border-default-200 bg-content1 p-2"
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
                  <Accordion.Trigger className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left">
                    <div className="flex items-center gap-3">
                      <span className="text-base font-medium text-foreground">
                        {provider.displayName}
                      </span>
                      <Chip
                        size="sm"
                        variant="secondary"
                        color="accent"
                        className="text-xs"
                      >
                        {t("models.modelsList.title")} ({providerModels.length})
                      </Chip>
                    </div>

                    <div className="flex items-center gap-2">
                      <Popover>
                        <Popover.Trigger className="flex items-center">
                          <Button
                            variant="tertiary"
                            size="sm"
                            isIconOnly
                            isDisabled={isDeleting}
                            aria-label={t("models.actions.edit")}
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
                                void handleDeleteProvider(provider.id);
                              }
                            }}
                          >
                            <ListBox.Item
                              id="edit"
                              key="edit"
                              textValue="edit"
                              className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-primary-50"
                            >
                              <Edit className="h-4 w-4" />
                              {t("models.actions.edit")}
                            </ListBox.Item>
                            <ListBox.Item
                              id="delete"
                              key="delete"
                              textValue="delete"
                              className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger-50"
                            >
                              <Trash2 className="h-4 w-4" />
                              {t("models.actions.delete")}
                            </ListBox.Item>
                          </ListBox>
                        </Popover.Content>
                      </Popover>
                      <Accordion.Indicator />
                    </div>
                  </Accordion.Trigger>
                </Accordion.Heading>

                <Accordion.Panel className="px-2 pb-3">
                  <Accordion.Body>
                    <div className="rounded-lg border border-default-200 bg-content1 px-4 py-3">
                      <div className="flex flex-col gap-2 text-sm text-foreground">
                        <div className="flex items-center gap-2">
                          <span className="w-24 text-default-500">
                            {t("models.provider.type")}
                          </span>
                          <span className="font-medium">
                            {provider.providerType}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-24 text-default-500">
                            {t("models.provider.apiUrl")}
                          </span>
                          <span className="break-all font-medium">
                            {provider.apiUrl || "—"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-24 text-default-500">
                            {t("models.provider.apiKey")}
                          </span>
                          <span className="font-medium">
                            {provider.apiKey
                              ? "••••••"
                              : t("models.provider.noApiKey")}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-foreground">
                          {t("models.modelsList.title")} (
                          {providerModels.length})
                        </h4>
                      </div>

                      {providerModels.length === 0 ? (
                        <p className="text-sm text-default-500">
                          {t("models.modelsList.empty")}
                        </p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {providerModels.map((model) => (
                            <div
                              key={model.id}
                              className="flex items-center justify-between rounded-lg border border-default-200 bg-content1 px-3 py-2"
                            >
                              <span className="text-sm text-foreground">
                                {model.displayName}
                              </span>
                              <div className="flex items-center gap-2">
                                {model.isDefault && (
                                  <Chip size="sm" variant="soft" color="accent">
                                    {t("models.default")}
                                  </Chip>
                                )}
                                {activeModel?.modelId === model.id && (
                                  <Chip
                                    size="sm"
                                    variant="soft"
                                    color="success"
                                  >
                                    {t("models.active")}
                                  </Chip>
                                )}
                              </div>
                            </div>
                          ))}
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
