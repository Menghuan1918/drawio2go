"use client";

import {
  type ReactNode,
  type FormEvent,
  type Key,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Selection } from "react-aria-components";
import {
  Alert,
  Button,
  CloseButton,
  Dropdown,
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

import type { McpConfig, McpHost } from "@/app/types/mcp";
import { useOperationToast } from "@/app/hooks/useOperationToast";
import { extractSingleKey, normalizeSelection } from "@/app/lib/select-utils";
import { useAppTranslation } from "@/app/i18n/hooks";

/**
 * MCP 配置弹窗（Popover/Dropdown）Props
 */
export interface McpConfigDialogProps {
  /**
   * 是否打开弹窗（受控）。
   */
  isOpen: boolean;

  /**
   * 打开状态变化（受控）。
   */
  onOpenChange: (open: boolean) => void;

  /**
   * 确认回调（提交配置并启动 MCP）。
   */
  onConfirm: (config: McpConfig) => Promise<void>;

  /**
   * 触发器（由父组件提供）。
   */
  trigger: ReactNode;
}

type FormErrors = {
  port?: string;
};

type PortMode = "manual" | "random";

const DEFAULT_HOST: McpHost = "127.0.0.1";
const DEFAULT_PORT = 8000;
const DEFAULT_PORT_MODE: PortMode = "manual";

const isElectronEnv = (): boolean =>
  typeof window !== "undefined" && typeof window.electronMcp !== "undefined";

/**
 * MCP 配置弹窗（Popover/Dropdown）
 *
 * - 使用 HeroUI v3 的 `Dropdown` 在侧边栏内弹出（非 Modal）
 * - 使用 HeroUI 的 `Surface` 作为内容容器（现代扁平化）
 * - Web 环境显示“仅支持 APP 端”提示
 */
export function McpConfigDialog({
  isOpen,
  onOpenChange,
  onConfirm,
  trigger,
}: McpConfigDialogProps) {
  const { t } = useAppTranslation("mcp");
  const { pushErrorToast, extractErrorMessage } = useOperationToast();

  const [host, setHost] = useState<McpHost>(DEFAULT_HOST);
  const [port, setPort] = useState<string>(String(DEFAULT_PORT));
  const [portMode, setPortMode] = useState<PortMode>(DEFAULT_PORT_MODE);
  const [errors, setErrors] = useState<FormErrors>({});

  // Select 受控状态（用于延时关闭）
  const [isHostSelectOpen, setIsHostSelectOpen] = useState(false);
  const [isPortModeSelectOpen, setIsPortModeSelectOpen] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const canUseMcp = useMemo(() => (isOpen ? isElectronEnv() : true), [isOpen]);

  const validatePort = useCallback(
    (raw: string): string | null => {
      const trimmed = raw.trim();
      if (!trimmed) return t("dialog.port.errorEmpty");

      const port = Number(trimmed);
      if (!Number.isInteger(port)) return t("dialog.port.errorInteger");
      if (port < 1 || port > 65535) return t("dialog.port.errorRange");

      return null;
    },
    [t],
  );

  const isBusy = isSubmitting;

  const handleRequestClose = useCallback(() => {
    if (isSubmitting) return;
    onOpenChange(false);
  }, [isSubmitting, onOpenChange]);

  const resetState = useCallback(() => {
    setHost(DEFAULT_HOST);
    setPort(String(DEFAULT_PORT));
    setPortMode(DEFAULT_PORT_MODE);
    setErrors({});
    setIsSubmitting(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      resetState();
    }
  }, [isOpen, resetState]);

  const handlePortChange = useCallback(
    (value: string) => {
      setPort(value);
      setErrors((prev) => {
        const message = validatePort(value);
        if (!message && !prev.port) return prev;
        const next: FormErrors = { ...prev };
        if (message) next.port = message;
        else delete next.port;
        return next;
      });
    },
    [validatePort],
  );

  const handleHostChange = useCallback((value: Selection | Key | null) => {
    // 先关闭 Select
    setIsHostSelectOpen(false);

    // 延迟执行，让 Select 有时间完成关闭动画
    setTimeout(() => {
      const selection = normalizeSelection(value);
      const key = selection ? extractSingleKey(selection) : null;
      if (key === "127.0.0.1" || key === "0.0.0.0") {
        setHost(key as McpHost);
      }
    }, 150);
  }, []);

  const handlePortModeChange = useCallback((value: Selection | Key | null) => {
    // 先关闭 Select
    setIsPortModeSelectOpen(false);

    // 延迟执行，让 Select 有时间完成关闭动画
    setTimeout(() => {
      const selection = normalizeSelection(value);
      const key = selection ? extractSingleKey(selection) : null;
      if (key !== "manual" && key !== "random") return;

      const nextMode = key as PortMode;
      setPortMode(nextMode);
      setErrors((prev) => {
        if (!prev.port) return prev;
        const next = { ...prev };
        delete next.port;
        return next;
      });
    }, 150);
  }, []);

  const isFormValid = useMemo(() => {
    if (!canUseMcp) return false;
    if (portMode === "random") return true;
    return validatePort(port) === null;
  }, [canUseMcp, port, portMode, validatePort]);

  const submit = useCallback(async () => {
    if (isBusy) return;
    if (!canUseMcp) return;

    if (portMode === "manual") {
      const portError = validatePort(port);
      if (portError) {
        setErrors((prev) => ({ ...prev, port: portError }));
        return;
      }
    }

    setIsSubmitting(true);
    setErrors({});

    let resolvedPort: number;
    try {
      if (portMode === "random") {
        if (!isElectronEnv() || !window.electronMcp) {
          throw new Error(t("errors.envNotSupported"));
        }
        resolvedPort = await window.electronMcp.getRandomPort();
      } else {
        resolvedPort = Number(port);
      }
    } catch (error) {
      const message = extractErrorMessage(error) ?? t("errors.unknownError");
      pushErrorToast(t("errors.getRandomPortFailed", { message }));
      setIsSubmitting(false);
      return;
    }

    const config: McpConfig = { host, port: resolvedPort };
    onOpenChange(false);

    // 延迟执行异步操作，避免关闭动画被阻塞
    setTimeout(async () => {
      try {
        await onConfirm(config);
      } catch {
        // 弹窗已关闭：错误不在表单内展示，由 onConfirm 内部 Toast 负责提示
      } finally {
        setIsSubmitting(false);
      }
    }, 300);
  }, [
    canUseMcp,
    extractErrorMessage,
    host,
    isBusy,
    onConfirm,
    onOpenChange,
    port,
    portMode,
    pushErrorToast,
    t,
    validatePort,
  ]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void submit();
    },
    [submit],
  );

  const shouldCloseOnInteractOutside = useCallback((element: Element) => {
    if (!(element instanceof HTMLElement)) return true;
    if (element.closest('[data-trigger="Select"]')) return false;
    return true;
  }, []);

  return (
    <Dropdown
      isOpen={isOpen}
      onOpenChange={(open: boolean) => {
        if (!open && isSubmitting) return;
        onOpenChange(open);
      }}
    >
      {trigger}
      <Dropdown.Popover
        placement="top end"
        className="z-[80] min-w-[320px] max-w-[420px] p-0"
        shouldCloseOnInteractOutside={shouldCloseOnInteractOutside}
      >
        <Surface className="w-full rounded-[var(--radius-lg)] bg-content1 p-4 shadow-[var(--shadow-4)] outline-none">
          <div
            aria-label={t("dialog.title")}
            className="flex max-h-[70vh] flex-col gap-4 overflow-auto"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-foreground">
                {t("dialog.title")}
              </h2>
              <CloseButton
                aria-label={t("dialog.close")}
                onPress={handleRequestClose}
                isDisabled={isSubmitting}
              />
            </div>

            {!canUseMcp ? (
              <Alert status="warning">
                <Alert.Title>{t("dialog.webOnly.title")}</Alert.Title>
                <Alert.Description>
                  {t("dialog.webOnly.description")}
                </Alert.Description>
              </Alert>
            ) : null}

            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <Select
                className="w-full"
                selectedKey={host}
                onSelectionChange={handleHostChange}
                isDisabled={!canUseMcp || isBusy}
                isOpen={isHostSelectOpen}
                onOpenChange={setIsHostSelectOpen}
              >
                <Label>{t("dialog.host.label")}</Label>
                <Select.Trigger className="mt-2 w-full">
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item
                      id="127.0.0.1"
                      textValue={t("dialog.host.localhost")}
                    >
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate">
                          {t("dialog.host.localhost")}
                        </span>
                        <Description className="text-xs text-default-500">
                          {t("dialog.host.localhostDesc")}
                        </Description>
                      </div>
                      <ListBox.ItemIndicator />
                    </ListBox.Item>

                    <ListBox.Item id="0.0.0.0" textValue={t("dialog.host.lan")}>
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate">{t("dialog.host.lan")}</span>
                        <Description className="text-xs text-default-500">
                          {t("dialog.host.lanDesc")}
                        </Description>
                      </div>
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  </ListBox>
                </Select.Popover>
                <Description className="mt-2">
                  {t("dialog.host.description")}
                </Description>
              </Select>

              <Select
                className="w-full"
                selectedKey={portMode}
                onSelectionChange={handlePortModeChange}
                isDisabled={!canUseMcp || isBusy}
                isOpen={isPortModeSelectOpen}
                onOpenChange={setIsPortModeSelectOpen}
              >
                <Label>{t("dialog.portMode.label")}</Label>
                <Select.Trigger className="mt-2 w-full">
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item
                      id="manual"
                      textValue={t("dialog.portMode.manual")}
                    >
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate">
                          {t("dialog.portMode.manual")}
                        </span>
                        <Description className="text-xs text-default-500">
                          {t("dialog.portMode.manualDesc")}
                        </Description>
                      </div>
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    <ListBox.Item
                      id="random"
                      textValue={t("dialog.portMode.random")}
                    >
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate">
                          {t("dialog.portMode.random")}
                        </span>
                        <Description className="text-xs text-default-500">
                          {t("dialog.portMode.randomDesc")}
                        </Description>
                      </div>
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  </ListBox>
                </Select.Popover>
                <Description className="mt-2">
                  {portMode === "random"
                    ? t("dialog.portMode.descriptionRandom")
                    : t("dialog.portMode.descriptionManual")}
                </Description>
              </Select>

              {portMode === "manual" ? (
                <TextField
                  isRequired
                  isInvalid={Boolean(errors.port)}
                  isDisabled={!canUseMcp || isBusy}
                >
                  <Label>{t("dialog.port.label")}</Label>
                  <div className="mt-2 flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <Input
                        type="number"
                        step="1"
                        inputMode="numeric"
                        value={port}
                        onChange={(event) =>
                          handlePortChange(event.target.value)
                        }
                        aria-label={t("dialog.port.label")}
                      />
                    </div>
                  </div>
                  {errors.port ? <FieldError>{errors.port}</FieldError> : null}
                </TextField>
              ) : null}

              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="tertiary"
                  onPress={handleRequestClose}
                  isDisabled={isBusy}
                >
                  {t("dialog.cancel")}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isDisabled={!isFormValid || isBusy}
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <Spinner size="sm" />
                      {t("dialog.start")}
                    </span>
                  ) : (
                    t("dialog.start")
                  )}
                </Button>
              </div>
            </form>
          </div>
        </Surface>
      </Dropdown.Popover>
    </Dropdown>
  );
}
