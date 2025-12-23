"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Dropdown,
  Spinner,
  TooltipContent,
  TooltipRoot,
  type ButtonProps,
} from "@heroui/react";
import { RotateCcw } from "lucide-react";
import { useAppTranslation } from "@/app/i18n/hooks";
import type { ModelConfig, ProviderConfig } from "@/app/types/chat";
import ModelComboBox from "./ModelComboBox";
import { useToast } from "@/app/components/toast";
import ModelIcon from "@/app/components/common/ModelIcon";
import ImageUploadButton from "@/components/chat/ImageUploadButton";
import { MAX_IMAGES_PER_MESSAGE } from "@/lib/attachment-converter";

interface ChatInputActionsProps {
  isSendDisabled: boolean;
  isChatStreaming: boolean;
  canSendNewMessage: boolean;
  lastMessageIsUser: boolean;
  isCompact?: boolean;
  onCancel?: () => void;
  onNewChat: () => void;
  onHistory: () => void;
  onRetry: () => void;
  onImageUpload?: (files: File[]) => void;
  modelSelectorProps: {
    providers: ProviderConfig[];
    models: ModelConfig[];
    selectedModelId: string | null;
    onSelectModel: (modelId: string) => Promise<void> | void;
    isDisabled: boolean;
    isLoading: boolean;
    modelLabel: string;
  };
}

export default function ChatInputActions({
  isSendDisabled,
  isChatStreaming,
  canSendNewMessage,
  lastMessageIsUser,
  isCompact,
  onCancel,
  onNewChat,
  onHistory,
  onRetry,
  onImageUpload,
  modelSelectorProps,
}: ChatInputActionsProps) {
  const { t } = useAppTranslation("chat");
  const {
    providers,
    models,
    selectedModelId,
    onSelectModel,
    isDisabled: isModelSelectorDisabled,
    isLoading: isModelSelectorLoading,
    modelLabel,
  } = modelSelectorProps;
  const { push } = useToast();
  const canCancel = Boolean(isChatStreaming && onCancel);
  const sendButtonVariant: ButtonProps["variant"] = canCancel
    ? "danger"
    : "primary";
  const sendButtonType = canCancel ? undefined : "submit";
  const getSendButtonDisabled = () => {
    if (canCancel) return false;
    if (isChatStreaming) return true;
    return isSendDisabled;
  };
  const sendButtonDisabled = getSendButtonDisabled();
  const [isModelPopoverOpen, setIsModelPopoverOpen] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);

  useEffect(() => {
    if (isModelSelectorDisabled) {
      setIsModelPopoverOpen(false);
    }
  }, [isModelSelectorDisabled]);

  const activeModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) ?? null,
    [models, selectedModelId],
  );

  const activeProvider = useMemo(
    () =>
      activeModel
        ? (providers.find(
            (provider) => provider.id === activeModel.providerId,
          ) ?? null)
        : null,
    [activeModel, providers],
  );

  const handleModelSelect = useCallback(
    async (modelId: string) => {
      if (isSelecting) return; // 防止重复点击

      setIsSelecting(true);

      // 先关闭 Dropdown
      setIsModelPopoverOpen(false);

      // 延迟执行，让 Dropdown 有时间完成关闭动画
      setTimeout(async () => {
        try {
          await onSelectModel(modelId);
        } catch (error) {
          push({
            variant: "danger",
            title: t("modelSelector.selectFailedTitle"),
            description:
              (error as Error)?.message ??
              t("modelSelector.selectFailedDescription"),
          });
        } finally {
          setIsSelecting(false);
        }
      }, 300);
    },
    [isSelecting, onSelectModel, push, t],
  );

  return (
    <div className="chat-input-actions">
      {/* 左侧按钮组 */}
      <div className="chat-actions-left">
        <TooltipRoot delay={0}>
          <Button
            size="sm"
            variant="tertiary"
            isIconOnly
            aria-label={t("aria.newChat")}
            onPress={onNewChat}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </Button>
          <TooltipContent placement="top">
            <p>{t("input.newChat")}</p>
          </TooltipContent>
        </TooltipRoot>

        <TooltipRoot delay={0}>
          <Button
            size="sm"
            variant="tertiary"
            isIconOnly
            aria-label={t("aria.history")}
            onPress={onHistory}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 3v5h5"></path>
              <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"></path>
              <path d="M12 7v5l4 2"></path>
            </svg>
          </Button>
          <TooltipContent placement="top">
            <p>{t("input.openHistory")}</p>
          </TooltipContent>
        </TooltipRoot>

        <TooltipRoot delay={0} isDisabled={!onImageUpload}>
          <ImageUploadButton
            onFiles={onImageUpload ?? (() => undefined)}
            disabled={isChatStreaming || !canSendNewMessage}
            maxFiles={MAX_IMAGES_PER_MESSAGE}
          />
          <TooltipContent placement="top">
            <p>上传图片</p>
          </TooltipContent>
        </TooltipRoot>
      </div>

      {/* 右侧按钮组 */}
      <div className="chat-actions-right">
        {lastMessageIsUser && !isChatStreaming && (
          <Button
            variant="secondary"
            size="sm"
            onPress={onRetry}
            aria-label={t("input.retry")}
          >
            <RotateCcw size={16} aria-hidden />
            {t("input.retry")}
          </Button>
        )}

        <Dropdown
          isOpen={isModelPopoverOpen}
          onOpenChange={setIsModelPopoverOpen}
        >
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="chat-model-button"
            isDisabled={isModelSelectorDisabled}
            isIconOnly={isCompact}
            aria-label={`${t("modelSelector.label")}: ${modelLabel}`}
          >
            {isModelSelectorLoading ? (
              <Spinner size="sm" />
            ) : (
              <ModelIcon
                size={16}
                modelId={selectedModelId}
                modelName={activeModel?.modelName || activeModel?.displayName}
                providerId={activeProvider?.id}
                providerType={activeProvider?.providerType ?? null}
                apiUrl={activeProvider?.apiUrl ?? null}
                className="text-primary"
              />
            )}
            <span className="chat-model-button__label">{modelLabel}</span>
          </Button>
          <Dropdown.Popover className="chat-model-popover" placement="top end">
            <ModelComboBox
              providers={providers}
              models={models}
              selectedModelId={selectedModelId}
              onSelect={handleModelSelect}
              disabled={isModelSelectorDisabled}
              isLoading={isModelSelectorLoading}
              isOpen={isModelPopoverOpen}
            />
          </Dropdown.Popover>
        </Dropdown>

        <TooltipRoot isDisabled={true} delay={0}>
          <Button
            type={sendButtonType}
            variant={sendButtonVariant}
            size="sm"
            isDisabled={sendButtonDisabled}
            onPress={canCancel ? onCancel : undefined}
          >
            {canCancel ? (
              // 取消图标（X）
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
            ) : (
              // 发送图标
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            )}
            {canCancel ? t("input.stop") : t("input.send")}
          </Button>
        </TooltipRoot>
      </div>
    </div>
  );
}
