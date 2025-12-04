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
  Input,
  Label,
  ListBox,
  Select,
  Spinner,
  Surface,
  TextField,
} from "@heroui/react";
import { Zap } from "lucide-react";
import {
  Dialog as AriaDialog,
  Modal as AriaModal,
  ModalOverlay,
} from "react-aria-components";

import { useAppTranslation } from "@/app/i18n/hooks";
import {
  type CreateProviderInput,
  useStorageSettings,
} from "@/app/hooks/useStorageSettings";
import { normalizeApiUrl } from "@/app/lib/config-utils";
import { extractSingleKey, normalizeSelection } from "@/app/lib/select-utils";
import { useToast } from "@/app/components/toast";
import type { ProviderConfig, ProviderType } from "@/app/types/chat";
import { createLogger } from "@/lib/logger";

interface ProviderEditDialogProps {
  isOpen: boolean;
  provider?: ProviderConfig | null;
  onClose: () => void;
  onSave: (provider: ProviderConfig) => void;
}

const logger = createLogger("ProviderEditDialog");

const defaultForm: CreateProviderInput = {
  displayName: "",
  providerType: "openai-compatible",
  apiUrl: "",
  apiKey: "",
};

type EditableFieldKey = "displayName" | "providerType" | "apiUrl" | "apiKey";

export function ProviderEditDialog({
  isOpen,
  provider,
  onClose,
  onSave,
}: ProviderEditDialogProps) {
  const { t } = useAppTranslation("settings");
  const { push } = useToast();
  const { addProvider, updateProvider } = useStorageSettings();

  const [formData, setFormData] = useState<CreateProviderInput>(defaultForm);
  const [errors, setErrors] = useState<{
    displayName?: string;
    providerType?: string;
    apiUrl?: string;
    apiKey?: string;
  }>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const isFormValid = useMemo(
    () =>
      formData.displayName.trim().length >= 2 &&
      formData.apiUrl.trim().length > 0 &&
      Object.keys(errors).length === 0,
    [errors, formData.apiUrl, formData.displayName],
  );

  const resetState = useCallback(() => {
    if (provider) {
      setFormData({
        displayName: provider.displayName,
        providerType: provider.providerType,
        apiUrl: provider.apiUrl,
        apiKey: provider.apiKey,
      });
    } else {
      setFormData(defaultForm);
    }
    setErrors({});
    setTestResult(null);
    setIsSaving(false);
    setIsTesting(false);
  }, [provider]);

  useEffect(() => {
    if (isOpen) {
      resetState();
    }
  }, [isOpen, resetState]);

  const handleFieldChange = useCallback(
    (field: EditableFieldKey, value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
      if (errors[field]) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next[field];
          return next;
        });
      }
    },
    [errors],
  );

  const validateForm = useCallback((): boolean => {
    const nextErrors: typeof errors = {};

    if (!formData.displayName.trim()) {
      nextErrors.displayName = t("models.form.name.required");
    } else if (formData.displayName.length < 2) {
      nextErrors.displayName = t("models.form.name.minLength", { min: 2 });
    } else if (formData.displayName.length > 50) {
      nextErrors.displayName = t("models.form.name.maxLength", { max: 50 });
    }

    if (!formData.apiUrl.trim()) {
      nextErrors.apiUrl = t("models.form.apiUrl.required");
    } else {
      try {
        const url = new URL(formData.apiUrl);
        if (!url.protocol.startsWith("http")) {
          nextErrors.apiUrl = t("models.form.apiUrl.invalidProtocol");
        }
      } catch {
        nextErrors.apiUrl = t("models.form.apiUrl.invalid");
      }
    }

    if (formData.apiKey && formData.apiKey.length < 10) {
      nextErrors.apiKey = t("models.form.apiKey.minLength", { min: 10 });
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [formData.apiKey, formData.apiUrl, formData.displayName, t]);

  const handleSave = useCallback(async () => {
    if (!validateForm()) return;

    setIsSaving(true);
    try {
      const payload: CreateProviderInput = {
        displayName: formData.displayName.trim(),
        providerType: formData.providerType,
        apiUrl: normalizeApiUrl(formData.apiUrl),
        apiKey: formData.apiKey,
      };

      let saved: ProviderConfig;

      if (provider) {
        saved = await updateProvider(provider.id, payload);
        push({
          variant: "success",
          description: t("models.save.updateSuccess", {
            name: saved.displayName,
          }),
        });
      } else {
        saved = await addProvider(payload);
        push({
          variant: "success",
          description: t("models.save.createSuccess", {
            name: saved.displayName,
          }),
        });
      }

      onSave(saved);
      onClose();
    } catch (error) {
      logger.error("[ProviderEditDialog] 保存失败", error);
      push({ variant: "danger", description: t("models.save.error") });
    } finally {
      setIsSaving(false);
    }
  }, [
    addProvider,
    formData.apiKey,
    formData.apiUrl,
    formData.displayName,
    formData.providerType,
    onClose,
    onSave,
    provider,
    push,
    t,
    updateProvider,
    validateForm,
  ]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void handleSave();
    },
    [handleSave],
  );

  const handleTestConnection = useCallback(async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const response = await fetch("/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiUrl: normalizeApiUrl(formData.apiUrl),
          apiKey: formData.apiKey,
          providerType: formData.providerType,
          modelName: "gpt-3.5-turbo",
          temperature: 0.3,
        }),
      });

      const result = await response.json();
      if (response.ok && result?.success) {
        setTestResult({
          success: true,
          message: t("models.test.success"),
        });
      } else {
        setTestResult({
          success: false,
          message: result?.message ?? t("models.test.error"),
        });
      }
    } catch (error) {
      logger.error("[ProviderEditDialog] 连接测试失败", error);
      setTestResult({
        success: false,
        message: t("models.test.networkError"),
      });
    } finally {
      setIsTesting(false);
    }
  }, [formData.apiKey, formData.apiUrl, formData.providerType, t]);

  return (
    <ModalOverlay
      isOpen={isOpen}
      isDismissable
      onOpenChange={(open: boolean) => {
        if (!open) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    >
      <AriaModal className="w-full max-w-lg px-4">
        <Surface className="w-full rounded-2xl bg-content1 p-4 shadow-2xl outline-none">
          <AriaDialog
            aria-label={
              provider ? t("models.editProvider") : t("models.addProvider")
            }
            className="flex flex-col gap-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {provider ? t("models.editProvider") : t("models.addProvider")}
              </h2>
              <CloseButton aria-label={t("common.cancel")} onPress={onClose} />
            </div>

            <div>
              <form className="space-y-4" onSubmit={handleSubmit}>
                <TextField isRequired isInvalid={Boolean(errors.displayName)}>
                  <Label>{t("models.form.name.label")}</Label>
                  <Input
                    value={formData.displayName}
                    onChange={(event) =>
                      handleFieldChange("displayName", event.target.value)
                    }
                    placeholder={t("models.form.name.placeholder")}
                  />
                  <Description>{t("models.form.name.description")}</Description>
                  {errors.displayName ? (
                    <FieldError>{errors.displayName}</FieldError>
                  ) : null}
                </TextField>

                <Select
                  isRequired
                  selectedKey={formData.providerType}
                  onSelectionChange={(keys) => {
                    const selection = normalizeSelection(keys);
                    const key = selection ? extractSingleKey(selection) : null;
                    if (typeof key === "string") {
                      handleFieldChange("providerType", key as ProviderType);
                    }
                  }}
                >
                  <Label>{t("models.form.type.label")}</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Content>
                    <ListBox>
                      <ListBox.Item id="openai-compatible">
                        OpenAI Compatible
                        <Description>
                          {t("models.form.type.options.openaiCompatible")}
                        </Description>
                      </ListBox.Item>
                      <ListBox.Item id="deepseek-native">
                        DeepSeek Native
                        <Description>
                          {t("models.form.type.options.deepseekNative")}
                        </Description>
                      </ListBox.Item>
                      <ListBox.Item id="openai-reasoning">
                        OpenAI Reasoning
                        <Description>
                          {t("models.form.type.options.openaiReasoning")}
                        </Description>
                      </ListBox.Item>
                    </ListBox>
                  </Select.Content>
                  <Description>{t("models.form.type.description")}</Description>
                </Select>

                <TextField isRequired isInvalid={Boolean(errors.apiUrl)}>
                  <Label>{t("models.form.apiUrl.label")}</Label>
                  <Input
                    value={formData.apiUrl}
                    onChange={(event) =>
                      handleFieldChange("apiUrl", event.target.value)
                    }
                    placeholder={t("models.form.apiUrl.placeholder")}
                  />
                  <Description>
                    {t("models.form.apiUrl.description")}
                  </Description>
                  {errors.apiUrl ? (
                    <FieldError>{errors.apiUrl}</FieldError>
                  ) : null}
                </TextField>

                <TextField isInvalid={Boolean(errors.apiKey)}>
                  <Label>
                    {t("models.form.apiKey.label")}
                    <span className="ml-2 text-sm text-default-500">
                      {t("common.optional")}
                    </span>
                  </Label>
                  <Input
                    type="password"
                    value={formData.apiKey}
                    onChange={(event) =>
                      handleFieldChange("apiKey", event.target.value)
                    }
                    placeholder={t("models.form.apiKey.placeholder")}
                  />
                  <Description>
                    {t("models.form.apiKey.description")}
                  </Description>
                  {errors.apiKey ? (
                    <FieldError>{errors.apiKey}</FieldError>
                  ) : null}
                </TextField>

                {formData.apiUrl ? (
                  <div className="space-y-2 rounded-xl border border-default-200 bg-content1 px-3 py-3">
                    <div className="flex items-center gap-3">
                      <Button
                        variant="secondary"
                        size="sm"
                        onPress={handleTestConnection}
                        isDisabled={isTesting || !formData.apiUrl}
                      >
                        {isTesting ? (
                          <Spinner size="sm" />
                        ) : (
                          <Zap className="h-4 w-4" />
                        )}
                        {t("models.form.testConnection")}
                      </Button>
                    </div>
                    {testResult ? (
                      <div
                        className="rounded-lg px-3 py-2 text-sm"
                        style={{
                          background: testResult.success
                            ? "oklch(var(--success-100))"
                            : "oklch(var(--danger-100))",
                          color: testResult.success
                            ? "oklch(var(--success-700))"
                            : "oklch(var(--danger-700))",
                        }}
                      >
                        {testResult.success ? "✓" : "✗"} {testResult.message}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </form>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button variant="tertiary" onPress={onClose}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="primary"
                onPress={handleSave}
                isDisabled={!isFormValid || isSaving}
              >
                {isSaving ? <Spinner size="sm" /> : null}
                {t("common.save")}
              </Button>
            </div>
          </AriaDialog>
        </Surface>
      </AriaModal>
    </ModalOverlay>
  );
}

export default ProviderEditDialog;
