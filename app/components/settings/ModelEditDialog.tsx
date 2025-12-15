"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Button,
  CloseButton,
  Description,
  FieldError,
  Fieldset,
  Input,
  Label,
  Spinner,
  Surface,
  TextField,
  TooltipContent,
  TooltipRoot,
} from "@heroui/react";
import { Brain, Eye, Wrench, Zap } from "lucide-react";
import {
  Dialog as AriaDialog,
  Modal as AriaModal,
  ModalOverlay,
} from "react-aria-components";

import { useAppTranslation } from "@/app/i18n/hooks";
import {
  type CreateModelInput,
  type UpdateModelInput,
  useStorageSettings,
} from "@/app/hooks/useStorageSettings";
import { normalizeProviderApiUrl } from "@/app/lib/config-utils";
import { getDefaultCapabilities } from "@/app/lib/model-capabilities";
import { useToast } from "@/app/components/toast";
import type { ModelCapabilities, ModelConfig } from "@/app/types/chat";
import { createLogger } from "@/lib/logger";

export interface ModelEditDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: string;
  modelData?: ModelConfig;
  onSaved?: () => void;
}

type FormState = {
  modelName: string;
  displayName: string;
  temperature: string;
  maxToolRounds: string;
  capabilities: ModelCapabilities;
  enableToolsInThinking: boolean;
};

type FieldErrors = {
  modelName?: string;
  temperature?: string;
  maxToolRounds?: string;
  general?: string;
};

const logger = createLogger("ModelEditDialog");

const DEFAULT_FORM_STATE: FormState = {
  modelName: "",
  displayName: "",
  temperature: "0.3",
  maxToolRounds: "5",
  capabilities: { ...getDefaultCapabilities() },
  enableToolsInThinking: false,
};

export function ModelEditDialog({
  isOpen,
  onOpenChange,
  providerId,
  modelData,
  onSaved,
}: ModelEditDialogProps) {
  const { t } = useAppTranslation("settings");
  const { push } = useToast();
  const { addModel, updateModel, getProviders } = useStorageSettings();

  const [form, setForm] = useState<FormState>(DEFAULT_FORM_STATE);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const isEditMode = Boolean(modelData);

  const buildInitialForm = useCallback((): FormState => {
    const baseCapabilities =
      modelData?.capabilities ??
      getDefaultCapabilities(modelData?.modelName ?? "");
    return {
      modelName: modelData?.modelName ?? "",
      displayName: modelData?.displayName ?? "",
      temperature: String(
        modelData?.temperature ?? DEFAULT_FORM_STATE.temperature,
      ),
      maxToolRounds: String(
        modelData?.maxToolRounds ?? DEFAULT_FORM_STATE.maxToolRounds,
      ),
      capabilities: { ...baseCapabilities },
      enableToolsInThinking:
        typeof modelData?.enableToolsInThinking === "boolean"
          ? modelData.enableToolsInThinking
          : baseCapabilities.supportsThinking,
    };
  }, [
    modelData?.capabilities,
    modelData?.displayName,
    modelData?.enableToolsInThinking,
    modelData?.maxToolRounds,
    modelData?.modelName,
    modelData?.temperature,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    setForm(buildInitialForm());
    setErrors({});
    setIsSaving(false);
    setIsTesting(false);
  }, [buildInitialForm, isOpen]);

  const quickNumberState = useMemo(() => {
    const temperatureValue = Number(form.temperature);
    const maxToolRoundsValue = Number(form.maxToolRounds);
    return {
      temperatureValue,
      maxToolRoundsValue,
      isTemperatureValid:
        !Number.isNaN(temperatureValue) &&
        temperatureValue >= 0 &&
        temperatureValue <= 2,
      isMaxToolRoundsValid:
        Number.isInteger(maxToolRoundsValue) &&
        maxToolRoundsValue >= 1 &&
        maxToolRoundsValue <= 999,
    };
  }, [form.maxToolRounds, form.temperature]);

  const hasBlockingError = useMemo(() => {
    return Object.entries(errors).some(
      ([key, message]) => key !== "general" && Boolean(message),
    );
  }, [errors]);

  const isFormValid = useMemo(() => {
    return (
      form.modelName.trim().length > 0 &&
      quickNumberState.isTemperatureValid &&
      quickNumberState.isMaxToolRoundsValid &&
      !hasBlockingError
    );
  }, [
    form.modelName,
    hasBlockingError,
    quickNumberState.isMaxToolRoundsValid,
    quickNumberState.isTemperatureValid,
  ]);

  const handleClose = useCallback(() => {
    setErrors({});
    setIsSaving(false);
    setIsTesting(false);
    onOpenChange(false);
  }, [onOpenChange]);

  const handleFieldChange = useCallback(
    (field: keyof FormState, value: string | ModelCapabilities | boolean) => {
      setForm((prev) => ({ ...prev, [field]: value }) as FormState);
      setErrors((prev) => {
        if (field in prev) {
          const next = { ...prev };
          delete (next as Record<string, string>)[field as string];
          return next;
        }
        if (prev.general) {
          const next = { ...prev };
          delete next.general;
          return next;
        }
        return prev;
      });
    },
    [],
  );

  const validateForm = useCallback(() => {
    const nextErrors: FieldErrors = {};
    const trimmedName = form.modelName.trim();

    if (!trimmedName) {
      nextErrors.modelName = t(
        "models.form.modelName.required",
        "模型名称不能为空",
      );
    }

    const temperatureValue = Number(form.temperature);
    if (Number.isNaN(temperatureValue)) {
      nextErrors.temperature = t(
        "models.form.temperature.invalid",
        "温度必须是数字",
      );
    } else if (temperatureValue < 0 || temperatureValue > 2) {
      nextErrors.temperature = t(
        "models.form.temperature.outOfRange",
        "温度需在 0 - 2 之间",
      );
    }

    const maxToolRoundsValue = Number(form.maxToolRounds);
    if (!Number.isInteger(maxToolRoundsValue)) {
      nextErrors.maxToolRounds = t(
        "models.form.maxToolRounds.invalid",
        "最大工具轮次必须是整数",
      );
    } else if (maxToolRoundsValue < 1 || maxToolRoundsValue > 999) {
      nextErrors.maxToolRounds = t(
        "models.form.maxToolRounds.outOfRange",
        "请输入 1 - 999 之间的数值",
      );
    }

    setErrors(nextErrors);

    return {
      isValid: Object.keys(nextErrors).length === 0,
      trimmedName,
      temperatureValue,
      maxToolRoundsValue,
    };
  }, [form.maxToolRounds, form.modelName, form.temperature, t]);

  const handleSave = useCallback(async () => {
    const { isValid, trimmedName, temperatureValue, maxToolRoundsValue } =
      validateForm();
    if (!isValid) return;

    setIsSaving(true);
    setErrors((prev) => ({ ...prev, general: undefined }));

    try {
      if (isEditMode && modelData) {
        const updates: UpdateModelInput = {
          modelName: trimmedName,
          displayName: form.displayName.trim(),
          temperature: temperatureValue,
          maxToolRounds: maxToolRoundsValue,
          capabilities: form.capabilities,
          enableToolsInThinking: form.enableToolsInThinking,
        };

        const updated = await updateModel(providerId, modelData.id, updates);
        push({
          variant: "success",
          description: t("models.save.modelUpdateSuccess", {
            name: updated.displayName || updated.modelName,
          }),
        });
      } else {
        const payload: CreateModelInput = {
          modelName: trimmedName,
          displayName: form.displayName.trim(),
          temperature: temperatureValue,
          maxToolRounds: maxToolRoundsValue,
          isDefault: modelData?.isDefault ?? false,
          capabilities: form.capabilities,
          enableToolsInThinking: form.enableToolsInThinking,
        };

        const created = await addModel(providerId, payload);
        push({
          variant: "success",
          description: t("models.save.modelCreateSuccess", {
            name: created.displayName || created.modelName,
          }),
        });
      }

      onSaved?.();
      handleClose();
    } catch (error) {
      logger.error("[ModelEditDialog] 保存失败", error);
      setErrors((prev) => ({
        ...prev,
        general: t("models.save.modelError", "保存失败，请稍后重试"),
      }));
    } finally {
      setIsSaving(false);
    }
  }, [
    addModel,
    form.capabilities,
    form.displayName,
    form.enableToolsInThinking,
    handleClose,
    isEditMode,
    modelData,
    onSaved,
    providerId,
    push,
    t,
    updateModel,
    validateForm,
  ]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void handleSave();
    },
    [handleSave],
  );

  const handleTestModel = useCallback(async () => {
    const trimmedModelName = form.modelName.trim();
    if (!trimmedModelName) {
      push({
        variant: "danger",
        description: t("models.test.missingModelName", "请先填写模型名称"),
      });
      return;
    }

    setIsTesting(true);
    try {
      const providers = await getProviders();
      const provider = providers.find((item) => item.id === providerId);

      if (!provider) {
        push({
          variant: "danger",
          description: t(
            "models.test.missingProvider",
            "未找到对应的供应商配置，请先保存供应商",
          ),
        });
        return;
      }

      const temperatureValue = Number(form.temperature);
      const maxToolRoundsValue = Number(form.maxToolRounds);

      const response = await fetch("/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiUrl: normalizeProviderApiUrl(
            provider.providerType,
            provider.apiUrl,
          ),
          apiKey: provider.apiKey,
          providerType: provider.providerType,
          modelName: trimmedModelName,
          temperature: Number.isFinite(temperatureValue)
            ? temperatureValue
            : Number(DEFAULT_FORM_STATE.temperature),
          maxToolRounds: Number.isFinite(maxToolRoundsValue)
            ? maxToolRoundsValue
            : Number(DEFAULT_FORM_STATE.maxToolRounds),
        }),
      });

      const data = await response.json().catch(() => null);

      if (response.ok && data?.success) {
        push({
          variant: "success",
          description: t("models.test.success", {
            response: data?.response ?? "ok",
          }),
        });
      } else {
        push({
          variant: "danger",
          description:
            data?.error ??
            data?.message ??
            t("models.test.error", "测试失败，请检查配置是否正确"),
        });
      }
    } catch (error) {
      logger.error("[ModelEditDialog] 测试模型失败", error);
      push({
        variant: "danger",
        description: t("models.test.networkError", "网络错误，请检查配置"),
      });
    } finally {
      setIsTesting(false);
    }
  }, [
    form.maxToolRounds,
    form.modelName,
    form.temperature,
    getProviders,
    providerId,
    push,
    t,
  ]);

  return (
    <ModalOverlay
      isOpen={isOpen}
      isDismissable
      onOpenChange={(open: boolean) => {
        if (!open) handleClose();
      }}
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
    >
      <AriaModal className="w-full max-w-2xl px-4">
        <Surface className="w-full rounded-2xl bg-content1 p-4 shadow-2xl outline-none">
          <AriaDialog
            aria-label={
              isEditMode
                ? t("models.editModel", "编辑模型")
                : t("models.addModel", "添加模型")
            }
            className="flex flex-col gap-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {isEditMode
                  ? t("models.editModel", "编辑模型")
                  : t("models.addModel", "添加模型")}
              </h2>
              <CloseButton
                aria-label={t("common.cancel")}
                onPress={handleClose}
              />
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <TextField isRequired isInvalid={Boolean(errors.modelName)}>
                <Label>
                  {t("models.form.modelName.label", "模型名称")}
                  <span className="ml-2 text-sm text-default-500">
                    {t("common.required", "必填")}
                  </span>
                </Label>
                <Input
                  value={form.modelName}
                  onChange={(event) =>
                    handleFieldChange("modelName", event.target.value)
                  }
                  placeholder={t(
                    "models.form.modelName.placeholder",
                    "请输入模型名称，如 gpt-4o",
                  )}
                />
                <Description>
                  {t(
                    "models.form.modelName.description",
                    "用于请求的实际模型 ID，必填",
                  )}
                </Description>
                {errors.modelName ? (
                  <FieldError>{errors.modelName}</FieldError>
                ) : null}
              </TextField>

              <TextField>
                <Label>
                  {t("models.form.displayName.label", "显示名称")}
                  <span className="ml-2 text-sm text-default-500">
                    {t("common.optional", "可选")}
                  </span>
                </Label>
                <Input
                  value={form.displayName}
                  onChange={(event) =>
                    handleFieldChange("displayName", event.target.value)
                  }
                  placeholder={t(
                    "models.form.displayName.placeholder",
                    "例如：高质量推理模型",
                  )}
                />
                <Description>
                  {t(
                    "models.form.displayName.description",
                    "用于界面展示的别名，不影响请求",
                  )}
                </Description>
              </TextField>

              <div className="grid gap-4 sm:grid-cols-2">
                <TextField isRequired isInvalid={Boolean(errors.temperature)}>
                  <Label>{t("models.form.temperature.label", "温度")}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    max={2}
                    inputMode="decimal"
                    value={form.temperature}
                    onChange={(event) =>
                      handleFieldChange("temperature", event.target.value)
                    }
                    placeholder={t(
                      "models.form.temperature.placeholder",
                      "0 - 2，默认 0.3",
                    )}
                  />
                  <Description>
                    {t(
                      "models.form.temperature.description",
                      "控制输出随机性，数值越大越发散",
                    )}
                  </Description>
                  {errors.temperature ? (
                    <FieldError>{errors.temperature}</FieldError>
                  ) : null}
                </TextField>

                <TextField isRequired isInvalid={Boolean(errors.maxToolRounds)}>
                  <Label>
                    {t("models.form.maxToolRounds.label", "最大工具轮次")}
                  </Label>
                  <Input
                    type="number"
                    step="1"
                    min={1}
                    max={999}
                    inputMode="numeric"
                    value={form.maxToolRounds}
                    onChange={(event) =>
                      handleFieldChange("maxToolRounds", event.target.value)
                    }
                    placeholder={t(
                      "models.form.maxToolRounds.placeholder",
                      "1 - 999，默认 5",
                    )}
                  />
                  <Description>
                    {t(
                      "models.form.maxToolRounds.description",
                      "单次对话允许的工具调用轮数上限",
                    )}
                  </Description>
                  {errors.maxToolRounds ? (
                    <FieldError>{errors.maxToolRounds}</FieldError>
                  ) : null}
                </TextField>
              </div>

              <Fieldset className="rounded-xl border border-default-200 bg-content1 px-3 py-3">
                <Fieldset.Legend className="text-sm font-semibold text-foreground">
                  {t("models.form.capabilities.title", "模型能力")}
                </Fieldset.Legend>
                <Description className="text-default-500">
                  {t(
                    "models.form.capabilities.description",
                    "标记模型是否支持思考/视觉能力，影响工具调用策略",
                  )}
                </Description>
                <Fieldset.Group className="mt-3 grid gap-2 sm:grid-cols-3">
                  {(
                    [
                      {
                        key: "thinking",
                        enabled: form.capabilities.supportsThinking,
                        disabled: false,
                        icon: Brain,
                        label: t(
                          "models.form.capabilities.thinking.label",
                          "支持思考",
                        ),
                        description: t(
                          "models.form.capabilities.thinking.description",
                          "适用于 o1 / o3 / deepseek-reasoner 等推理模型",
                        ),
                        onToggle: () => {
                          setForm((prev) => {
                            const supportsThinking =
                              !prev.capabilities.supportsThinking;
                            const nextCapabilities = {
                              ...prev.capabilities,
                              supportsThinking,
                            };
                            const nextEnableTools = supportsThinking
                              ? prev.enableToolsInThinking
                              : false;
                            return {
                              ...prev,
                              capabilities: nextCapabilities,
                              enableToolsInThinking: nextEnableTools,
                            };
                          });
                        },
                      },
                      {
                        key: "vision",
                        enabled: form.capabilities.supportsVision,
                        disabled: false,
                        icon: Eye,
                        label: t(
                          "models.form.capabilities.vision.label",
                          "支持视觉",
                        ),
                        description: t(
                          "models.form.capabilities.vision.description",
                          "能够解析图片/截图输入，如 gpt-4o",
                        ),
                        onToggle: () => {
                          setForm((prev) => ({
                            ...prev,
                            capabilities: {
                              ...prev.capabilities,
                              supportsVision: !prev.capabilities.supportsVision,
                            },
                          }));
                        },
                      },
                      {
                        key: "tools",
                        enabled: form.enableToolsInThinking,
                        disabled: !form.capabilities.supportsThinking,
                        icon: Wrench,
                        label: t(
                          "models.form.enableToolsInThinking.label",
                          "思考中允许调用工具",
                        ),
                        description: t(
                          "models.form.enableToolsInThinking.description",
                          "某些推理模型可在思考阶段直接触发工具调用",
                        ),
                        onToggle: () => {
                          setForm((prev) => ({
                            ...prev,
                            enableToolsInThinking: !prev.enableToolsInThinking,
                          }));
                        },
                      },
                    ] as const
                  ).map(
                    ({
                      key,
                      enabled,
                      disabled,
                      icon: Icon,
                      label,
                      description,
                      onToggle,
                    }) => (
                      <TooltipRoot key={key} delay={0}>
                        <span className="inline-flex">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="model-capability-button"
                            data-enabled={enabled ? "true" : "false"}
                            data-disabled={disabled ? "true" : "false"}
                            aria-pressed={enabled}
                            isDisabled={disabled}
                            onPress={onToggle}
                          >
                            <Icon className="h-4 w-4" />
                            <span className="text-sm font-medium">{label}</span>
                          </Button>
                        </span>
                        <TooltipContent placement="top">
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-semibold text-foreground">
                              {enabled
                                ? label
                                : `${t(
                                    "models.capabilities.disabled",
                                    "未开启",
                                  )} ${label}`}
                            </span>
                            <span className="text-xs text-default-500">
                              {description}
                            </span>
                          </div>
                        </TooltipContent>
                      </TooltipRoot>
                    ),
                  )}
                </Fieldset.Group>
              </Fieldset>

              {errors.general ? (
                <FieldError className="text-sm">{errors.general}</FieldError>
              ) : null}

              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="secondary"
                  onPress={handleTestModel}
                  isDisabled={isTesting || isSaving || !form.modelName.trim()}
                >
                  {isTesting ? (
                    <Spinner size="sm" />
                  ) : (
                    <Zap className="h-4 w-4" />
                  )}
                  {t("models.form.testModel", "测试模型")}
                </Button>

                <div className="flex items-center justify-end gap-2">
                  <Button variant="tertiary" onPress={handleClose}>
                    {t("common.cancel", "取消")}
                  </Button>
                  <Button
                    variant="primary"
                    onPress={handleSave}
                    isDisabled={!isFormValid || isSaving}
                  >
                    {isSaving ? <Spinner size="sm" /> : null}
                    {t("common.save", "保存")}
                  </Button>
                </div>
              </div>
            </form>
          </AriaDialog>
        </Surface>
      </AriaModal>
    </ModalOverlay>
  );
}

export default ModelEditDialog;
