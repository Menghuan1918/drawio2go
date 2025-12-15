"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type FormEvent,
} from "react";
import { Alert } from "@heroui/react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  useChatLock,
  useNetworkStatus,
  useChatSessionsController,
  useLLMConfig,
  useOperationToast,
} from "@/app/hooks";
import { useAlertDialog } from "@/app/components/alert";
import { useI18n } from "@/app/i18n/hooks";
import { DEFAULT_PROJECT_UUID, getStorage } from "@/app/lib/storage";
import type { ChatUIMessage, MessageMetadata } from "@/app/types/chat";
import { DEFAULT_LLM_CONFIG } from "@/app/lib/config-utils";
import {
  convertUIMessageToCreateInput,
  fingerprintMessage,
} from "@/app/lib/chat-session-service";
import { generateUUID } from "@/app/lib/utils";
import {
  cancelChatRun,
  clearActiveChatRun,
  setActiveChatRun,
} from "@/app/lib/chat-run-registry";
import { useImageAttachments } from "@/hooks/useImageAttachments";
import {
  convertAttachmentItemToImagePart,
  fileToDataUrl,
  uploadImageAttachment,
} from "@/lib/image-message-utils";

import ChatHistoryView from "./chat/ChatHistoryView";
import ChatShell from "./chat/ChatShell";
import MessagePane from "./chat/MessagePane";
import Composer from "./chat/Composer";

// 导出工具
import { exportBlobContent } from "./chat/utils/fileExport";
import { createLogger } from "@/lib/logger";
import {
  hasConversationIdMetadata,
  isAbnormalExitNoticeMessage,
} from "@/app/lib/type-guards";

const logger = createLogger("ChatSidebar");

const hasImageParts = (msg: unknown): boolean => {
  if (!msg || typeof msg !== "object") return false;
  const parts = (msg as { parts?: unknown }).parts;
  if (!Array.isArray(parts)) return false;
  return parts.some(
    (part) =>
      typeof part === "object" &&
      part !== null &&
      (part as { type?: unknown }).type === "image",
  );
};

const runWithConcurrency = async <T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array(items.length) as R[];
  let cursor = 0;

  const workers = new Array(Math.min(limit, items.length))
    .fill(0)
    .map(async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await fn(items[index]);
      }
    });

  await Promise.all(workers);
  return results;
};

interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentProjectId?: string;
  isSocketConnected?: boolean;
}

// ========== 主组件 ==========

export default function ChatSidebar({
  isOpen = true,
  currentProjectId,
  isSocketConnected = true,
}: ChatSidebarProps) {
  type UseChatMessage = UIMessage<MessageMetadata>;

  const [input, setInput] = useState("");
  const [expandedToolCalls, setExpandedToolCalls] = useState<
    Record<string, boolean>
  >({});
  const [expandedThinkingBlocks, setExpandedThinkingBlocks] = useState<
    Record<string, boolean>
  >({});
  const [currentView, setCurrentView] = useState<"chat" | "history">("chat");
  const imageAttachments = useImageAttachments();

  // ========== Hook 聚合 ==========
  const { t, i18n } = useI18n();
  const isI18nReady = i18n.isInitialized && Boolean(i18n.resolvedLanguage);
  const { open: openAlertDialog, close: closeAlertDialog } = useAlertDialog();
  const { pushErrorToast, showNotice, extractErrorMessage } =
    useOperationToast();

  const {
    llmConfig,
    configLoading,
    selectorLoading,
    providers,
    models,
    selectedModelId,
    selectedModelLabel,
    loadModelSelector,
    handleModelChange,
  } = useLLMConfig();

  const [showSocketRecoveryHint, setShowSocketRecoveryHint] = useState(false);
  const [showOnlineRecoveryHint, setShowOnlineRecoveryHint] = useState(false);

  const translate = useCallback(
    (key: string, fallback?: string) => t(key, fallback ?? key),
    [t],
  );

  const resolvedProjectUuid = currentProjectId ?? DEFAULT_PROJECT_UUID;
  const { canChat, lockHolder, acquireLock, releaseLock } =
    useChatLock(resolvedProjectUuid);
  const { isOnline, offlineReason } = useNetworkStatus({
    socketConnected: isSocketConnected,
  });

  const truncatedLockHolder = useMemo(() => {
    if (!lockHolder) return null;
    if (lockHolder.length <= 16) return lockHolder;
    return `${lockHolder.slice(0, 8)}...${lockHolder.slice(-4)}`;
  }, [lockHolder]);

  const offlineReasonLabel = useMemo(() => {
    switch (offlineReason) {
      case "browser-offline":
        return t("chat:status.networkOfflineBrowser", "浏览器离线");
      case "ping-fail":
        return t(
          "chat:status.networkOfflinePing",
          "心跳失败（可能无外网或被防火墙拦截）",
        );
      case "socket-disconnect":
        return t("chat:status.networkOfflineSocket", "Socket 连接已断开");
      default:
        return null;
    }
  }, [offlineReason, t]);

  const lockBlockedTitle = useMemo(
    () => t("chat:messages.chatLockedTitle", "聊天被其他标签页占用"),
    [t],
  );
  const lockBlockedMessage = useMemo(
    () => t("chat:messages.chatLockedHint", "当前项目正在其他标签页中进行聊天"),
    [t],
  );

  // ========== 引用 ==========
  const sendingSessionIdRef = useRef<string | null>(null);
  const sendingChatRunIdRef = useRef<string | null>(null);
  const imageDataUrlCacheRef = useRef<Map<string, string>>(new Map());
  const imageDataUrlPendingRef = useRef<Map<string, Promise<string | null>>>(
    new Map(),
  );
  const alertOwnerRef = useRef<
    "socket" | "single-delete" | "batch-delete" | null
  >(null);
  const socketAlertSeenRef = useRef(false);
  const socketStopHandledRef = useRef(false);
  const previousSocketStatusRef = useRef<boolean | null>(null);
  const pageUnloadHandledRef = useRef(false);
  const streamingFlagCacheRef = useRef<Record<string, boolean>>({});
  const forceStopReasonRef = useRef<"sidebar" | "history" | null>(null);
  const wasOfflineRef = useRef(false);
  const previousOnlineStatusRef = useRef<boolean | null>(null);
  const reasoningTimersRef = useRef<Map<string, number>>(new Map());

  // ========== 派生状态 ==========
  const fallbackModelName = useMemo(
    () => llmConfig?.modelName ?? DEFAULT_LLM_CONFIG.modelName,
    [llmConfig],
  );

  const ensureMessageMetadata = useCallback(
    (message: ChatUIMessage): ChatUIMessage => {
      const rawMetadata: MessageMetadata = message.metadata ?? {};

      if (hasConversationIdMetadata(message)) {
        logger.warn(
          "[ChatSidebar] 忽略消息 metadata 中的 conversationId 字段",
          {
            messageId: message.id,
          },
        );
      }

      const normalizedMetadata: MessageMetadata = {
        modelName:
          typeof rawMetadata.modelName === "string"
            ? rawMetadata.modelName
            : (rawMetadata.modelName ?? null),
        createdAt:
          typeof rawMetadata.createdAt === "number"
            ? rawMetadata.createdAt
            : undefined,
        isCancelled: rawMetadata.isCancelled === true,
        isDisconnected: rawMetadata.isDisconnected === true,
        isAbnormalExitNotice: rawMetadata.isAbnormalExitNotice === true,
        disconnectReason:
          typeof rawMetadata.disconnectReason === "string"
            ? rawMetadata.disconnectReason
            : undefined,
      };

      const resolvedMetadata: MessageMetadata = {
        ...normalizedMetadata,
        modelName: normalizedMetadata.modelName ?? fallbackModelName,
        createdAt: normalizedMetadata.createdAt ?? Date.now(),
      };

      if (
        !hasConversationIdMetadata(message) &&
        message.metadata?.modelName === resolvedMetadata.modelName &&
        message.metadata?.createdAt === resolvedMetadata.createdAt &&
        message.metadata?.isAbnormalExitNotice ===
          resolvedMetadata.isAbnormalExitNotice &&
        message.metadata?.isCancelled === resolvedMetadata.isCancelled &&
        message.metadata?.isDisconnected === resolvedMetadata.isDisconnected &&
        message.metadata?.disconnectReason === resolvedMetadata.disconnectReason
      ) {
        return message;
      }

      return {
        ...message,
        metadata: resolvedMetadata,
      };
    },
    [fallbackModelName],
  );

  const handleSaveError = useCallback(
    (message: string) => {
      const normalizedMessage = message?.trim() ?? "";
      if (normalizedMessage) {
        pushErrorToast(normalizedMessage);
      }
    },
    [pushErrorToast],
  );

  const {
    conversations,
    activeConversationId,
    setActiveConversationId,
    conversationMessages,
    abnormalExitConversations,
    chatService,
    createConversation,
    ensureMessagesForConversation,
    resolveConversationId,
    removeConversationsFromState,
    handleAbnormalExitIfNeeded,
    markConversationAsStreaming,
    markConversationAsCompleted,
    exportConversations,
    batchDeleteConversations,
  } = useChatSessionsController({
    currentProjectId,
    t: translate,
    ensureMessageMetadata,
    onSaveError: handleSaveError,
  });

  const initialMessages = useMemo<ChatUIMessage[]>(() => {
    return activeConversationId
      ? conversationMessages[activeConversationId] || []
      : [];
  }, [activeConversationId, conversationMessages]);

  useEffect(() => {
    console.info("[ChatSidebar] calling loadModelSelector on mount");
    void loadModelSelector();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Web 端偶发出现模型列表为空（IndexedDB 数据已存在但未加载到状态）。
  // 当侧栏重新展开或依然为空时主动重载一次，避免卡在“暂无可用模型”空态。
  useEffect(() => {
    if (!isOpen) return;
    if (providers.length === 0 || models.length === 0) {
      void loadModelSelector({ preserveSelection: true });
    }
  }, [isOpen, providers.length, models.length, loadModelSelector]);

  useEffect(() => {
    chatService.handleConversationSwitch(activeConversationId);
  }, [chatService, activeConversationId]);

  useEffect(() => {
    if (!activeConversationId) return;
    void handleAbnormalExitIfNeeded(activeConversationId);
  }, [activeConversationId, handleAbnormalExitIfNeeded]);

  useEffect(() => {
    if (typeof localStorage === "undefined") return;

    const recoverUnloadData = async () => {
      const keys = Object.keys(localStorage).filter((key) =>
        key.startsWith("chat:unload:"),
      );

      for (const key of keys) {
        try {
          const raw = localStorage.getItem(key);
          if (!raw) {
            localStorage.removeItem(key);
            continue;
          }

          const parsed = JSON.parse(raw) as {
            conversationId?: string;
            messages?: ChatUIMessage[];
          };

          if (
            !parsed ||
            typeof parsed.conversationId !== "string" ||
            !Array.isArray(parsed.messages)
          ) {
            localStorage.removeItem(key);
            continue;
          }

          logger.info("[ChatSidebar] 恢复卸载时未保存的消息", { key });

          await chatService.saveNow(parsed.conversationId, parsed.messages, {
            resolveConversationId,
            onConversationResolved: (resolvedId) => {
              // eslint-disable-next-line sonarjs/no-nested-functions -- setState 函数式更新需要回调，且此处嵌套层级较深
              setActiveConversationId((prev) => prev ?? resolvedId);
            },
          });

          localStorage.removeItem(key);
        } catch (error) {
          logger.error("[ChatSidebar] 恢复卸载数据失败", { key, error });
          localStorage.removeItem(key);
        }
      }
    };

    void recoverUnloadData();
  }, [chatService, resolveConversationId, setActiveConversationId]);

  // ========== useChat 集成 ==========
  const chatTransport = useMemo(() => {
    return new DefaultChatTransport<UseChatMessage>({
      prepareSendMessagesRequest: async (options) => {
        const getOrCreateDataUrl = async (
          attachmentId: string,
        ): Promise<string | null> => {
          const cached = imageDataUrlCacheRef.current.get(attachmentId);
          if (cached) {
            return cached;
          }

          const pending = imageDataUrlPendingRef.current.get(attachmentId);
          if (pending) {
            return await pending;
          }

          // eslint-disable-next-line sonarjs/no-nested-functions -- 深层异步 IIFE 便于复用闭包变量并保持逻辑集中
          const request = (async () => {
            try {
              const storage = await getStorage();
              const attachment = await storage.getAttachment(attachmentId);
              if (!attachment) return null;

              const mimeType =
                attachment.mime_type || "application/octet-stream";
              const blobData = attachment.blob_data as unknown;

              if (blobData instanceof Blob) {
                const dataUrl = await fileToDataUrl(blobData);
                imageDataUrlCacheRef.current.set(attachmentId, dataUrl);
                return dataUrl;
              }

              if (attachment.file_path && window.electronFS?.readFile) {
                const buffer = await window.electronFS.readFile(
                  attachment.file_path,
                );
                const blob = new Blob([buffer], { type: mimeType });
                const dataUrl = await fileToDataUrl(blob);
                imageDataUrlCacheRef.current.set(attachmentId, dataUrl);
                return dataUrl;
              }
            } catch (error) {
              logger.warn("[ChatSidebar] 读取附件 dataUrl 失败，已跳过", {
                attachmentId,
                error,
              });
            }

            return null;
          })();

          imageDataUrlPendingRef.current.set(attachmentId, request);
          // eslint-disable-next-line sonarjs/no-nested-functions -- finally 回调需要捕获 attachmentId/request 做一致性清理
          request.finally(() => {
            if (imageDataUrlPendingRef.current.get(attachmentId) === request) {
              imageDataUrlPendingRef.current.delete(attachmentId);
            }
          });

          return await request;
        };

        const fillDataUrlIfMissing = async (part: unknown) => {
          if (!part || typeof part !== "object") return part;
          const record = part as Record<string, unknown>;
          if (record.type !== "image") return part;
          if (typeof record.dataUrl === "string" && record.dataUrl.trim()) {
            return part;
          }

          const attachmentId =
            typeof record.attachmentId === "string" ? record.attachmentId : "";
          if (!attachmentId) {
            return part;
          }

          const dataUrl = await getOrCreateDataUrl(attachmentId);
          if (!dataUrl) return part;

          return { ...record, dataUrl };
        };

        const concurrency = 5;

        const missingAttachmentIds = new Set<string>();
        for (const msg of options.messages) {
          const parts = (msg as { parts?: unknown }).parts;
          if (!Array.isArray(parts)) continue;
          for (const part of parts) {
            if (
              typeof part === "object" &&
              part !== null &&
              (part as { type?: unknown }).type === "image"
            ) {
              const record = part as Record<string, unknown>;
              const hasDataUrl =
                typeof record.dataUrl === "string" && record.dataUrl.trim();
              if (hasDataUrl) continue;
              const attachmentId =
                typeof record.attachmentId === "string"
                  ? record.attachmentId
                  : "";
              if (attachmentId) missingAttachmentIds.add(attachmentId);
            }
          }
        }

        const uniqueMissing = Array.from(missingAttachmentIds);
        if (uniqueMissing.length > 0) {
          await runWithConcurrency(
            uniqueMissing,
            concurrency,
            getOrCreateDataUrl,
          );
        }

        const nextMessages = await Promise.all(
          options.messages.map(async (msg) => {
            if (!hasImageParts(msg)) return msg;
            const parts = (msg as { parts?: unknown }).parts;
            if (!Array.isArray(parts)) return msg;

            const nextParts = await Promise.all(
              parts.map(fillDataUrlIfMissing),
            );
            return {
              ...msg,
              parts: nextParts,
            } as unknown as UseChatMessage;
          }),
        );

        return {
          body: {
            ...(options.body ?? {}),
            messages: nextMessages,
          },
        };
      },
    });
  }, []);

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    error: chatError,
  } = useChat<UseChatMessage>({
    id: activeConversationId || "default",
    messages: initialMessages as unknown as UseChatMessage[],
    transport: chatTransport,
    onFinish: async ({ messages: finishedMessages }) => {
      const targetSessionId = sendingSessionIdRef.current;

      try {
        if (!targetSessionId) {
          logger.error("[ChatSidebar] onFinish: 没有记录的目标会话ID");
          return;
        }

        await chatService.saveNow(
          targetSessionId,
          finishedMessages as unknown as ChatUIMessage[],
          {
            forceTitleUpdate: true,
            resolveConversationId,
            onConversationResolved: (resolvedId) => {
              setActiveConversationId(resolvedId);
            },
          },
        );
      } catch (error) {
        logger.error("[ChatSidebar] 保存消息失败:", error);
      } finally {
        const runId = sendingChatRunIdRef.current;
        if (targetSessionId) {
          void updateStreamingFlag(targetSessionId, false);
          if (runId) {
            clearActiveChatRun(targetSessionId, runId);
          }
        }
        sendingSessionIdRef.current = null;
        sendingChatRunIdRef.current = null;
        releaseLock();
      }
    },
  });

  // 使用 ref 缓存 setMessages，避免因为引用变化导致依赖效应重复执行
  const setMessagesRef = useRef(setMessages);
  // 双向指纹缓存 + 来源标记：阻断存储 ↔ useChat 间的循环同步
  const lastSyncedToUIRef = useRef<Record<string, string[]>>({});
  const lastSyncedToStoreRef = useRef<Record<string, string[]>>({});
  const applyingFromStorageRef = useRef(false);

  const clearSyncedFingerprints = useCallback((ids: string[]) => {
    ids.forEach((id) => {
      delete lastSyncedToUIRef.current[id];
      delete lastSyncedToStoreRef.current[id];
    });
  }, []);

  useEffect(() => {
    setMessagesRef.current = setMessages;
  }, [setMessages]);

  const isChatStreaming = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (!isChatStreaming) {
      forceStopReasonRef.current = null;
    }
  }, [isChatStreaming]);

  const displayMessages = useMemo(
    () => messages.map(ensureMessageMetadata),
    [messages, ensureMessageMetadata],
  );

  useEffect(() => {
    const activeKeys = new Set<string>();

    messages.forEach((msg) => {
      if (msg.role !== "assistant" || !Array.isArray(msg.parts)) return;

      msg.parts.forEach((part, index) => {
        if (part.type !== "reasoning") return;

        const key = `${msg.id}-${index}`;
        activeKeys.add(key);

        const state = (part as { state?: string }).state;
        const durationMs = (part as { durationMs?: number }).durationMs;

        if (state === "streaming" && !reasoningTimersRef.current.has(key)) {
          reasoningTimersRef.current.set(key, Date.now());
        }

        if (state === "complete") {
          if (
            durationMs == null &&
            reasoningTimersRef.current.has(key) &&
            typeof reasoningTimersRef.current.get(key) === "number"
          ) {
            const startTime = reasoningTimersRef.current.get(key)!;
            const computedDuration = Math.max(0, Date.now() - startTime);

            // eslint-disable-next-line sonarjs/no-nested-functions -- setMessages 函数式更新需要回调，且此处嵌套层级较深
            setMessages((prev) => {
              const messageIndex = prev.findIndex((item) => item.id === msg.id);
              if (messageIndex === -1) return prev;

              const targetMessage = prev[messageIndex];
              const nextParts = Array.isArray(targetMessage.parts)
                ? [...targetMessage.parts]
                : [];

              if (
                nextParts[index]?.type !== "reasoning" ||
                (nextParts[index] as { durationMs?: number }).durationMs != null
              ) {
                return prev;
              }

              nextParts[index] = {
                ...nextParts[index],
                durationMs: computedDuration,
              } as unknown as UseChatMessage["parts"][number];

              const nextMessages = [...prev];
              nextMessages[messageIndex] = {
                ...targetMessage,
                parts: nextParts,
              };
              return nextMessages;
            });
          }

          reasoningTimersRef.current.delete(key);
        }
      });
    });

    reasoningTimersRef.current.forEach((_value, key) => {
      if (!activeKeys.has(key)) {
        reasoningTimersRef.current.delete(key);
      }
    });
  }, [messages, setMessages]);

  const lastMessageIsUser = useMemo(() => {
    if (!displayMessages || displayMessages.length === 0) return false;
    const lastMsg = displayMessages[displayMessages.length - 1];
    return lastMsg.role === "user";
  }, [displayMessages]);

  const canSendNewMessage = useMemo(() => {
    if (!canChat) return false;
    if (isChatStreaming) return true;
    return !lastMessageIsUser;
  }, [canChat, isChatStreaming, lastMessageIsUser]);

  const activeConversationHasAbnormalExit = useMemo(() => {
    if (!activeConversationId) return false;
    return abnormalExitConversations.has(activeConversationId);
  }, [abnormalExitConversations, activeConversationId]);

  const areFingerprintsEqual = useCallback(
    (a: string[] | undefined, b: string[] | undefined) => {
      if (!a || !b) return false;
      if (a.length !== b.length) return false;
      return a.every((fp, index) => fp === b[index]);
    },
    [],
  );

  const updateStreamingFlag = useCallback(
    async (
      conversationId: string | null,
      isStreaming: boolean,
      options?: { syncOnly?: boolean },
    ) => {
      if (!conversationId) return;

      // 先做同步标记，避免卸载时异步任务被浏览器中断
      streamingFlagCacheRef.current[conversationId] = isStreaming;
      if (options?.syncOnly) return;

      try {
        const resolvedId = await resolveConversationId(conversationId);
        if (isStreaming) {
          await markConversationAsStreaming(resolvedId);
        } else {
          await markConversationAsCompleted(resolvedId);
        }
      } catch (error) {
        logger.error("[ChatSidebar] 更新流式状态失败", {
          conversationId,
          isStreaming,
          error,
        });
      }
    },
    [
      markConversationAsCompleted,
      markConversationAsStreaming,
      resolveConversationId,
    ],
  );

  const cancelChatRunOnServer = useCallback(
    (chatRunId: string, reason: string) => {
      const normalizedChatRunId = chatRunId.trim();
      const normalizedReason = reason.trim() || "user_cancelled";
      if (!normalizedChatRunId) return;

      fetch("/api/chat/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chatRunId: normalizedChatRunId,
          reason: normalizedReason,
        }),
        keepalive: true,
      }).catch((error) => {
        logger.debug("[ChatSidebar] 取消上报失败（可忽略）", {
          chatRunId: normalizedChatRunId,
          reason: normalizedReason,
          error,
        });
      });
    },
    [],
  );

  useEffect(() => {
    const previousSocketStatus = previousSocketStatusRef.current;
    const socketStatusChanged = previousSocketStatus !== isSocketConnected;
    previousSocketStatusRef.current = isSocketConnected;

    const handleSocketDisconnected = () => {
      if (socketStopHandledRef.current || !isChatStreaming) return;

      socketStopHandledRef.current = true;
      logger.warn("[ChatSidebar] Socket 断开，停止聊天请求");

      const runId = sendingChatRunIdRef.current;
      const targetConversationId =
        activeConversationId ?? sendingSessionIdRef.current;

      if (runId) {
        cancelChatRun(runId);
        if (targetConversationId) {
          clearActiveChatRun(targetConversationId, runId);
        }
        cancelChatRunOnServer(runId, "socket_disconnected");
      }

      stop();
      releaseLock();

      if (targetConversationId) {
        updateStreamingFlag(targetConversationId, false).catch((error) => {
          logger.error("[ChatSidebar] Socket 断开后更新流式状态失败", {
            conversationId: targetConversationId,
            error,
          });
        });

        resolveConversationId(targetConversationId)
          .then((resolvedId) => markConversationAsCompleted(resolvedId))
          .catch((error) => {
            logger.error("[ChatSidebar] Socket 断开后标记对话完成失败", {
              conversationId: targetConversationId,
              error,
            });
          });
      }
    };

    if (socketStatusChanged && !isSocketConnected) {
      handleSocketDisconnected();
    }

    if (socketStatusChanged && isSocketConnected) {
      socketStopHandledRef.current = false;
    }

    if (!isOpen) {
      if (alertOwnerRef.current === "socket") {
        alertOwnerRef.current = null;
        closeAlertDialog();
      }
      socketAlertSeenRef.current = false;
      setShowSocketRecoveryHint(false);
      return;
    }

    if (!isI18nReady) {
      return;
    }

    if (!isSocketConnected) {
      const socketTitle = t(
        "chat:status.socketDisconnected",
        "Socket 连接已断开",
      );
      const socketDescription = t(
        "chat:status.socketDisconnectedWithStop",
        "Socket 连接已断开，正在进行的聊天已停止",
      );
      const confirmLabel = t("actions.confirm", "确认");
      const cancelLabel = t("actions.cancel", "取消");

      if (!socketAlertSeenRef.current) {
        socketAlertSeenRef.current = true;
        alertOwnerRef.current = "socket";
        openAlertDialog({
          status: "danger",
          title: socketTitle,
          description: socketDescription,
          actionLabel: confirmLabel,
          cancelLabel: cancelLabel,
          isDismissable: true,
          onAction: () => {
            alertOwnerRef.current = null;
          },
          onCancel: () => {
            alertOwnerRef.current = null;
          },
        });
      }

      setShowSocketRecoveryHint(false);
      return;
    }

    socketAlertSeenRef.current = false;
    if (alertOwnerRef.current === "socket") {
      alertOwnerRef.current = null;
      closeAlertDialog();
    }

    if (socketStatusChanged && previousSocketStatus === false) {
      setShowSocketRecoveryHint(true);
      logger.info("[ChatSidebar] Socket 已重新连接");
    }
  }, [
    activeConversationId,
    cancelChatRunOnServer,
    closeAlertDialog,
    isChatStreaming,
    isI18nReady,
    isOpen,
    isSocketConnected,
    markConversationAsCompleted,
    openAlertDialog,
    releaseLock,
    resolveConversationId,
    stop,
    t,
    offlineReasonLabel,
    updateStreamingFlag,
  ]);

  const forceStopStreaming = useCallback(
    (reason: "sidebar" | "history") => {
      if (!isChatStreaming) return;
      if (forceStopReasonRef.current) return;

      forceStopReasonRef.current = reason;

      if (reason === "sidebar") {
        logger.info("[ChatSidebar] 侧栏关闭，停止聊天请求");
      } else {
        logger.info("[ChatSidebar] 切换到历史视图，停止聊天请求");
      }

      const targetConversationId =
        activeConversationId ?? sendingSessionIdRef.current;

      const runId = sendingChatRunIdRef.current;
      if (runId) {
        cancelChatRun(runId);
        if (targetConversationId) {
          clearActiveChatRun(targetConversationId, runId);
        }
        cancelChatRunOnServer(
          runId,
          reason === "sidebar" ? "sidebar_closed" : "switch_to_history",
        );
        sendingChatRunIdRef.current = null;
      }

      stop();
      releaseLock();

      if (targetConversationId) {
        void updateStreamingFlag(targetConversationId, false);
      }
    },
    [
      activeConversationId,
      cancelChatRunOnServer,
      isChatStreaming,
      releaseLock,
      stop,
      updateStreamingFlag,
    ],
  );

  useEffect(() => {
    if (!isOpen) {
      forceStopStreaming("sidebar");
    }
  }, [forceStopStreaming, isOpen]);

  useEffect(() => {
    if (currentView === "history") {
      forceStopStreaming("history");
    }
  }, [currentView, forceStopStreaming]);

  useEffect(() => {
    const previousOnline = previousOnlineStatusRef.current;
    const isFirstRender = previousOnline === null;
    const onlineStatusChanged = previousOnline !== isOnline;
    previousOnlineStatusRef.current = isOnline;

    if (isFirstRender && offlineReason === "socket-disconnect") {
      return;
    }

    if (!onlineStatusChanged) return;

    if (!isOnline) {
      setShowOnlineRecoveryHint(false);

      if (isChatStreaming) {
        logger.warn("[ChatSidebar] 网络断开，停止聊天请求");
      } else {
        logger.warn("[ChatSidebar] 网络断开，当前无流式请求，释放聊天锁");
      }

      const runId = sendingChatRunIdRef.current;
      const targetConversationId =
        activeConversationId ?? sendingSessionIdRef.current;

      if (runId) {
        cancelChatRun(runId);
        if (targetConversationId) {
          clearActiveChatRun(targetConversationId, runId);
        }
        cancelChatRunOnServer(runId, "network_offline");
        sendingChatRunIdRef.current = null;
      }

      stop();
      releaseLock();

      if (targetConversationId) {
        updateStreamingFlag(targetConversationId, false).catch((error) => {
          logger.error("[ChatSidebar] 网络断开后更新流式状态失败", {
            conversationId: targetConversationId,
            error,
          });
        });

        resolveConversationId(targetConversationId)
          .then((resolvedId) => markConversationAsCompleted(resolvedId))
          .catch((error) => {
            logger.error("[ChatSidebar] 网络断开后标记对话完成失败", {
              error,
              conversationId: targetConversationId,
            });
          });
      }

      openAlertDialog({
        status: "danger",
        title: t("chat:status.networkOffline"),
        description: offlineReasonLabel
          ? `${t("chat:status.networkOfflineDesc")}（${offlineReasonLabel}）`
          : t("chat:status.networkOfflineDesc"),
        isDismissable: true,
      });

      wasOfflineRef.current = true;
      return;
    }

    if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      setShowOnlineRecoveryHint(true);
      logger.info("[ChatSidebar] 网络恢复，允许继续聊天");

      openAlertDialog({
        status: "warning",
        title: t("chat:status.networkOnline"),
        description: t("chat:status.networkOnlineDesc"),
        isDismissable: true,
      });
    }
  }, [
    activeConversationId,
    cancelChatRunOnServer,
    isChatStreaming,
    isOnline,
    markConversationAsCompleted,
    openAlertDialog,
    releaseLock,
    resolveConversationId,
    stop,
    t,
    offlineReason,
    offlineReasonLabel,
    updateStreamingFlag,
  ]);

  useEffect(() => {
    if (!showSocketRecoveryHint) return;

    const timer = window.setTimeout(() => {
      setShowSocketRecoveryHint(false);
    }, 3600);

    return () => window.clearTimeout(timer);
  }, [showSocketRecoveryHint]);

  useEffect(() => {
    if (!showOnlineRecoveryHint) return;

    const timer = window.setTimeout(() => {
      setShowOnlineRecoveryHint(false);
    }, 4800);

    return () => window.clearTimeout(timer);
  }, [showOnlineRecoveryHint]);

  useEffect(() => {
    const targetConversationId = activeConversationId;
    if (!targetConversationId) return;
    if (isChatStreaming) return;

    const cached = conversationMessages[targetConversationId];
    if (!cached) return;

    const cachedFingerprints = cached.map(fingerprintMessage);
    const lastSyncedToUI = lastSyncedToUIRef.current[targetConversationId];

    // 已同步过且内容未变化时直接跳过，避免无意义的 setState 循环
    if (areFingerprintsEqual(cachedFingerprints, lastSyncedToUI)) {
      return;
    }

    // 标记当前更新来自存储，避免反向 useEffect 写回
    applyingFromStorageRef.current = true;

    setMessagesRef.current?.((current) => {
      // 再次校验状态与会话，避免切换时覆盖流式消息
      if (isChatStreaming || activeConversationId !== targetConversationId) {
        return current;
      }

      const currentFingerprints = (current as unknown as ChatUIMessage[]).map(
        fingerprintMessage,
      );

      const isSame = areFingerprintsEqual(
        cachedFingerprints,
        currentFingerprints,
      );

      if (isSame) {
        lastSyncedToUIRef.current[targetConversationId] = cachedFingerprints;
        lastSyncedToStoreRef.current[targetConversationId] = cachedFingerprints;
        return current;
      }

      lastSyncedToUIRef.current[targetConversationId] = cachedFingerprints;
      lastSyncedToStoreRef.current[targetConversationId] = cachedFingerprints;

      return cached as unknown as UseChatMessage[];
    });

    // 在微任务中清除来源标记，确保后续写回路径正常运行
    queueMicrotask(() => {
      applyingFromStorageRef.current = false;
    });
  }, [
    activeConversationId,
    conversationMessages,
    isChatStreaming,
    areFingerprintsEqual,
  ]);

  useEffect(() => {
    if (!activeConversationId) return;

    // 存储侧变更已经在上方 useEffect 标记处理中，这里跳过以阻断回环
    if (applyingFromStorageRef.current) return;

    // 流式阶段阻断写回存储，避免流式消息尚未完成时触发读写循环
    if (isChatStreaming) return;

    const currentFingerprints = displayMessages.map(fingerprintMessage);

    // 缓存与当前展示相同则无需再次触发同步，避免写-读循环
    if (
      areFingerprintsEqual(
        currentFingerprints,
        lastSyncedToStoreRef.current[activeConversationId],
      )
    ) {
      return;
    }

    lastSyncedToStoreRef.current[activeConversationId] = currentFingerprints;

    chatService.syncMessages(activeConversationId, displayMessages, {
      resolveConversationId,
    });
  }, [
    activeConversationId,
    chatService,
    displayMessages,
    areFingerprintsEqual,
    isChatStreaming,
    resolveConversationId,
    // applyingFromStorageRef 是 ref，不需要添加到依赖数组
  ]);

  useEffect(() => {
    const message = extractErrorMessage(chatError);

    if (message) {
      pushErrorToast(message, t("toasts.chatRequestFailed"));
    }
  }, [chatError, extractErrorMessage, pushErrorToast, t]);

  useEffect(() => {
    pageUnloadHandledRef.current = false;

    const handlePageUnload = (
      _event: BeforeUnloadEvent | PageTransitionEvent,
    ) => {
      if (pageUnloadHandledRef.current) return;
      pageUnloadHandledRef.current = true;

      logger.warn("[ChatSidebar] 页面即将卸载，停止聊天请求");

      // 1) 立即中断正在进行的流式请求
      stop();

      // 2) 释放聊天锁，避免遗留占用
      releaseLock();

      const targetConversationId =
        activeConversationId ?? sendingSessionIdRef.current;
      if (!targetConversationId) return;

      // 3) 同步标记流式结束，避免卸载时遗留 streaming 状态
      updateStreamingFlag(targetConversationId, false, { syncOnly: true });
      void updateStreamingFlag(targetConversationId, false);

      const pageClosedText = t("chat:messages.pageClosed");
      const baseMessages =
        chatService.getCachedMessages(targetConversationId) ?? displayMessages;

      const hasPageClosedMessage = baseMessages.some(
        (message) =>
          message.metadata?.isDisconnected &&
          message.parts.some(
            // eslint-disable-next-line sonarjs/no-nested-functions -- 简单谓词回调，但位于深层卸载处理逻辑中
            (part) => part.type === "text" && part.text === pageClosedText,
          ),
      );

      const disconnectMessage: ChatUIMessage = {
        id: generateUUID("msg"),
        role: "system",
        parts: [
          {
            type: "text",
            text: pageClosedText,
          },
        ],
        metadata: {
          createdAt: Date.now(),
          isDisconnected: true,
        },
      };

      const nextMessages = hasPageClosedMessage
        ? baseMessages
        : [...baseMessages, disconnectMessage];

      // 4) 刷新待保存队列，确保 debounce 队列立即写入
      chatService.flushPending(targetConversationId);

      try {
        // 5) 优先尝试 sendBeacon（适合卸载场景）
        if (typeof navigator !== "undefined" && navigator.sendBeacon) {
          const payload = JSON.stringify({
            conversationId: targetConversationId,
            messages: nextMessages,
          });
          const sent = navigator.sendBeacon(
            "/api/chat/unload",
            new Blob([payload], { type: "application/json" }),
          );
          if (sent) return;
        }
      } catch (error) {
        logger.error("[ChatSidebar] sendBeacon 发送失败:", error);
      }

      // 6) 回落：同步写入 localStorage，避免 beforeunload 异步中断
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(
            `chat:unload:${targetConversationId}`,
            JSON.stringify({
              conversationId: targetConversationId,
              messages: nextMessages,
            }),
          );
        }
      } catch (error) {
        logger.error("[ChatSidebar] 卸载回落保存失败:", error);
      }
    };

    window.addEventListener("beforeunload", handlePageUnload);
    window.addEventListener("pagehide", handlePageUnload);

    return () => {
      window.removeEventListener("beforeunload", handlePageUnload);
      window.removeEventListener("pagehide", handlePageUnload);
      pageUnloadHandledRef.current = false;
    };
  }, [
    activeConversationId,
    chatService,
    displayMessages,
    releaseLock,
    stop,
    t,
    updateStreamingFlag,
  ]);

  useEffect(
    () => () => {
      if (sendingSessionIdRef.current) {
        sendingSessionIdRef.current = null;
        releaseLock();
      }
    },
    [releaseLock],
  );

  // ========== 事件处理函数 ==========

  const submitMessage = async () => {
    const trimmedInput = input.trim();
    const readyAttachments = imageAttachments.attachments.filter(
      (item) => item.status === "ready",
    );
    const hasReadyAttachments = readyAttachments.length > 0;
    const hasHistoryImages = displayMessages.some((message) =>
      message.parts?.some((part) => part.type === "image"),
    );

    if (
      (!trimmedInput && !hasReadyAttachments) ||
      !llmConfig ||
      configLoading ||
      isChatStreaming
    ) {
      return;
    }

    if (
      (hasReadyAttachments || hasHistoryImages) &&
      !llmConfig.capabilities?.supportsVision
    ) {
      showNotice(
        t(
          "chat:messages.visionNotSupported",
          "当前模型不支持图片输入（vision），请切换到支持视觉的模型后再发送。",
        ),
        "warning",
      );
      return;
    }

    if (!isSocketConnected) {
      logger.warn("[ChatSidebar] Socket 未连接，无法发送消息");
      openAlertDialog({
        status: "warning",
        title: t("chat:status.socketDisconnected"),
        description: t("chat:status.socketRequiredForChat"),
        isDismissable: true,
      });
      return;
    }

    if (!canSendNewMessage) {
      if (!canChat) {
        showNotice(lockBlockedMessage, "warning");
      }
      return;
    }

    if (!currentProjectId || currentProjectId.trim().length === 0) {
      showNotice(
        t("chat:messages.projectRequired", "请选择或创建项目后再发送消息"),
        "warning",
      );
      return;
    }

    const locked = acquireLock();
    if (!locked) {
      showNotice(lockBlockedMessage, "warning");
      return;
    }

    const targetSessionId = activeConversationId;
    if (!targetSessionId) {
      showNotice(
        t("chat:messages.conversationNotReady", "对话尚未就绪，请稍后重试。"),
        "warning",
      );
      return;
    }

    sendingSessionIdRef.current = targetSessionId;
    sendingChatRunIdRef.current = null;
    logger.debug("[ChatSidebar] 开始发送消息到会话:", targetSessionId);

    const messageId = generateUUID("msg");
    const createdAt = Date.now();

    const imageParts = hasReadyAttachments
      ? await Promise.all(
          readyAttachments.map((item) =>
            convertAttachmentItemToImagePart(item, item.id),
          ),
        )
      : [];

    const parts: ChatUIMessage["parts"] = [
      ...(trimmedInput
        ? [
            {
              type: "text",
              text: trimmedInput,
            } as const,
          ]
        : []),
      ...imageParts,
    ];

    const userMessage: ChatUIMessage = {
      id: messageId,
      role: "user",
      parts,
      metadata: {
        createdAt,
        modelName: llmConfig.modelName,
      },
    };

    setInput("");

    let lockTransferredToStream = false;
    let storageForRollback: Awaited<ReturnType<typeof getStorage>> | null =
      null;
    try {
      const storage = await getStorage();
      storageForRollback = storage;
      await storage.createMessage(
        convertUIMessageToCreateInput(userMessage, targetSessionId),
      );

      if (hasReadyAttachments) {
        await Promise.all(
          readyAttachments.map((item) =>
            uploadImageAttachment({
              storage,
              attachmentId: item.id,
              conversationId: targetSessionId,
              messageId,
              file: item.file,
              width: item.width,
              height: item.height,
            }),
          ),
        );
      }

      const chatRunId = generateUUID("chat-run");
      sendingChatRunIdRef.current = chatRunId;
      setActiveChatRun(targetSessionId, chatRunId);

      await sendMessage(userMessage as unknown as UseChatMessage, {
        body: {
          llmConfig,
          projectUuid: currentProjectId,
          conversationId: targetSessionId,
          chatRunId,
        },
      });
      lockTransferredToStream = true;
      if (hasReadyAttachments) {
        imageAttachments.clearAll();
      }
      void updateStreamingFlag(targetSessionId, true);
    } catch (error) {
      logger.error("[ChatSidebar] 发送消息失败:", error);
      const runId = sendingChatRunIdRef.current;
      sendingSessionIdRef.current = null;
      sendingChatRunIdRef.current = null;
      if (runId) {
        clearActiveChatRun(targetSessionId, runId);
      }
      if (storageForRollback) {
        try {
          await storageForRollback.deleteMessage(messageId);
        } catch (deleteError) {
          logger.warn("[ChatSidebar] 回滚失败：删除消息失败", {
            messageId,
            error: deleteError,
          });
        }
      }
      setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
      setInput(trimmedInput);
      pushErrorToast(
        extractErrorMessage(error) ?? t("toasts.unknownError"),
        t("toasts.chatRequestFailed"),
      );
    } finally {
      if (!lockTransferredToStream) {
        releaseLock();
      }
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitMessage();
  };

  /**
   * 静默停止流式传输（不保存取消消息）
   * 用于新建对话等场景
   */
  const stopStreamingSilently = useCallback(async () => {
    if (!isChatStreaming) return;

    logger.info("[ChatSidebar] 静默停止流式传输");
    const runId = sendingChatRunIdRef.current;
    const targetConversationId =
      activeConversationId ?? sendingSessionIdRef.current;

    if (runId) {
      cancelChatRun(runId);
      if (targetConversationId) {
        clearActiveChatRun(targetConversationId, runId);
      }
      cancelChatRunOnServer(runId, "stop_silently");
    }

    stop();

    if (targetConversationId) {
      void updateStreamingFlag(targetConversationId, false);
    }

    sendingSessionIdRef.current = null;
    sendingChatRunIdRef.current = null;
    releaseLock();
  }, [
    activeConversationId,
    isChatStreaming,
    releaseLock,
    stop,
    updateStreamingFlag,
    cancelChatRunOnServer,
  ]);

  const handleCancel = useCallback(async () => {
    if (!isChatStreaming) return;

    logger.info("[ChatSidebar] 用户取消聊天");

    const runId = sendingChatRunIdRef.current;
    const targetConversationId =
      activeConversationId ?? sendingSessionIdRef.current;

    if (runId) {
      cancelChatRun(runId);
      if (targetConversationId) {
        clearActiveChatRun(targetConversationId, runId);
      }
      cancelChatRunOnServer(runId, "user_cancelled");
    }

    stop();

    if (!targetConversationId) {
      sendingSessionIdRef.current = null;
      sendingChatRunIdRef.current = null;
      return;
    }

    const cancelMessage: ChatUIMessage = {
      id: generateUUID("msg"),
      role: "system",
      parts: [
        {
          type: "text",
          text: t("chat:messages.userCancelled"),
        },
      ],
      metadata: {
        createdAt: Date.now(),
        isCancelled: true,
      },
    };

    const baseMessages =
      activeConversationId === targetConversationId
        ? displayMessages
        : (chatService.getCachedMessages(targetConversationId) ?? []);

    const nextMessages = [...baseMessages, cancelMessage];

    if (activeConversationId === targetConversationId) {
      setMessages(nextMessages as unknown as UseChatMessage[]);
    }

    try {
      await chatService.saveNow(targetConversationId, nextMessages, {
        resolveConversationId,
        onConversationResolved: (resolvedId) => {
          setActiveConversationId(resolvedId);
        },
      });
      logger.info("[ChatSidebar] 取消消息已同步保存");
    } catch (error) {
      logger.error("[ChatSidebar] 保存取消消息失败:", error);
      pushErrorToast(
        extractErrorMessage(error) ?? t("toasts.unknownError"),
        t("toasts.autoSaveFailed"),
      );
    } finally {
      void updateStreamingFlag(targetConversationId, false);
      sendingSessionIdRef.current = null;
      sendingChatRunIdRef.current = null;
      releaseLock();
    }
  }, [
    activeConversationId,
    chatService,
    displayMessages,
    extractErrorMessage,
    isChatStreaming,
    pushErrorToast,
    updateStreamingFlag,
    resolveConversationId,
    setActiveConversationId,
    setMessages,
    stop,
    t,
    releaseLock,
    cancelChatRunOnServer,
  ]);

  const handleRetry = useCallback(() => {
    if (!lastMessageIsUser) return;

    const lastMessage = displayMessages[displayMessages.length - 1];
    if (!lastMessage || lastMessage.role !== "user") return;

    const textParts =
      lastMessage.parts
        ?.filter((part) => (part as { type?: unknown }).type === "text")
        .map((part) =>
          typeof (part as { text?: unknown }).text === "string"
            ? (part as { text?: string }).text
            : "",
        )
        .filter(Boolean) ?? [];

    const messageText = textParts.join(" ").trim();

    if (!messageText) {
      logger.warn("[ChatSidebar] 重试失败：最后一条消息为空");
      return;
    }

    setInput(messageText);
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const lastPrev = prev[prev.length - 1];
      if (lastPrev.role !== "user") return prev;
      return prev.slice(0, -1);
    });

    showNotice(
      `${t("chat:messages.retryTitle")} · ${t("chat:messages.retryDescription")}`,
      "success",
    );

    logger.info("[ChatSidebar] 已准备重试上一条消息");
  }, [
    displayMessages,
    lastMessageIsUser,
    setInput,
    setMessages,
    showNotice,
    t,
  ]);

  const handleNewChat = useCallback(async () => {
    // 先静默取消正在进行的流式传输
    await stopStreamingSilently();

    try {
      const newConv = await createConversation(
        t("chat:messages.defaultConversation"),
        currentProjectId,
      );
      setActiveConversationId(newConv.id);
    } catch (error) {
      logger.error("[ChatSidebar] 创建新对话失败:", error);
    }
  }, [
    stopStreamingSilently,
    createConversation,
    currentProjectId,
    setActiveConversationId,
    t,
  ]);

  const handleHistory = () => {
    setCurrentView("history");
  };

  const handleSessionSelect = async (sessionId: string) => {
    await ensureMessagesForConversation(sessionId);
    setActiveConversationId(sessionId);
  };

  const handleHistoryBack = () => {
    setCurrentView("chat");
  };

  const handleSelectFromHistory = async (sessionId: string) => {
    await handleSessionSelect(sessionId);
    setCurrentView("chat");
  };

  const handleBatchDelete = useCallback(
    async (ids: string[]) => {
      if (!ids || ids.length === 0) return;
      const uniqueIds = Array.from(new Set(ids));
      const remaining = conversations.length - uniqueIds.length;
      const conversationMap = new Map(
        conversations.map((conv) => [conv.id, conv]),
      );

      const messageCounts = await Promise.all(
        uniqueIds.map(async (id) => {
          try {
            const messages = await ensureMessagesForConversation(id);
            return { id, count: messages.length };
          } catch (error) {
            logger.error("[ChatSidebar] 统计会话消息数量失败:", {
              conversationId: id,
              error,
            });
            return { id, count: 0 };
          }
        }),
      );

      const totalMessages = messageCounts.reduce(
        (sum, item) => sum + item.count,
        0,
      );
      const messageCountLabel = t("chat:messages.counts.messageCount", {
        count: totalMessages,
      });

      const isSingle = uniqueIds.length === 1;
      const targetTitle =
        conversationMap.get(uniqueIds[0])?.title ??
        t("chat:conversations.defaultName", { number: 1 });

      const baseDescription = t(
        isSingle
          ? "chat:dialogs.deleteConversationDescription"
          : "chat:dialogs.deleteConversationsDescription",
        {
          title: targetTitle,
          count: uniqueIds.length,
          messageCount: messageCountLabel,
        },
      );

      const description =
        remaining <= 0
          ? `${baseDescription} ${t("chat:aria.deleteAllConfirm")}`
          : baseDescription;

      alertOwnerRef.current = isSingle ? "single-delete" : "batch-delete";

      openAlertDialog({
        status: "danger",
        title: isSingle
          ? t("chat:dialogs.deleteConversationTitle", { title: targetTitle })
          : t("chat:dialogs.deleteConversationsTitle", {
              count: uniqueIds.length,
            }),
        description,
        actionLabel: t("chat:conversations.actions.delete"),
        cancelLabel: t("actions.cancel", "取消"),
        isDismissable: false,
        onCancel: () => {
          alertOwnerRef.current = null;
        },
        onAction: async () => {
          const deletingActive =
            activeConversationId != null &&
            uniqueIds.includes(activeConversationId);
          try {
            await batchDeleteConversations(uniqueIds);
            removeConversationsFromState(uniqueIds);
            clearSyncedFingerprints(uniqueIds);
            if (deletingActive) {
              setActiveConversationId(null);
            }
            alertOwnerRef.current = null;
          } catch (error) {
            logger.error("[ChatSidebar] 批量删除对话失败:", error);
            const errorMessage =
              extractErrorMessage(error) ?? t("toasts.unknownError");
            showNotice(
              t("toasts.batchDeleteFailed", { error: errorMessage }),
              "danger",
            );
            throw error;
          }
        },
      });
    },
    [
      activeConversationId,
      batchDeleteConversations,
      conversations,
      ensureMessagesForConversation,
      clearSyncedFingerprints,
      extractErrorMessage,
      openAlertDialog,
      removeConversationsFromState,
      setActiveConversationId,
      showNotice,
      t,
    ],
  );

  const handleBatchExport = useCallback(
    async (ids: string[]) => {
      if (!ids || ids.length === 0) return;
      try {
        const blob = await exportConversations(ids);
        const defaultPath = `chat-export-${new Date().toISOString().split("T")[0]}.json`;
        const success = await exportBlobContent(blob, defaultPath, {
          t,
          locale: i18n.language,
        });
        if (!success) {
          showNotice(
            t("toasts.chatExportFailed", { error: t("toasts.unknownError") }),
            "danger",
          );
        }
      } catch (error) {
        logger.error("[ChatSidebar] 批量导出对话失败:", error);
        const errorMessage =
          extractErrorMessage(error) ?? t("toasts.unknownError");
        showNotice(
          t("toasts.chatExportFailed", { error: errorMessage }),
          "danger",
        );
      }
    },
    [exportConversations, extractErrorMessage, showNotice, t, i18n.language],
  );

  const handleToolCallToggle = (key: string) => {
    setExpandedToolCalls((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleThinkingBlockToggle = (messageId: string) => {
    setExpandedThinkingBlocks((prev) => ({
      ...prev,
      [messageId]: !prev[messageId],
    }));
  };

  const modelSelectorDisabled = isChatStreaming || selectorLoading;

  useEffect(
    () => () => {
      const streaming = status === "submitted" || status === "streaming";
      const targetConversationId =
        activeConversationId ?? sendingSessionIdRef.current;
      if (!streaming || !targetConversationId) return;

      const runCleanup = async () => {
        try {
          const resolvedId = await resolveConversationId(targetConversationId);
          const cached =
            chatService.getCachedMessages(resolvedId) ?? displayMessages;

          const hasNotice = cached.some(isAbnormalExitNoticeMessage);

          const noticeMessage: ChatUIMessage = {
            id: generateUUID("sys"),
            role: "system",
            parts: [
              {
                type: "text",
                text: "[系统] 上次对话异常中断",
              },
            ],
            metadata: {
              createdAt: Date.now(),
              isAbnormalExitNotice: true,
            },
          };

          const nextMessages = hasNotice
            ? cached
            : [noticeMessage, ...(cached ?? [])];

          await chatService.saveNow(resolvedId, nextMessages, {
            resolveConversationId,
          });
          await updateStreamingFlag(resolvedId, false);
        } catch (error) {
          logger.error("[ChatSidebar] 卸载时清理流式状态失败", {
            conversationId: targetConversationId,
            error,
          });
        }
      };

      void runCleanup();
    },
    [
      activeConversationId,
      chatService,
      displayMessages,
      resolveConversationId,
      status,
      updateStreamingFlag,
    ],
  );

  const alerts = (
    <>
      {!isSocketConnected && (
        <div className="mb-3">
          <Alert status="danger">
            <Alert.Title>⚠️ {t("chat:status.socketDisconnected")}</Alert.Title>
            <Alert.Description>
              {t(
                "chat:status.socketDisconnectedWithStop",
                "Socket 连接已断开，正在进行的聊天已停止",
              )}
            </Alert.Description>
          </Alert>
        </div>
      )}
      {showSocketRecoveryHint && isSocketConnected && (
        <div className="mb-3">
          <Alert status="success">
            <Alert.Title>{t("chat:status.socketReconnected")}</Alert.Title>
            <Alert.Description>
              {t("chat:status.socketReconnected")}
            </Alert.Description>
          </Alert>
        </div>
      )}
      {!isOnline && (
        <div className="mb-3">
          <Alert status="danger">
            <Alert.Title>{t("chat:status.networkOffline")}</Alert.Title>
            <Alert.Description>
              {offlineReasonLabel
                ? `${t("chat:status.networkOfflineDesc")}（${offlineReasonLabel}）`
                : t("chat:status.networkOfflineDesc")}
            </Alert.Description>
          </Alert>
        </div>
      )}
      {showOnlineRecoveryHint && (
        <div className="mb-3">
          <Alert status="success">
            <Alert.Title>{t("chat:status.networkOnline")}</Alert.Title>
            <Alert.Description>
              {t("chat:status.networkOnlineDesc")}
            </Alert.Description>
          </Alert>
        </div>
      )}
      {!canChat && (
        <div className="mb-3">
          <Alert status="warning">
            <Alert.Title>{lockBlockedTitle}</Alert.Title>
            <Alert.Description>
              {lockBlockedMessage}
              {truncatedLockHolder ? `（${truncatedLockHolder}）` : ""}
            </Alert.Description>
          </Alert>
        </div>
      )}
      {activeConversationHasAbnormalExit && (
        <div className="mb-3">
          <Alert status="warning">
            <Alert.Title>
              {t("chat:messages.abnormalExitTitle", "上次对话异常中断")}
            </Alert.Title>
            <Alert.Description>
              {t(
                "chat:messages.abnormalExitDescription",
                "上次对话异常中断，可能未保存完整内容",
              )}
            </Alert.Description>
          </Alert>
        </div>
      )}
    </>
  );

  return (
    <ChatShell
      view={currentView}
      alerts={alerts}
      chatPane={
        <>
          <MessagePane
            messages={displayMessages}
            configLoading={configLoading}
            llmConfig={llmConfig}
            status={status}
            expandedToolCalls={expandedToolCalls}
            expandedThinkingBlocks={expandedThinkingBlocks}
            onToolCallToggle={handleToolCallToggle}
            onThinkingBlockToggle={handleThinkingBlockToggle}
          />
          <Composer
            input={input}
            setInput={setInput}
            isChatStreaming={isChatStreaming}
            configLoading={configLoading}
            llmConfig={llmConfig}
            canSendNewMessage={canSendNewMessage}
            lastMessageIsUser={lastMessageIsUser}
            isOnline={isOnline}
            isSocketConnected={isSocketConnected}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            onNewChat={handleNewChat}
            onHistory={handleHistory}
            onRetry={handleRetry}
            imageAttachments={imageAttachments}
            modelSelectorProps={{
              providers,
              models,
              selectedModelId,
              onSelectModel: handleModelChange,
              isDisabled: modelSelectorDisabled,
              isLoading: selectorLoading,
              modelLabel: selectedModelLabel,
            }}
          />
        </>
      }
      historyPane={
        <ChatHistoryView
          currentProjectId={currentProjectId}
          conversations={conversations}
          onSelectConversation={handleSelectFromHistory}
          onBack={handleHistoryBack}
          onDeleteConversations={handleBatchDelete}
          onExportConversations={handleBatchExport}
        />
      }
    />
  );
}
