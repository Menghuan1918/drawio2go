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

const validatePort = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (!trimmed) return "端口不能为空";

  const port = Number(trimmed);
  if (!Number.isInteger(port)) return "端口必须是整数";
  if (port < 8000 || port > 9000) return "端口范围必须在 8000-9000";

  return null;
};

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
  const { pushErrorToast, extractErrorMessage } = useOperationToast();

  const [host, setHost] = useState<McpHost>(DEFAULT_HOST);
  const [port, setPort] = useState<string>(String(DEFAULT_PORT));
  const [portMode, setPortMode] = useState<PortMode>(DEFAULT_PORT_MODE);
  const [errors, setErrors] = useState<FormErrors>({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPickingPort, setIsPickingPort] = useState(false);

  const canUseMcp = useMemo(() => (isOpen ? isElectronEnv() : true), [isOpen]);

  const isBusy = isSubmitting || isPickingPort;

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
    setIsPickingPort(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      resetState();
    }
  }, [isOpen, resetState]);

  const handlePortChange = useCallback((value: string) => {
    setPort(value);
    setErrors((prev) => {
      const message = validatePort(value);
      if (!message && !prev.port) return prev;
      const next: FormErrors = { ...prev };
      if (message) next.port = message;
      else delete next.port;
      return next;
    });
  }, []);

  const handlePickRandomPort = useCallback(async () => {
    if (!isElectronEnv()) return;
    if (isBusy) return;

    setIsPickingPort(true);
    try {
      const nextPort = await window.electronMcp?.getRandomPort?.();
      if (!Number.isInteger(nextPort)) {
        throw new Error("Random port is invalid");
      }
      handlePortChange(String(nextPort));
    } catch (error) {
      const message = extractErrorMessage(error) ?? "未知错误";
      pushErrorToast(`获取随机端口失败：${message}`);
    } finally {
      setIsPickingPort(false);
    }
  }, [extractErrorMessage, handlePortChange, isBusy, pushErrorToast]);

  const handleHostChange = useCallback((value: Selection | Key | null) => {
    const selection = normalizeSelection(value);
    const key = selection ? extractSingleKey(selection) : null;
    if (key === "127.0.0.1" || key === "0.0.0.0") {
      setHost(key as McpHost);
    }
  }, []);

  const handlePortModeChange = useCallback(
    (value: Selection | Key | null) => {
      const selection = normalizeSelection(value);
      const key = selection ? extractSingleKey(selection) : null;
      if (key !== "manual" && key !== "random") return;

      const nextMode = key as PortMode;
      setPortMode(nextMode);

      if (nextMode === "random") {
        void handlePickRandomPort();
      }
    },
    [handlePickRandomPort],
  );

  const isFormValid = useMemo(() => {
    if (!canUseMcp) return false;
    return validatePort(port) === null;
  }, [canUseMcp, port]);

  const submit = useCallback(async () => {
    if (isBusy) return;
    if (!canUseMcp) return;

    const portError = validatePort(port);
    if (portError) {
      setErrors((prev) => ({ ...prev, port: portError }));
      return;
    }

    const config: McpConfig = { host, port: Number(port) };

    setErrors({});
    onOpenChange(false);
    setIsSubmitting(true);

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
  }, [canUseMcp, host, isBusy, onConfirm, onOpenChange, port]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void submit();
    },
    [submit],
  );

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
      >
        <Surface className="w-full rounded-[var(--radius-lg)] bg-content1 p-4 shadow-[var(--shadow-4)] outline-none">
          <div
            aria-label="MCP 配置"
            className="flex max-h-[70vh] flex-col gap-4 overflow-auto"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-foreground">
                MCP 配置
              </h2>
              <CloseButton
                aria-label="关闭"
                onPress={handleRequestClose}
                isDisabled={isSubmitting}
              />
            </div>

            {!canUseMcp ? (
              <Alert status="warning">
                <Alert.Title>仅支持 APP 端</Alert.Title>
                <Alert.Description>
                  Web 端无法启动 MCP 服务器，请在 Electron 应用中使用该功能。
                </Alert.Description>
              </Alert>
            ) : null}

            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <Select
                className="w-full"
                selectedKey={host}
                onSelectionChange={handleHostChange}
                isDisabled={!canUseMcp || isBusy}
              >
                <Label>监听地址</Label>
                <Select.Trigger className="mt-2 w-full">
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item id="127.0.0.1" textValue="127.0.0.1（本地）">
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate">127.0.0.1（本地）</span>
                        <Description className="text-xs text-default-500">
                          仅本机可访问，安全性更高
                        </Description>
                      </div>
                      <ListBox.ItemIndicator />
                    </ListBox.Item>

                    <ListBox.Item id="0.0.0.0" textValue="0.0.0.0（局域网）">
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate">0.0.0.0（局域网）</span>
                        <Description className="text-xs text-default-500">
                          局域网设备可访问
                        </Description>
                      </div>
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  </ListBox>
                </Select.Popover>
                <Description className="mt-2">
                  选择 MCP 服务绑定的 IP 地址。
                </Description>
              </Select>

              {host === "0.0.0.0" ? (
                <Alert status="warning">
                  <Alert.Title>安全提示</Alert.Title>
                  <Alert.Description>
                    绑定到 0.0.0.0 会让同一局域网内设备可访问 MCP
                    接口，请确保网络可信，并避免在公共 Wi‑Fi 下开启。
                  </Alert.Description>
                </Alert>
              ) : null}

              <Select
                className="w-full"
                selectedKey={portMode}
                onSelectionChange={handlePortModeChange}
                isDisabled={!canUseMcp || isBusy}
              >
                <Label>端口模式</Label>
                <Select.Trigger className="mt-2 w-full">
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item id="manual" textValue="指定">
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate">指定</span>
                        <Description className="text-xs text-default-500">
                          手动输入端口
                        </Description>
                      </div>
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    <ListBox.Item id="random" textValue="随机">
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate">随机</span>
                        <Description className="text-xs text-default-500">
                          自动选择可用端口
                        </Description>
                      </div>
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  </ListBox>
                </Select.Popover>
                <Description className="mt-2">
                  选择“随机端口”会自动选择 8000-9000 范围内的可用端口。
                </Description>
              </Select>

              <TextField
                isRequired
                isInvalid={Boolean(errors.port)}
                isDisabled={!canUseMcp || isBusy}
              >
                <Label>端口</Label>
                <div className="mt-2 flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <Input
                      type="number"
                      step="1"
                      min={8000}
                      max={9000}
                      inputMode="numeric"
                      value={port}
                      onChange={(event) => handlePortChange(event.target.value)}
                      aria-label="端口"
                      disabled={portMode === "random"}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onPress={handlePickRandomPort}
                    isDisabled={!canUseMcp || isBusy}
                  >
                    {portMode === "random" ? "重新生成" : "随机端口"}
                  </Button>
                </div>
                <Description>范围 8000-9000</Description>
                {errors.port ? <FieldError>{errors.port}</FieldError> : null}
              </TextField>

              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="tertiary"
                  onPress={handleRequestClose}
                  isDisabled={isBusy}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isDisabled={!isFormValid || isBusy}
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <Spinner size="sm" />
                      启动
                    </span>
                  ) : (
                    "启动"
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
