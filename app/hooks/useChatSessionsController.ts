"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useStorageConversations } from "./useStorageConversations";
import { useStorageXMLVersions } from "./useStorageXMLVersions";
import { DEFAULT_PROJECT_UUID } from "@/app/lib/storage";
import type { Conversation } from "@/app/lib/storage";
import {
  createChatSessionService,
  type ChatSessionService,
} from "@/app/lib/chat-session-service";
import { generateUUID } from "@/app/lib/utils";
import type { ChatUIMessage } from "@/app/types/chat";
import { isAbnormalExitNoticeMessage } from "@/app/lib/type-guards";
import { createLogger } from "@/lib/logger";

const logger = createLogger("useChatSessionsController");

interface UseChatSessionsControllerOptions {
  currentProjectId?: string;
  t: (key: string, fallback?: string) => string;
  ensureMessageMetadata: (message: ChatUIMessage) => ChatUIMessage;
  onSaveError?: (message: string) => void;
  onMessagesChange?: (
    conversationId: string,
    messages: ChatUIMessage[],
  ) => void;
}

interface UseChatSessionsControllerResult {
  conversations: Conversation[];
  activeConversationId: string | null;
  setActiveConversationId: Dispatch<SetStateAction<string | null>>;
  conversationMessages: Record<string, ChatUIMessage[]>;
  abnormalExitConversations: Set<string>;
  defaultXmlVersionId: string | null;
  isLoadingConversations: boolean;
  error: Error | null;
  chatService: ChatSessionService;
  createConversation: (
    title?: string,
    projectId?: string,
  ) => Promise<Conversation>;
  switchConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  updateConversationTitle: (id: string, title: string) => Promise<void>;
  ensureMessagesForConversation: (
    conversationId: string,
  ) => Promise<ChatUIMessage[]>;
  resolveConversationId: (conversationId: string) => Promise<string>;
  startTempConversation: (title?: string) => string;
  removeConversationsFromState: (ids: string[]) => void;
  handleAbnormalExitIfNeeded: (conversationId: string | null) => Promise<void>;
  markConversationAsStreaming: (id: string) => Promise<void>;
  markConversationAsCompleted: (id: string) => Promise<void>;
  loadConversationWithStatus: (
    conversationId: string,
  ) => Promise<{ conversation: Conversation | null; hasAbnormalExit: boolean }>;
  exportConversations: (ids: string[]) => Promise<Blob>;
  batchDeleteConversations: (ids: string[]) => Promise<void>;
}

export function useChatSessionsController(
  options: UseChatSessionsControllerOptions,
): UseChatSessionsControllerResult {
  const {
    currentProjectId,
    t,
    ensureMessageMetadata,
    onSaveError,
    onMessagesChange,
  } = options;
  const projectUuid = currentProjectId ?? DEFAULT_PROJECT_UUID;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationMessages, setConversationMessages] = useState<
    Record<string, ChatUIMessage[]>
  >({});
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [abnormalExitConversations, setAbnormalExitConversations] = useState<
    Set<string>
  >(new Set());
  const [defaultXmlVersionId, setDefaultXmlVersionId] = useState<string | null>(
    null,
  );
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const creatingConversationPromiseRef = useRef<{
    promise: Promise<Conversation>;
    conversationId: string;
  } | null>(null);
  const creatingDefaultConversationRef = useRef(false);

  const {
    createConversation: createConversationRaw,
    deleteConversation: deleteConversationRaw,
    updateConversation,
    batchDeleteConversations,
    exportConversations,
    getMessages,
    addMessages,
    subscribeToConversations,
    subscribeToMessages,
    markConversationAsStreaming,
    markConversationAsCompleted,
    loadConversationWithStatus,
    error: conversationsError,
  } = useStorageConversations();

  const { getAllXMLVersions, saveXML } = useStorageXMLVersions();

  const chatServiceRef = useRef<ChatSessionService | null>(null);

  const handleMessagesChange = useCallback(
    (conversationId: string, messages: ChatUIMessage[]) => {
      setConversationMessages((prev) => ({
        ...prev,
        [conversationId]: messages,
      }));
      onMessagesChange?.(conversationId, messages);
    },
    [onMessagesChange],
  );

  const handleSaveError = useCallback(
    (message: string) => {
      if (!message) return;
      onSaveError?.(message);
    },
    [onSaveError],
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
    const message = conversationsError?.message;
    if (message) {
      setError(conversationsError);
    }
  }, [conversationsError]);

  const ensureMessagesForConversation = useCallback(
    (conversationId: string) => chatService.ensureMessages(conversationId),
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

  const createConversation = useCallback(
    async (title?: string, projectId?: string) => {
      const resolvedProject = projectId ?? projectUuid;
      const conversation = await createConversationRaw(
        title ?? t("chat:messages.defaultConversation"),
        resolvedProject,
      );
      setConversationMessages((prev) => ({
        ...prev,
        [conversation.id]: prev[conversation.id] ?? [],
      }));
      setActiveConversationId(conversation.id);
      return conversation;
    },
    [createConversationRaw, projectUuid, t],
  );

  const startTempConversation = useCallback(
    (title?: string) => {
      const tempConversationId = `temp-${Date.now()}`;
      const conversationTitle =
        title ?? t("chat:messages.defaultConversation", "新对话");

      const createPromise = createConversation(
        conversationTitle,
        projectUuid,
      ).finally(() => {
        creatingConversationPromiseRef.current = null;
      });

      creatingConversationPromiseRef.current = {
        promise: createPromise,
        conversationId: tempConversationId,
      };

      return tempConversationId;
    },
    [createConversation, projectUuid, t],
  );

  const switchConversation = useCallback(
    async (id: string) => {
      await ensureMessagesForConversation(id);
      setActiveConversationId(id);
    },
    [ensureMessagesForConversation],
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      await deleteConversationRaw(id);
      setConversationMessages((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      chatService.removeConversationCaches([id]);
      setConversations((prev) => prev.filter((conv) => conv.id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
      }
    },
    [activeConversationId, chatService, deleteConversationRaw],
  );

  const updateConversationTitle = useCallback(
    (id: string, title: string) => updateConversation(id, { title }),
    [updateConversation],
  );

  const removeConversationsFromState = useCallback(
    (ids: string[]) => {
      setConversationMessages((prev) => {
        const next = { ...prev };
        ids.forEach((id) => delete next[id]);
        return next;
      });
      chatService.removeConversationCaches(ids);
    },
    [chatService],
  );

  useEffect(() => {
    let isUnmounted = false;

    async function initialize() {
      try {
        const xmlVersions = await getAllXMLVersions(projectUuid);
        if (isUnmounted) return;

        let defaultVersionId: string;

        if (xmlVersions.length === 0) {
          const defaultXml = await saveXML(
            '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>',
            projectUuid,
            undefined,
            t("chat:messages.defaultVersion"),
            t("chat:messages.initialVersion"),
          );
          defaultVersionId = defaultXml;
        } else {
          defaultVersionId = xmlVersions[0].id;
        }

        setDefaultXmlVersionId(defaultVersionId);
      } catch (initError) {
        logger.error(
          "[useChatSessionsController] 初始化 XML 版本失败:",
          initError,
        );
      }
    }

    void initialize();

    return () => {
      isUnmounted = true;
    };
  }, [getAllXMLVersions, projectUuid, saveXML, t]);

  useEffect(() => {
    let isUnmounted = false;
    setIsLoadingConversations(true);

    const unsubscribe = chatService.subscribeConversations(
      projectUuid,
      (list) => {
        if (isUnmounted) return;
        setIsLoadingConversations(false);
        setConversations(list);

        if (list.length === 0) {
          if (creatingDefaultConversationRef.current) return;
          creatingDefaultConversationRef.current = true;
          const defaultConversationTitle = t(
            "chat:messages.defaultConversation",
          );
          createConversation(defaultConversationTitle, projectUuid)
            .catch((convError) => {
              logger.error(
                "[useChatSessionsController] 创建默认对话失败:",
                convError,
              );
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
      (subscribeError) => {
        if (isUnmounted) return;
        setError(subscribeError);
        setIsLoadingConversations(false);
      },
    );

    return () => {
      isUnmounted = true;
      unsubscribe?.();
    };
  }, [chatService, createConversation, projectUuid, t]);

  useEffect(() => {
    if (!activeConversationId) return undefined;

    const unsubscribe = chatService.subscribeMessages(
      activeConversationId,
      (subscribeError) => {
        logger.error(
          "[useChatSessionsController] 消息订阅失败:",
          subscribeError,
        );
      },
    );

    chatService.ensureMessages(activeConversationId).catch((err) => {
      logger.error("[useChatSessionsController] 消息加载失败:", err);
    });

    return unsubscribe;
  }, [activeConversationId, chatService]);

  const handleAbnormalExitIfNeeded = useCallback(
    async (conversationId: string | null) => {
      if (!conversationId) return;

      try {
        const resolvedId = await resolveConversationId(conversationId);
        const { hasAbnormalExit } =
          await loadConversationWithStatus(resolvedId);

        if (!hasAbnormalExit) {
          setAbnormalExitConversations((prev) => {
            if (!prev.has(resolvedId)) return prev;
            const next = new Set(prev);
            next.delete(resolvedId);
            return next;
          });
          return;
        }

        setAbnormalExitConversations((prev) => {
          if (prev.has(resolvedId)) return prev;
          const next = new Set(prev);
          next.add(resolvedId);
          return next;
        });

        const baseMessages =
          (await chatService.ensureMessages(resolvedId)) ?? [];
        const hasNotice = baseMessages.some(isAbnormalExitNoticeMessage);

        if (hasNotice) return;

        const noticeMessage: ChatUIMessage = {
          id: generateUUID("sys"),
          role: "system",
          parts: [
            {
              type: "text",
              text: "[系统] 检测到上次对话异常退出",
            },
          ],
          metadata: {
            createdAt: Date.now(),
            isAbnormalExitNotice: true,
          },
        };

        const nextMessages = [noticeMessage, ...baseMessages];
        await chatService.saveNow(resolvedId, nextMessages, {
          resolveConversationId,
          onConversationResolved: (finalId) => {
            setActiveConversationId(finalId);
          },
        });
      } catch (abnormalError) {
        logger.error("[useChatSessionsController] 检测/处理异常退出失败:", {
          conversationId,
          error: abnormalError,
        });
      }
    },
    [chatService, loadConversationWithStatus, resolveConversationId],
  );

  useEffect(() => {
    return () => {
      chatServiceRef.current?.dispose();
    };
  }, []);

  return {
    conversations,
    activeConversationId,
    setActiveConversationId,
    conversationMessages,
    abnormalExitConversations,
    defaultXmlVersionId,
    isLoadingConversations,
    error,
    chatService,
    createConversation,
    switchConversation,
    deleteConversation,
    updateConversationTitle,
    ensureMessagesForConversation,
    resolveConversationId,
    startTempConversation,
    removeConversationsFromState,
    handleAbnormalExitIfNeeded,
    markConversationAsStreaming,
    markConversationAsCompleted,
    loadConversationWithStatus,
    exportConversations,
    batchDeleteConversations,
  };
}
