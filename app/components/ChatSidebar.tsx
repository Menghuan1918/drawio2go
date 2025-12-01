"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type FormEvent,
} from "react";
import { AlertTriangle } from "lucide-react";
import { useChat } from "@ai-sdk/react";
import {
  useStorageSettings,
  useStorageConversations,
  useStorageXMLVersions,
} from "@/app/hooks";
import { useToast } from "@/app/components/toast";
import { useI18n } from "@/app/i18n/hooks";
import { DEFAULT_PROJECT_UUID } from "@/app/lib/storage";
import type {
  ChatUIMessage,
  LLMConfig,
  MessageMetadata,
} from "@/app/types/chat";
import type { Conversation } from "@/app/lib/storage";
import { DEFAULT_LLM_CONFIG, normalizeLLMConfig } from "@/app/lib/config-utils";
import {
  createChatSessionService,
  fingerprintMessage,
  type ChatSessionService,
} from "@/app/lib/chat-session-service";

// 导入拆分后的组件
import ChatSessionHeader from "./chat/ChatSessionHeader";
import MessageList from "./chat/MessageList";
import ChatInputArea from "./chat/ChatInputArea";
import ChatHistoryView from "./chat/ChatHistoryView";

// 导出工具
import {
  exportBlobContent,
  exportSessionsAsJson,
  type ExportSessionPayload,
} from "./chat/utils/fileExport";

interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentProjectId?: string;
  isSocketConnected?: boolean;
}

// ========== 主组件 ==========

export default function ChatSidebar({
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
  const { getLLMConfig, error: settingsError } = useStorageSettings();

  const {
    createConversation,
    updateConversation,
    deleteConversation: deleteConversationFromStorage,
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
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { t, i18n } = useI18n();
  const { push } = useToast();
  const lastErrorRef = useRef<{
    chat?: string;
    settings?: string;
    conversations?: string;
  }>({});

  // ========== 引用 ==========
  const sendingSessionIdRef = useRef<string | null>(null);
  const creatingConversationPromiseRef = useRef<{
    promise: Promise<Conversation>;
    conversationId: string;
  } | null>(null);
  const creatingDefaultConversationRef = useRef(false);
  const chatServiceRef = useRef<ChatSessionService | null>(null);

  // ========== 派生状态 ==========
  const activeConversation = useMemo(() => {
    return conversations.find((c) => c.id === activeConversationId) || null;
  }, [conversations, activeConversationId]);

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
      setSaveError(normalizedMessage || null);

      if (normalizedMessage) {
        push({ variant: "danger", description: normalizedMessage });
      }
    },
    [push],
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
        onSavingChange: setIsSaving,
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

  useEffect(
    () => () => {
      chatService.dispose();
    },
    [chatService],
  );

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

      // 清理指纹缓存，防止已删除会话的指纹残留导致内存增长
      if (lastSyncedFingerprintsRef.current) {
        ids.forEach((id) => {
          delete lastSyncedFingerprintsRef.current![id];
        });
      }
    },
    [chatService],
  );

  const exportSessions = useCallback(
    async (sessions: ExportSessionPayload[], defaultFilename: string) => {
      const success = await exportSessionsAsJson(sessions, defaultFilename, {
        t,
        locale: i18n.language,
      });
      if (success) {
        showNotice(t("toasts.sessionExportSuccess"), "success");
      } else {
        showNotice(
          t("toasts.sessionExportFailed", {
            error: t("toasts.unknownError"),
          }),
          "danger",
        );
      }
    },
    [showNotice, t, i18n.language],
  );

  // ========== 初始化 ==========
  useEffect(() => {
    async function initialize() {
      try {
        // 1. 加载 LLM 配置
        const config = await getLLMConfig();
        if (config) {
          const normalized = normalizeLLMConfig(config);
          setLlmConfig(normalized);
        } else {
          setLlmConfig({ ...DEFAULT_LLM_CONFIG });
        }
        setConfigLoading(false);

        // 2. 确保有默认 XML 版本
        const xmlVersions = await getAllXMLVersions();
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
        console.error("[ChatSidebar] 初始化失败:", error);
        // 降级到默认配置
        setLlmConfig({ ...DEFAULT_LLM_CONFIG });
        setConfigLoading(false);
      }
    }

    initialize();
  }, [getLLMConfig, getAllXMLVersions, saveXML, currentProjectId, t]);

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
              console.error("[ChatSidebar] 创建默认对话失败:", error);
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
        console.error("[ChatSidebar] 会话订阅失败:", error);
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
        console.error("[ChatSidebar] 消息订阅失败:", error);
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
        console.error("[ChatSidebar] onFinish: 没有记录的目标会话ID");
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
        console.error("[ChatSidebar] 保存消息失败:", error);
      } finally {
        sendingSessionIdRef.current = null;
      }
    },
  });

  // 使用 ref 缓存 setMessages，避免因为引用变化导致依赖效应重复执行
  const setMessagesRef = useRef(setMessages);
  // 记录当前 useChat 消息与存储缓存的指纹，阻止相同数据反复触发状态更新
  const lastSyncedFingerprintsRef = useRef<Record<string, string[]> | null>(
    null,
  );

  useEffect(() => {
    setMessagesRef.current = setMessages;
  }, [setMessages]);

  const isChatStreaming = status === "submitted" || status === "streaming";

  const displayMessages = useMemo(
    () => messages.map(ensureMessageMetadata),
    [messages, ensureMessageMetadata],
  );

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
    const lastSynced = lastSyncedFingerprintsRef.current?.[targetConversationId];

    // 已同步过且内容未变化时直接跳过，避免无意义的 setState 循环
    if (areFingerprintsEqual(cachedFingerprints, lastSynced)) {
      return;
    }

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
        lastSyncedFingerprintsRef.current = {
          ...(lastSyncedFingerprintsRef.current ?? {}),
          [targetConversationId]: cachedFingerprints,
        };
        return current;
      }

      lastSyncedFingerprintsRef.current = {
        ...(lastSyncedFingerprintsRef.current ?? {}),
        [targetConversationId]: cachedFingerprints,
      };

      return cached;
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

    const cached = conversationMessages[activeConversationId];
    const cachedFingerprints = cached?.map(fingerprintMessage);
    const currentFingerprints = displayMessages.map(fingerprintMessage);

    // 缓存与当前展示相同则无需再次触发同步，避免写-读循环
    if (areFingerprintsEqual(cachedFingerprints, currentFingerprints)) {
      return;
    }

    chatService.syncMessages(activeConversationId, displayMessages, {
      resolveConversationId,
    });
  }, [
    activeConversationId,
    chatService,
    displayMessages,
    conversationMessages,
    areFingerprintsEqual,
    resolveConversationId,
  ]);

  useEffect(() => {
    const message = extractErrorMessage(settingsError);
    if (message && lastErrorRef.current.settings !== message) {
      lastErrorRef.current.settings = message;
      pushErrorToast(message, t("toasts.settingsLoadFailed"));
    }
  }, [extractErrorMessage, settingsError, pushErrorToast, t]);

  useEffect(() => {
    const message = extractErrorMessage(conversationsError);
    if (message && lastErrorRef.current.conversations !== message) {
      lastErrorRef.current.conversations = message;
      pushErrorToast(message, t("toasts.conversationsSyncFailed"));
    }
  }, [conversationsError, extractErrorMessage, pushErrorToast, t]);

  useEffect(() => {
    const message = extractErrorMessage(chatError);

    if (message && lastErrorRef.current.chat !== message) {
      lastErrorRef.current.chat = message;
      pushErrorToast(message, t("toasts.chatRequestFailed"));
    }
  }, [chatError, extractErrorMessage, pushErrorToast, t]);

  // ========== 事件处理函数 ==========

  const submitMessage = async () => {
    const trimmedInput = input.trim();

    if (!trimmedInput || !llmConfig || configLoading || isChatStreaming) {
      return;
    }

    let targetSessionId = activeConversationId;

    // 如果没有活动会话，立即启动异步创建（不阻塞消息发送）
    if (!targetSessionId) {
      console.warn("[ChatSidebar] 检测到没有活动会话，立即启动异步创建新对话");

      // 生成临时 ID 用于追踪正在创建的对话
      const tempConversationId = `temp-${Date.now()}`;
      const conversationTitle = t("chat:messages.defaultConversation");

      // 立即启动异步创建对话，不等待完成
      const createPromise = createConversation(
        conversationTitle,
        currentProjectId,
      )
        .then((newConv) => {
          console.log(
            `[ChatSidebar] 异步创建对话完成: ${newConv.id} (标题: ${conversationTitle})`,
          );

          setActiveConversationId(newConv.id);
          setConversationMessages((prev) => ({ ...prev, [newConv.id]: [] }));
          creatingConversationPromiseRef.current = null;

          return newConv;
        })
        .catch((error) => {
          console.error("[ChatSidebar] 异步创建新对话失败:", error);
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
    console.log("[ChatSidebar] 开始发送消息到会话:", targetSessionId);

    setInput("");

    try {
      await sendMessage(
        { text: trimmedInput },
        {
          body: { llmConfig },
        },
      );
    } catch (error) {
      console.error("[ChatSidebar] 发送消息失败:", error);
      sendingSessionIdRef.current = null;
      setInput(trimmedInput);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitMessage();
  };

  const handleCancel = () => {
    if (isChatStreaming) {
      stop();
    }
  };

  const handleNewChat = useCallback(async () => {
    try {
      const newConv = await createConversation(
        t("chat:messages.defaultConversation"),
        currentProjectId,
      );
      setActiveConversationId(newConv.id);
      setConversationMessages((prev) => ({ ...prev, [newConv.id]: [] }));
    } catch (error) {
      console.error("[ChatSidebar] 创建新对话失败:", error);
    }
  }, [createConversation, currentProjectId, t]);

  const handleHistory = () => {
    setCurrentView("history");
  };

  const handleDeleteSession = useCallback(async () => {
    if (!activeConversation) return;

    if (conversations.length === 1) {
      showNotice(t("toasts.sessionDeleteKeepOne"), "warning");
      return;
    }

    if (
      confirm(t("chat:aria.deleteConfirm", { title: activeConversation.title }))
    ) {
      try {
        await deleteConversationFromStorage(activeConversation.id);

        setActiveConversationId(null);
        removeConversationsFromState([activeConversation.id]);
      } catch (error) {
        console.error("[ChatSidebar] 删除对话失败:", error);
        const errorMessage =
          extractErrorMessage(error) ?? t("toasts.unknownError");
        showNotice(
          t("toasts.sessionDeleteFailed", { error: errorMessage }),
          "danger",
        );
      }
    }
  }, [
    activeConversation,
    extractErrorMessage,
    conversations.length,
    deleteConversationFromStorage,
    removeConversationsFromState,
    showNotice,
    t,
  ]);

  const handleExportSession = async () => {
    if (!activeConversation) return;

    const messages = await ensureMessagesForConversation(activeConversation.id);
    await exportSessions(
      [
        {
          id: activeConversation.id,
          title: activeConversation.title,
          messages,
          createdAt: activeConversation.created_at,
          updatedAt: activeConversation.updated_at,
        },
      ],
      `chat-${activeConversation.title}.json`,
    );
  };

  const handleExportAllSessions = async () => {
    const allSessions = await Promise.all(
      conversations.map(async (conv) => ({
        id: conv.id,
        title: conv.title,
        messages: await ensureMessagesForConversation(conv.id),
        createdAt: conv.created_at,
        updatedAt: conv.updated_at,
      })),
    );

    await exportSessions(
      allSessions,
      `all-chats-${new Date().toISOString().split("T")[0]}.json`,
    );
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
      const remaining = conversations.length - ids.length;
      if (remaining <= 0) {
        const confirmed = confirm(t("chat:aria.deleteAllConfirm"));
        if (!confirmed) return;
      }

      const deletingActive =
        activeConversationId != null && ids.includes(activeConversationId);

      try {
        await batchDeleteConversations(ids);
        removeConversationsFromState(ids);
        if (deletingActive) {
          setActiveConversationId(null);
        }
      } catch (error) {
        console.error("[ChatSidebar] 批量删除对话失败:", error);
        const errorMessage =
          extractErrorMessage(error) ?? t("toasts.unknownError");
        showNotice(
          t("toasts.batchDeleteFailed", { error: errorMessage }),
          "danger",
        );
      }
    },
    [
      activeConversationId,
      batchDeleteConversations,
      conversations.length,
      extractErrorMessage,
      removeConversationsFromState,
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
        console.error("[ChatSidebar] 批量导出对话失败:", error);
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

  const showSocketWarning = !isSocketConnected;

  if (currentView === "history") {
    return (
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
    );
  }

  return (
    <div className="chat-sidebar-content">
      {/* 消息内容区域 - 无分隔线一体化设计 */}
      <div className="chat-messages-area">
        {/* 会话标题栏 */}
        <ChatSessionHeader
          activeSession={
            activeConversation
              ? {
                  id: activeConversation.id,
                  title: activeConversation.title,
                  messages: conversationMessages[activeConversation.id] || [],
                  createdAt: activeConversation.created_at,
                  updatedAt: activeConversation.updated_at,
                }
              : null
          }
          isSaving={isSaving}
          saveError={saveError}
          onHistoryClick={handleHistory}
          onDeleteSession={handleDeleteSession}
          onExportSession={handleExportSession}
          onExportAllSessions={handleExportAllSessions}
        />

        {showSocketWarning && (
          <div className="chat-inline-warning" role="status">
            <span className="chat-inline-warning-icon" aria-hidden>
              <AlertTriangle size={16} />
            </span>
            <div className="chat-inline-warning-text">
              <p>{t("chat:status.socketDisconnected")}</p>
              <p>{t("chat:status.socketWarning")}</p>
            </div>
          </div>
        )}

        {/* 消息列表 */}
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
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        onNewChat={handleNewChat}
        onHistory={handleHistory}
      />
    </div>
  );
}
