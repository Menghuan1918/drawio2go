"use client";

import {
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { TextArea } from "@heroui/react";
import { ImagePlus } from "lucide-react";
import {
  type LLMConfig,
  type ModelConfig,
  type ProviderConfig,
} from "@/app/types/chat";
import ChatInputActions from "./ChatInputActions";
import { useAppTranslation, useI18n } from "@/app/i18n/hooks";
import { useToast } from "@/app/components/toast";
import {
  useImageAttachments,
  type AttachmentItem,
} from "@/hooks/useImageAttachments";
import { useDropzone } from "@/hooks/useDropzone";
import ImagePreviewBar from "@/components/chat/ImagePreviewBar";
import { toErrorString } from "@/app/lib/error-handler";

const MIN_BASE_TEXTAREA_HEIGHT = 60;

interface ChatInputAreaProps {
  input: string;
  setInput: (value: string) => void;
  isChatStreaming: boolean;
  configLoading: boolean;
  llmConfig: LLMConfig | null;
  canSendNewMessage: boolean;
  lastMessageIsUser: boolean;
  isOnline: boolean;
  isSocketConnected: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
  onNewChat: () => void;
  onHistory: () => void;
  onRetry: () => void;
  imageAttachments?: ReturnType<typeof useImageAttachments>;
  onAttachmentsChange?: (attachments: AttachmentItem[]) => void;
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

export default function ChatInputArea({
  input,
  setInput,
  isChatStreaming,
  configLoading,
  llmConfig,
  canSendNewMessage,
  lastMessageIsUser,
  isOnline,
  isSocketConnected,
  onSubmit,
  onCancel,
  onNewChat,
  onHistory,
  onRetry,
  imageAttachments,
  onAttachmentsChange,
  modelSelectorProps,
}: ChatInputAreaProps) {
  const { t } = useAppTranslation("chat");
  const { t: tCommon } = useI18n();
  const { push } = useToast();
  const textareaContainerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const baseHeightRef = useRef<number | null>(null);
  const internalAttachments = useImageAttachments();
  const attachments = imageAttachments ?? internalAttachments;
  const {
    attachments: attachmentItems,
    addFiles,
    removeAttachment,
    clearAll,
    hasAttachments,
  } = attachments;
  const isInputDisabled =
    configLoading ||
    !llmConfig ||
    !canSendNewMessage ||
    !isOnline ||
    !isSocketConnected;
  const isSendDisabled =
    !input.trim() ||
    isChatStreaming ||
    configLoading ||
    !llmConfig ||
    !canSendNewMessage ||
    !isOnline ||
    !isSocketConnected;

  useEffect(() => {
    onAttachmentsChange?.(attachmentItems);
  }, [attachmentItems, onAttachmentsChange]);

  const handleAddImages = useCallback(
    async (files: File[]) => {
      if (isInputDisabled) return;

      try {
        const added = await addFiles(files);
        if (!added.length) return;

        const failed = added.filter((item) => item.status === "error");
        if (failed.length > 0) {
          const success = added.length - failed.length;
          push({
            variant: success > 0 ? "warning" : "danger",
            title: tCommon("toasts.imageUploadPartialFailedTitle"),
            description: tCommon("toasts.imageUploadPartialFailed", {
              success,
              failed: failed.length,
            }),
          });
        }
      } catch (error) {
        push({
          variant: "danger",
          title: tCommon("toasts.imageUploadFailedTitle"),
          description: tCommon("toasts.imageUploadFailed", {
            error: toErrorString(error),
          }),
        });
      }
    },
    [addFiles, isInputDisabled, push, tCommon],
  );

  const handleImageUpload = useCallback(
    (files: File[]) => {
      void handleAddImages(files);
    },
    [handleAddImages],
  );

  const { isDraggingFiles, rootProps } = useDropzone({
    onFiles: handleAddImages,
    disabled: isInputDisabled,
  });

  const handlePaste = useCallback(
    async (event: ClipboardEvent<HTMLTextAreaElement>) => {
      if (isInputDisabled) return;

      const items = event.clipboardData.items;
      const imageFiles: File[] = [];

      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        event.preventDefault(); // 阻止粘贴文本
        await handleAddImages(imageFiles);
      }
    },
    [handleAddImages, isInputDisabled],
  );

  const handleSubmitWrapper = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      try {
        await onSubmit(event);
      } finally {
        if (hasAttachments) {
          clearAll();
        }
      }
    },
    [clearAll, hasAttachments, onSubmit],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!isSendDisabled) {
        const formEvent = new Event("submit", {
          bubbles: true,
          cancelable: true,
        });
        Object.defineProperty(formEvent, "target", {
          value: event.currentTarget.form,
          enumerable: true,
        });
        void handleSubmitWrapper(
          formEvent as unknown as FormEvent<HTMLFormElement>,
        );
      }
    }
  };

  useEffect(() => {
    const textarea =
      textareaRef.current ??
      textareaContainerRef.current?.querySelector("textarea");
    if (!textarea) return;
    textareaRef.current = textarea;

    // 重置为 auto 以便获取真实 scrollHeight（删除内容时可回落）
    textarea.style.height = "auto";

    const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight || "0");
    if (!baseHeightRef.current) {
      const defaultHeight =
        !Number.isNaN(lineHeight) && lineHeight > 0
          ? lineHeight * 3 // 默认 3 行高度
          : Math.max(textarea.scrollHeight, MIN_BASE_TEXTAREA_HEIGHT);
      baseHeightRef.current = Math.max(defaultHeight, MIN_BASE_TEXTAREA_HEIGHT);
    }

    const minHeight = baseHeightRef.current;
    const maxHeight = baseHeightRef.current * 4;
    const nextHeight = Math.min(
      Math.max(textarea.scrollHeight, minHeight),
      maxHeight,
    );

    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [input]);

  return (
    <div
      className="chat-input-area relative"
      ref={textareaContainerRef}
      {...rootProps}
    >
      <form
        onSubmit={handleSubmitWrapper}
        className="chat-input-container gap-2"
      >
        {hasAttachments ? (
          <ImagePreviewBar
            attachments={attachmentItems}
            onRemove={removeAttachment}
          />
        ) : null}

        {/* 多行文本输入框 */}
        <TextArea
          placeholder={t("input.placeholder")}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={isInputDisabled}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          className="w-full"
          aria-label={t("aria.input")}
        />

        {!isSocketConnected ? (
          <div className="chat-network-status" role="status" aria-live="polite">
            ⚠️ {t("status.socketDisconnected")} ·{" "}
            {t("status.socketRequiredForChat")}
          </div>
        ) : null}

        {isSocketConnected && !isOnline && (
          <div className="chat-network-status" role="status" aria-live="polite">
            ⚠️ {t("status.networkOfflineShort", "网络已断开")} ·{" "}
            {t("status.networkDisconnectedHint")}
          </div>
        )}

        {/* 按钮组 */}
        <ChatInputActions
          isSendDisabled={isSendDisabled}
          isChatStreaming={isChatStreaming}
          canSendNewMessage={canSendNewMessage}
          lastMessageIsUser={lastMessageIsUser}
          isOnline={isOnline}
          isSocketConnected={isSocketConnected}
          onCancel={onCancel}
          onNewChat={onNewChat}
          onHistory={onHistory}
          onRetry={onRetry}
          onImageUpload={handleImageUpload}
          modelSelectorProps={modelSelectorProps}
        />
      </form>

      <div
        aria-hidden="true"
        className={[
          "pointer-events-none absolute inset-0 z-10 flex items-center justify-center",
          "rounded-lg border-2 border-dashed border-blue-500 bg-blue-500/10",
          "transition-[opacity,transform] duration-150 ease-out",
          isDraggingFiles ? "opacity-100 scale-100" : "opacity-0 scale-95",
        ].join(" ")}
      >
        <div className="flex items-center gap-2 rounded-md bg-white/70 px-4 py-3 text-blue-700 shadow-sm backdrop-blur dark:bg-black/40 dark:text-blue-200">
          <ImagePlus size={18} aria-hidden />
          <span className="text-sm font-medium">拖拽图片到此处上传</span>
        </div>
      </div>
    </div>
  );
}
