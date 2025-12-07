"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type FormEvent,
} from "react";
import { useChat } from "@ai-sdk/react";
import {
  useStorageSettings,
  useStorageConversations,
  useStorageXMLVersions,
} from "@/app/hooks";
import { useAlertDialog } from "@/app/components/alert";
import { useToast } from "@/app/components/toast";
import { useI18n } from "@/app/i18n/hooks";
import { DEFAULT_PROJECT_UUID } from "@/app/lib/storage";
import type {
  ChatUIMessage,
  LLMConfig,
  MessageMetadata,
  ModelConfig,
  ProviderConfig,
  ActiveModelReference,
} from "@/app/types/chat";
import type { Conversation } from "@/app/lib/storage";
import { DEFAULT_LLM_CONFIG, normalizeLLMConfig } from "@/app/lib/config-utils";
import {
  createChatSessionService,
  fingerprintMessage,
  type ChatSessionService,
} from "@/app/lib/chat-session-service";
import { generateUUID } from "@/app/lib/utils";

// 导入拆分后的组件
import MessageList from "./chat/MessageList";
import ChatInputArea from "./chat/ChatInputArea";
import ChatHistoryView from "./chat/ChatHistoryView";

// 导出工具
import { exportBlobContent } from "./chat/utils/fileExport";
import { createLogger } from "@/lib/logger";

const logger = createLogger("ChatSidebar");

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
  const [input, setInput] = useState("");
  const [expandedToolCalls, setExpandedToolCalls] = useState<
    Record<string, boolean>
  >({});
  const [expandedThinkingBlocks, setExpandedThinkingBlocks] = useState<
    Record<string, boolean>
  >({});
  const [currentView, setCurrentView] = useState<"chat" | "history">("chat");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ========== 存储 Hooks ==========
  const {
    getActiveModel,
    getProviders,
    getModels,
    setActiveModel,
    getRuntimeConfig,
    subscribeSettingsUpdates,
    error: settingsError,
  } = useStorageSettings();

  const {
    createConversation,
    updateConversation,
    batchDeleteConversations,
    exportConversations,
    getMessages,
    addMessages,
    subscribeToConversations,
    subscribeToMessages,
    error: conversationsError,
  } = useStorageConversations();

  const { getAllXMLVersions, saveXML } = useStorageXMLVersions();

  // ========== 本地状态 ==========
  const [llmConfig, setLlmConfig] = useState<LLMConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [selectorLoading, setSelectorLoading] = useState(true);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [conversationMessages, setConversationMessages] = useState<
    Record<string, ChatUIMessage[]>
  >({});
  const [defaultXmlVersionId, setDefaultXmlVersionId] = useState<string | null>(
    null,
  );
  const { t, i18n } = useI18n();
  const isI18nReady = i18n.isInitialized && Boolean(i18n.resolvedLanguage);
  const { push } = useToast();
  const { open: openAlertDialog, close: closeAlertDialog } = useAlertDialog();

  // ========== 引用 ==========
  const sendingSessionIdRef = useRef<string | null>(null);
  const creatingConversationPromiseRef = useRef<{
    promise: Promise<Conversation>;
    conversationId: string;
  } | null>(null);
  const creatingDefaultConversationRef = useRef(false);
  const chatServiceRef = useRef<ChatSessionService | null>(null);
  const alertOwnerRef = useRef<
    "socket" | "single-delete" | "batch-delete" | null
  >(null);
  const socketAlertSeenRef = useRef(false);

  // ========== 派生状态 ==========
  const initialMessages = useMemo<ChatUIMessage[]>(() => {
    return activeConversationId
      ? conversationMessages[activeConversationId] || []
      : [];
  }, [activeConversationId, conversationMessages]);

  // 为 ChatSessionMenu 构造兼容的数据格式
  const fallbackModelName = useMemo(
    () => llmConfig?.modelName ?? DEFAULT_LLM_CONFIG.modelName,
    [llmConfig],
  );

  const resolveModelSelection = useCallback(
    (
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
        const currentModel = modelList.find(
          (model) => model.id === currentModelId,
        );
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
    },
    [],
  );

  const pushErrorToast = useCallback(
    (message: string, title = t("toasts.operationFailedTitle")) => {
      push({
        variant: "danger",
        title,
        description: message,
      });
    },
    [push, t],
  );

  const extractErrorMessage = useCallback((error: unknown): string | null => {
    if (!error) return null;
    if (typeof error === "string") return error;
    if (error instanceof Error) return error.message;
    if (typeof error === "object" && "message" in error) {
      const maybeMessage = (error as { message?: unknown }).message;
      if (typeof maybeMessage === "string") return maybeMessage;
    }
    return null;
  }, []);

  const showNotice = useCallback(
    (message: string, status: "success" | "warning" | "danger") => {
      const title =
        status === "success"
          ? t("toasts.operationSuccessTitle")
          : status === "warning"
            ? t("toasts.operationWarningTitle")
            : t("toasts.operationFailedTitle");
      push({
        variant: status,
        title,
        description: message,
      });
    },
    [push, t],
  );

  const ensureMessageMetadata = useCallback(
    (message: ChatUIMessage): ChatUIMessage => {
      const metadata = (message.metadata as MessageMetadata | undefined) ?? {};
      const resolvedMetadata: MessageMetadata = {
        modelName: metadata.modelName ?? fallbackModelName,
        createdAt: metadata.createdAt ?? Date.now(),
      };

      if (
        metadata.modelName === resolvedMetadata.modelName &&
        metadata.createdAt === resolvedMetadata.createdAt
      ) {
        return message;
      }

      return {
        ...message,
        metadata: {
          ...metadata,
          ...resolvedMetadata,
        },
      };
    },
    [fallbackModelName],
  );

  const handleMessagesChange = useCallback(
    (conversationId: string, messages: ChatUIMessage[]) => {
      setConversationMessages((prev) => ({
        ...prev,
        [conversationId]: messages,
      }));
    },
    [],
  );

  const handleSaveError = useCallback(
    (message: string) => {
      const normalizedMessage = message?.trim() ?? "";
      if (normalizedMessage) {
        push({
          variant: "danger",
          title: t("toasts.operationFailedTitle"),
          description: normalizedMessage,
        });
      }
    },
    [push, t],
  );

  const loadModelSelector = useCallback(
    async (options?: { preserveSelection?: boolean }) => {
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
      } catch (error) {
        logger.error("[ChatSidebar] 加载模型选择器数据失败:", error);
        setLlmConfig((prev) => prev ?? { ...DEFAULT_LLM_CONFIG });
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
      resolveModelSelection,
      selectedModelId,
    ],
  );

  if (!chatServiceRef.current) {
    chatServiceRef.current = createChatSessionService(
      {
        getMessages,
        addMessages,
        updateConversation,
        subscribeToConversations,
        subscribeToMessages,
      },
      {
        ensureMessageMetadata,
        defaultXmlVersionId,
        onMessagesChange: handleMessagesChange,
        onSaveError: handleSaveError,
      },
    );
  }

  const chatService = chatServiceRef.current;

  useEffect(() => {
    chatService.setEnsureMessageMetadata(ensureMessageMetadata);
  }, [chatService, ensureMessageMetadata]);

  useEffect(() => {
    chatService.updateDefaultXmlVersionId(defaultXmlVersionId ?? null);
  }, [chatService, defaultXmlVersionId]);

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

  useEffect(
    () => () => {
      chatService.dispose();
    },
    [chatService],
  );

  useEffect(() => {
    if (!isOpen) {
      if (alertOwnerRef.current === "socket") {
        alertOwnerRef.current = null;
        closeAlertDialog();
      }
      socketAlertSeenRef.current = false;
      return;
    }

    if (!isI18nReady) {
      return;
    }

    const socketTitle = t("chat:status.socketDisconnected", "Socket 未连接");
    const socketDescription = t(
      "chat:status.socketWarning",
      "AI 工具功能暂时不可用",
    );
    const confirmLabel = t("actions.confirm", "确认");
    const cancelLabel = t("actions.cancel", "取消");

    if (!isSocketConnected) {
      if (!socketAlertSeenRef.current) {
        socketAlertSeenRef.current = true;
        alertOwnerRef.current = "socket";
        openAlertDialog({
          status: "warning",
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
    } else {
      socketAlertSeenRef.current = false;
      if (alertOwnerRef.current === "socket") {
        alertOwnerRef.current = null;
        closeAlertDialog();
      }
    }
  }, [
    closeAlertDialog,
    isI18nReady,
    isOpen,
    isSocketConnected,
    openAlertDialog,
    t,
  ]);

  const ensureMessagesForConversation = useCallback(
    (conversationId: string): Promise<ChatUIMessage[]> => {
      return chatService.ensureMessages(conversationId);
    },
    [chatService],
  );

  const resolveConversationId = useCallback(
    async (conversationId: string): Promise<string> => {
      if (!conversationId.startsWith("temp-")) return conversationId;
      if (
        creatingConversationPromiseRef.current &&
        creatingConversationPromiseRef.current.conversationId === conversationId
      ) {
        const created = await creatingConversationPromiseRef.current.promise;
        setActiveConversationId(created.id);
        return created.id;
      }
      return conversationId;
    },
    [],
  );

  const removeConversationsFromState = useCallback(
    (ids: string[]) => {
      setConversationMessages((prev) => {
        const next = { ...prev };
        ids.forEach((id) => delete next[id]);
        return next;
      });
      chatService.removeConversationCaches(ids);

      // 清理双向指纹缓存，防止已删除会话的指纹残留导致内存增长
      ids.forEach((id) => {
        delete lastSyncedToUIRef.current[id];
        delete lastSyncedToStoreRef.current[id];
      });
    },
    [chatService],
  );

  // ========== 初始化 ==========
  useEffect(() => {
    let isUnmounted = false;

    async function initialize() {
      await loadModelSelector();

      try {
        // 确保有默认 XML 版本
        const xmlVersions = await getAllXMLVersions();
        if (isUnmounted) return;

        let defaultVersionId: string;

        if (xmlVersions.length === 0) {
          // 创建默认空白 XML 版本
          const defaultXml = await saveXML(
            '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>',
            currentProjectId,
            undefined,
            t("chat:messages.defaultVersion"),
            t("chat:messages.initialVersion"),
          );
          defaultVersionId = defaultXml;
        } else {
          // 使用最新的 XML 版本
          defaultVersionId = xmlVersions[0].id;
        }
        setDefaultXmlVersionId(defaultVersionId);
      } catch (error) {
        logger.error("[ChatSidebar] 初始化 XML 版本失败:", error);
      }
    }

    void initialize();

    return () => {
      isUnmounted = true;
    };
  }, [loadModelSelector, getAllXMLVersions, saveXML, currentProjectId, t]);

  useEffect(() => {
    const projectUuid = currentProjectId ?? DEFAULT_PROJECT_UUID;
    let isUnmounted = false;

    const unsubscribe = chatService.subscribeConversations(
      projectUuid,
      (list) => {
        if (isUnmounted) return;
        setConversations(list);

        if (list.length === 0) {
          if (creatingDefaultConversationRef.current) return;
          creatingDefaultConversationRef.current = true;
          const defaultConversationTitle = t(
            "chat:messages.defaultConversation",
          );
          createConversation(defaultConversationTitle, projectUuid)
            .then((newConv) => {
              setConversationMessages((prev) => ({
                ...prev,
                [newConv.id]: prev[newConv.id] ?? [],
              }));
              setActiveConversationId(newConv.id);
            })
            .catch((error) => {
              logger.error("[ChatSidebar] 创建默认对话失败:", error);
            })
            .finally(() => {
              creatingDefaultConversationRef.current = false;
            });
          return;
        }

        setActiveConversationId((prev) => {
          if (prev && list.some((conv) => conv.id === prev)) return prev;
          return list[0]?.id ?? null;
        });
      },
      (error) => {
        logger.error("[ChatSidebar] 会话订阅失败:", error);
      },
    );

    return () => {
      isUnmounted = true;
      unsubscribe?.();
    };
  }, [createConversation, currentProjectId, t, chatService]);

  useEffect(() => {
    if (!activeConversationId) return undefined;

    const unsubscribe = chatService.subscribeMessages(
      activeConversationId,
      (error) => {
        logger.error("[ChatSidebar] 消息订阅失败:", error);
      },
    );

    void chatService.ensureMessages(activeConversationId);

    return unsubscribe;
  }, [activeConversationId, chatService]);

  useEffect(() => {
    chatService.handleConversationSwitch(activeConversationId);
  }, [chatService, activeConversationId]);

  // ========== useChat 集成 ==========
  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    error: chatError,
  } = useChat<ChatUIMessage>({
    id: activeConversationId || "default",
    messages: initialMessages,
    onFinish: async ({ messages: finishedMessages }) => {
      const targetSessionId = sendingSessionIdRef.current;

      if (!targetSessionId) {
        logger.error("[ChatSidebar] onFinish: 没有记录的目标会话ID");
        return;
      }

      try {
        await chatService.saveNow(targetSessionId, finishedMessages, {
          forceTitleUpdate: true,
          resolveConversationId,
          onConversationResolved: (resolvedId) => {
            setActiveConversationId(resolvedId);
          },
        });
      } catch (error) {
        logger.error("[ChatSidebar] 保存消息失败:", error);
      } finally {
        sendingSessionIdRef.current = null;
      }
    },
  });

  // 使用 ref 缓存 setMessages，避免因为引用变化导致依赖效应重复执行
  const setMessagesRef = useRef(setMessages);
  // 双向指纹缓存 + 来源标记：阻断存储 ↔ useChat 间的循环同步
  const lastSyncedToUIRef = useRef<Record<string, string[]>>({});
  const lastSyncedToStoreRef = useRef<Record<string, string[]>>({});
  const applyingFromStorageRef = useRef(false);

  useEffect(() => {
    setMessagesRef.current = setMessages;
  }, [setMessages]);

  const isChatStreaming = status === "submitted" || status === "streaming";

  const displayMessages = useMemo(
    () => messages.map(ensureMessageMetadata),
    [messages, ensureMessageMetadata],
  );

  const lastMessageIsUser = useMemo(() => {
    if (!displayMessages || displayMessages.length === 0) return false;
    const lastMsg = displayMessages[displayMessages.length - 1];
    return lastMsg.role === "user";
  }, [displayMessages]);

  const canSendNewMessage = useMemo(() => {
    if (isChatStreaming) return true;
    return !lastMessageIsUser;
  }, [isChatStreaming, lastMessageIsUser]);

  const areFingerprintsEqual = useCallback(
    (a: string[] | undefined, b: string[] | undefined) => {
      if (!a || !b) return false;
      if (a.length !== b.length) return false;
      return a.every((fp, index) => fp === b[index]);
    },
    [],
  );

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

      const currentFingerprints = current.map(fingerprintMessage);

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

      return cached;
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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages]);

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
    const message = extractErrorMessage(settingsError);
    if (message) {
      pushErrorToast(message, t("toasts.settingsLoadFailed"));
    }
  }, [extractErrorMessage, settingsError, pushErrorToast, t]);

  useEffect(() => {
    const message = extractErrorMessage(conversationsError);
    if (message) {
      pushErrorToast(message, t("toasts.conversationsSyncFailed"));
    }
  }, [conversationsError, extractErrorMessage, pushErrorToast, t]);

  useEffect(() => {
    const message = extractErrorMessage(chatError);

    if (message) {
      pushErrorToast(message, t("toasts.chatRequestFailed"));
    }
  }, [chatError, extractErrorMessage, pushErrorToast, t]);

  useEffect(() => {
    if (!isChatStreaming) return;

    const handleBeforeUnload = () => {
      if (!activeConversationId) return;

      logger.warn("[ChatSidebar] 页面卸载，尝试保存会话状态");

      const disconnectMessage: ChatUIMessage = {
        id: generateUUID("msg"),
        role: "system",
        parts: [
          {
            type: "text",
            text: t("chat:messages.connectionLost"),
          },
        ],
        metadata: {
          createdAt: Date.now(),
          isDisconnected: true,
        },
      };

      const baseMessages =
        chatService.getCachedMessages(activeConversationId) ?? displayMessages;

      const nextMessages = [...baseMessages, disconnectMessage];

      void chatService
        .saveNow(activeConversationId, nextMessages, {
          resolveConversationId,
          onConversationResolved: (resolvedId) => {
            setActiveConversationId(resolvedId);
          },
        })
        .then(() => {
          logger.info("[ChatSidebar] 断开连接消息已保存");
        })
        .catch((error) => {
          logger.error("[ChatSidebar] 保存断开连接消息失败:", error);
          push({
            variant: "danger",
            title: t("toasts.autoSaveFailed"),
            description: extractErrorMessage(error) ?? t("toasts.unknownError"),
          });
        });
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        logger.debug("[ChatSidebar] Tab切换到后台");
      } else {
        logger.debug("[ChatSidebar] Tab切换到前台");
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    activeConversationId,
    chatService,
    displayMessages,
    extractErrorMessage,
    isChatStreaming,
    push,
    resolveConversationId,
    setActiveConversationId,
    t,
  ]);

  // ========== 事件处理函数 ==========

  const submitMessage = async () => {
    const trimmedInput = input.trim();

    if (
      !trimmedInput ||
      !llmConfig ||
      configLoading ||
      isChatStreaming ||
      !canSendNewMessage
    ) {
      return;
    }

    let targetSessionId = activeConversationId;

    // 如果没有活动会话，立即启动异步创建（不阻塞消息发送）
    if (!targetSessionId) {
      logger.warn("[ChatSidebar] 检测到没有活动会话，立即启动异步创建新对话");

      // 生成临时 ID 用于追踪正在创建的对话
      const tempConversationId = `temp-${Date.now()}`;
      const conversationTitle = t("chat:messages.defaultConversation");

      // 立即启动异步创建对话，不等待完成
      const createPromise = createConversation(
        conversationTitle,
        currentProjectId,
      )
        .then((newConv) => {
          logger.debug(
            `[ChatSidebar] 异步创建对话完成: ${newConv.id} (标题: ${conversationTitle})`,
          );

          setActiveConversationId(newConv.id);
          setConversationMessages((prev) => ({ ...prev, [newConv.id]: [] }));
          creatingConversationPromiseRef.current = null;

          return newConv;
        })
        .catch((error) => {
          logger.error("[ChatSidebar] 异步创建新对话失败:", error);
          // 清理 ref
          if (
            creatingConversationPromiseRef.current?.conversationId ===
            tempConversationId
          ) {
            creatingConversationPromiseRef.current = null;
          }
          throw error;
        });

      // 保存到 ref 供 onFinish 等待
      creatingConversationPromiseRef.current = {
        promise: createPromise,
        conversationId: tempConversationId,
      };

      targetSessionId = tempConversationId;
    }

    sendingSessionIdRef.current = targetSessionId;
    logger.debug("[ChatSidebar] 开始发送消息到会话:", targetSessionId);

    setInput("");

    try {
      await sendMessage(
        { text: trimmedInput },
        {
          body: { llmConfig },
        },
      );
    } catch (error) {
      logger.error("[ChatSidebar] 发送消息失败:", error);
      sendingSessionIdRef.current = null;
      setInput(trimmedInput);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitMessage();
  };

  const handleCancel = useCallback(async () => {
    if (!isChatStreaming) return;

    logger.info("[ChatSidebar] 用户取消聊天");
    stop();

    const targetConversationId =
      activeConversationId ?? sendingSessionIdRef.current;

    if (!targetConversationId) {
      sendingSessionIdRef.current = null;
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
      setMessages(nextMessages);
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
      push({
        variant: "danger",
        title: t("toasts.autoSaveFailed"),
        description: extractErrorMessage(error) ?? t("toasts.unknownError"),
      });
    } finally {
      sendingSessionIdRef.current = null;
    }
  }, [
    activeConversationId,
    chatService,
    displayMessages,
    extractErrorMessage,
    isChatStreaming,
    push,
    resolveConversationId,
    setActiveConversationId,
    setMessages,
    stop,
    t,
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

    push({
      variant: "success",
      title: t("chat:messages.retryTitle"),
      description: t("chat:messages.retryDescription"),
    });

    logger.info("[ChatSidebar] 已准备重试上一条消息");
  }, [displayMessages, lastMessageIsUser, push, setInput, setMessages, t]);

  const handleNewChat = useCallback(async () => {
    try {
      const newConv = await createConversation(
        t("chat:messages.defaultConversation"),
        currentProjectId,
      );
      setActiveConversationId(newConv.id);
      setConversationMessages((prev) => ({ ...prev, [newConv.id]: [] }));
    } catch (error) {
      logger.error("[ChatSidebar] 创建新对话失败:", error);
    }
  }, [createConversation, currentProjectId, t]);

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

  const handleModelChange = useCallback(
    async (modelId: string) => {
      if (!modelId) return;

      const targetModel = models.find((model) => model.id === modelId);
      const providerId = targetModel?.providerId ?? null;

      setSelectedModelId(modelId);

      if (!providerId) {
        pushErrorToast("未找到该模型的供应商");
        return;
      }

      setSelectorLoading(true);
      setConfigLoading(true);

      try {
        await setActiveModel(providerId, modelId);
        const runtimeConfig = await getRuntimeConfig(providerId, modelId);
        setLlmConfig(
          runtimeConfig
            ? normalizeLLMConfig(runtimeConfig)
            : { ...DEFAULT_LLM_CONFIG },
        );
      } catch (error) {
        logger.error("[ChatSidebar] 切换模型失败:", error);
        pushErrorToast("模型切换失败，请稍后重试");
      } finally {
        setSelectorLoading(false);
        setConfigLoading(false);
      }
    },
    [getRuntimeConfig, models, pushErrorToast, setActiveModel],
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

  const selectedModelLabel = useMemo(() => {
    const matchedModel = models.find((model) => model.id === selectedModelId);
    if (matchedModel) {
      return matchedModel.displayName || matchedModel.modelName;
    }
    if (llmConfig?.modelName) return llmConfig.modelName;
    return t("chat:modelSelector.label");
  }, [llmConfig, models, selectedModelId, t]);

  if (currentView === "history") {
    return (
      <>
        <div className="chat-sidebar-content">
          <ChatHistoryView
            currentProjectId={currentProjectId}
            conversations={conversations}
            onSelectConversation={handleSelectFromHistory}
            onBack={handleHistoryBack}
            onDeleteConversations={handleBatchDelete}
            onExportConversations={handleBatchExport}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="chat-sidebar-content">
        {/* 消息内容区域 */}
        <div className="chat-messages-area">
          <MessageList
            messages={displayMessages}
            configLoading={configLoading}
            llmConfig={llmConfig}
            status={status}
            expandedToolCalls={expandedToolCalls}
            expandedThinkingBlocks={expandedThinkingBlocks}
            onToolCallToggle={handleToolCallToggle}
            onThinkingBlockToggle={handleThinkingBlockToggle}
          />
        </div>

        {/* 底部输入区域 - 一体化设计 */}
        <ChatInputArea
          input={input}
          setInput={setInput}
          isChatStreaming={isChatStreaming}
          configLoading={configLoading}
          llmConfig={llmConfig}
          canSendNewMessage={canSendNewMessage}
          lastMessageIsUser={lastMessageIsUser}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          onNewChat={handleNewChat}
          onHistory={handleHistory}
          onRetry={handleRetry}
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
      </div>
    </>
  );
}
