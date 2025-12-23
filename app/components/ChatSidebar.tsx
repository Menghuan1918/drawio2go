"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type FormEvent,
  type RefObject,
  type MutableRefObject,
} from "react";
import { Alert } from "@heroui/react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  asSchema,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai";
import {
  useChatLock,
  useNetworkStatus,
  useChatSessionsController,
  useLLMConfig,
  useOperationToast,
  useStorageSettings,
  useStorageXMLVersions,
  useMcpServer,
  useChatMessages,
  useChatToolExecution,
  useChatNetworkControl,
  useChatLifecycle,
  usePageSelection,
} from "@/app/hooks";
import {
  isFatalToolError,
  type AddToolResultFn,
} from "@/app/hooks/useChatToolExecution";
import { useAlertDialog } from "@/app/components/alert";
import { useI18n } from "@/app/i18n/hooks";
import {
  DEFAULT_FIRST_VERSION,
  DEFAULT_PROJECT_UUID,
  getStorage,
  WIP_VERSION,
} from "@/app/lib/storage";
import type { ChatUIMessage, MessageMetadata } from "@/app/types/chat";
import { DEFAULT_LLM_CONFIG } from "@/app/lib/config-utils";
import type { DrawioEditorRef } from "@/app/components/DrawioEditorNative";
import { getDrawioXML, replaceDrawioXML } from "@/app/lib/drawio-tools";
import type { DrawioReadResult } from "@/app/types/drawio-tools";
import {
  createFrontendDrawioTools,
  type FrontendToolContext,
} from "@/app/lib/frontend-tools";
import { DrainableToolQueue } from "@/app/lib/drainable-tool-queue";
import { ChatRunStateMachine } from "@/app/lib/chat-run-state-machine";
import { withTimeout } from "@/app/lib/utils";
import type { McpConfig, McpToolRequest } from "@/app/types/mcp";
import { McpExposureOverlay } from "@/app/components/mcp";
import { useImageAttachments } from "@/hooks/useImageAttachments";
import { fileToDataUrl } from "@/lib/image-message-utils";
import { toErrorString } from "@/lib/error-handler";

import ChatHistoryView from "./chat/ChatHistoryView";
import ChatShell from "./chat/ChatShell";
import MessagePane from "./chat/MessagePane";
import Composer from "./chat/Composer";

import { exportBlobContent } from "./chat/utils/fileExport";
import { createLogger } from "@/lib/logger";
import { hasConversationIdMetadata } from "@/app/lib/type-guards";
import { getNextSubVersion, isSubVersion } from "@/app/lib/version-utils";
import type { XMLVersion } from "@/app/lib/storage";

const logger = createLogger("ChatSidebar");
type UseChatMessage = UIMessage<MessageMetadata>;

// ========== 辅助函数 ==========

const CANVAS_CONTEXT_MAX_ITEMS = 100;

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

const CHAT_REQUEST_TIMEOUT_MS = 10 * 60_000;
const MCP_TOOL_TIMEOUT_MS = 25_000;

const isEnabledSetting = (raw: string | null): boolean =>
  raw !== "0" && raw !== "false";

const pickLatestMainVersion = (versions: XMLVersion[]): string | null => {
  let picked: XMLVersion | null = null;
  for (const version of versions) {
    if (version.semantic_version === WIP_VERSION) continue;
    if (isSubVersion(version.semantic_version)) continue;
    if (!picked || version.created_at > picked.created_at) {
      picked = version;
    }
  }
  return picked?.semantic_version ?? null;
};

async function createDrawioXmlSnapshot(
  editorRef: RefObject<DrawioEditorRef | null>,
): Promise<string> {
  try {
    const editor = editorRef.current;
    if (editor) {
      const xml = await editor.exportDiagram();
      if (typeof xml === "string" && xml.trim()) return xml;
    }
  } catch (error) {
    logger.warn("[ChatSidebar] 获取编辑器 XML 快照失败，尝试降级到存储", {
      error,
    });
  }

  const storageResult = await getDrawioXML();
  if (storageResult.success) return storageResult.xml;
  throw new Error(
    storageResult.message || storageResult.error || "无法获取 DrawIO XML 快照",
  );
}

async function enqueueAndWait<T>(
  queue: DrainableToolQueue,
  task: () => Promise<T>,
): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    queue.enqueue(async () => {
      try {
        resolve(await task());
      } catch (error) {
        reject(error);
        throw error;
      }
    });
  });
}

function mergeAbortSignals(
  signals: Array<AbortSignal | undefined>,
): AbortSignal {
  const controller = new AbortController();

  const onAbort = () => {
    controller.abort();
  };

  for (const signal of signals) {
    if (!signal) continue;
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  }

  return controller.signal;
}

function buildToolSchemaPayload(
  tools: Record<string, { description?: string; inputSchema: unknown }>,
) {
  const payload: Record<
    string,
    {
      description?: string;
      inputJsonSchema: unknown;
    }
  > = {};

  for (const [name, tool] of Object.entries(tools)) {
    payload[name] = {
      description: tool.description,
      inputJsonSchema: asSchema(tool.inputSchema as never).jsonSchema,
    };
  }

  return payload;
}

function formatDrawioStatusTag(items: Array<{ id: string; type: string }>) {
  const filtered = items.filter((item) => item.id !== "0" && item.id !== "1");

  const total = filtered.length;
  const sliced = filtered.slice(0, CANVAS_CONTEXT_MAX_ITEMS);

  let payload = sliced.map((item) => `${item.id}:${item.type}`).join(",");
  if (total > CANVAS_CONTEXT_MAX_ITEMS) {
    payload = payload
      ? `${payload},...(truncated, total: ${total})`
      : `...(truncated, total: ${total})`;
  }

  return `<drawio_status content="id:type">${payload}</drawio_status>`;
}

function formatUserSelectTag(ids: readonly string[]) {
  const normalized = ids.map((id) => id.trim()).filter((id) => id.length > 0);
  if (normalized.length === 0) return null;
  return `<user_select>${normalized.join(",")}</user_select>`;
}

async function buildCanvasContextPrefix(options: {
  drawioReadTool: unknown;
  isAppEnv: boolean;
  selectionIds: readonly string[];
}): Promise<string | null> {
  const { drawioReadTool, isAppEnv, selectionIds } = options;

  const tool = drawioReadTool as
    | { execute?: (input: unknown) => Promise<unknown> }
    | undefined;
  if (!tool?.execute) return null;

  const raw = (await tool.execute({ filter: "all" })) as unknown;
  if (!raw || typeof raw !== "object") return null;

  const result = raw as DrawioReadResult;
  if (!("success" in result) || result.success !== true) return null;
  const list = "list" in result ? result.list : undefined;
  if (!Array.isArray(list)) return null;

  const items = list
    .map((entry) => ({
      id: entry.id,
      type: entry.type,
    }))
    .filter((entry) => Boolean(entry.id));

  const lines: string[] = [formatDrawioStatusTag(items)];
  if (isAppEnv) {
    const selectTag = formatUserSelectTag(selectionIds);
    if (selectTag) lines.push(selectTag);
  }
  return lines.join("\n");
}

function injectPrefixIntoLastUserMessage(options: {
  messages: UseChatMessage[];
  prefix: string;
}): UseChatMessage[] {
  const { messages, prefix } = options;

  let targetIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      targetIndex = i;
      break;
    }
  }
  if (targetIndex < 0) return messages;

  const target = messages[targetIndex] as unknown as {
    parts?: unknown;
    content?: unknown;
  };

  const parts = Array.isArray(target.parts) ? target.parts : null;
  const originalContent =
    typeof target.content === "string" ? target.content : "";

  const mergeText = (text: string) => (text ? `${prefix}\n${text}` : prefix);

  let nextMessage: UseChatMessage | null = null;

  if (parts) {
    const firstTextIndex = parts.findIndex(
      (part) =>
        part &&
        typeof part === "object" &&
        (part as { type?: unknown }).type === "text",
    );

    if (firstTextIndex >= 0) {
      const textPart = parts[firstTextIndex] as { text?: unknown };
      const originalText =
        typeof textPart.text === "string" ? textPart.text : "";

      const nextParts = parts.map((part, index) => {
        if (index !== firstTextIndex) return part;
        return {
          ...(part as Record<string, unknown>),
          text: mergeText(originalText),
        };
      });

      nextMessage = {
        ...(messages[targetIndex] as UseChatMessage),
        parts: nextParts,
        content: mergeText(originalContent),
      } as UseChatMessage;
    } else {
      const nextParts = [{ type: "text", text: prefix }, ...parts];
      nextMessage = {
        ...(messages[targetIndex] as UseChatMessage),
        parts: nextParts,
        content: mergeText(originalContent),
      } as UseChatMessage;
    }
  } else if (typeof target.content === "string") {
    nextMessage = {
      ...(messages[targetIndex] as UseChatMessage),
      content: mergeText(target.content),
    } as UseChatMessage;
  }

  if (!nextMessage) return messages;

  const next = messages.slice();
  next[targetIndex] = nextMessage;
  return next;
}

async function maybeInjectCanvasContext(options: {
  enabled: boolean;
  messages: UseChatMessage[];
  drawioReadTool: unknown;
  isAppEnv: boolean;
  selectionIds: readonly string[];
}): Promise<UseChatMessage[]> {
  const { enabled, messages, drawioReadTool, isAppEnv, selectionIds } = options;
  if (!enabled) return messages;

  try {
    const prefix = await buildCanvasContextPrefix({
      drawioReadTool,
      isAppEnv,
      selectionIds,
    });
    if (!prefix) return messages;

    return injectPrefixIntoLastUserMessage({ messages, prefix });
  } catch (error) {
    logger.error("获取画布上下文失败，已降级为不注入", { error });
    return messages;
  }
}

async function getDrawioXmlFromRef(
  drawioRef: RefObject<DrawioEditorRef | null>,
): Promise<string> {
  if (drawioRef.current) {
    const xml = await drawioRef.current.exportDiagram();
    if (typeof xml === "string" && xml.trim()) return xml;
  }

  const storageResult = await getDrawioXML();
  if (storageResult.success) return storageResult.xml;
  throw new Error(
    storageResult.message || storageResult.error || "无法获取 DrawIO XML",
  );
}

async function replaceDrawioXmlFromRef(
  drawioRef: RefObject<DrawioEditorRef | null>,
  xml: string,
  options?: { requestId?: string; description?: string },
): Promise<{ success: boolean; error?: string }> {
  const result = await replaceDrawioXML(xml, {
    editorRef: drawioRef,
    requestId: options?.requestId,
    description: options?.description,
  });

  if (!result.success) {
    return {
      success: false,
      error: result.error || result.message || "replace_failed",
    };
  }

  return { success: true };
}

interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentProjectId?: string;
  editorRef: RefObject<DrawioEditorRef | null>;
  selectionRef?: MutableRefObject<string[]>;
}

// ========== 主组件 ==========

export default function ChatSidebar({
  isOpen = true,
  currentProjectId,
  editorRef,
  selectionRef,
}: ChatSidebarProps) {
  // ========== 基础状态 ==========
  const [input, setInput] = useState("");
  const [isCanvasContextEnabled, setIsCanvasContextEnabled] = useState(true);
  const isCanvasContextEnabledRef = useRef(false);
  const [pageSelectorXml, setPageSelectorXml] = useState<string | null>(null);
  const [expandedToolCalls, setExpandedToolCalls] = useState<
    Record<string, boolean>
  >({});
  const [expandedThinkingBlocks, setExpandedThinkingBlocks] = useState<
    Record<string, boolean>
  >({});
  const [currentView, setCurrentView] = useState<"chat" | "history">("chat");
  const [isMcpConfigOpen, setIsMcpConfigOpen] = useState(false);
  const mcpOverlayContainerRef = useRef<HTMLDivElement | null>(null);
  const [mcpOverlayPortalContainer, setMcpOverlayPortalContainer] =
    useState<Element | null>(null);
  const chatShellContainerRef = useRef<HTMLDivElement | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refreshPageSelectorXml = useCallback(async (): Promise<
    string | null
  > => {
    try {
      const xmlSnapshot = await createDrawioXmlSnapshot(editorRef);
      if (isMountedRef.current) {
        setPageSelectorXml(xmlSnapshot);
      }
      return xmlSnapshot;
    } catch (error) {
      logger.warn("[ChatSidebar] 获取页面选择器 XML 快照失败", { error });
      if (isMountedRef.current) {
        setPageSelectorXml(null);
      }
      return null;
    }
  }, [editorRef]);

  const pageSelection = usePageSelection({ xml: pageSelectorXml });
  const selectedPageIdsRef = useRef<Set<string>>(new Set());
  const isAllSelectedPagesRef = useRef(true);

  useEffect(() => {
    selectedPageIdsRef.current = pageSelection.selectedPageIds;
    isAllSelectedPagesRef.current = pageSelection.isAllSelected;
  }, [pageSelection.isAllSelected, pageSelection.selectedPageIds]);

  // ========== Hooks 聚合 ==========
  const { t, i18n } = useI18n();
  const { open: openAlertDialog } = useAlertDialog();
  const { pushErrorToast, showNotice, extractErrorMessage } =
    useOperationToast();
  const imageAttachments = useImageAttachments();
  const mcpServer = useMcpServer();
  const { getSetting } = useStorageSettings();
  const { createHistoricalVersion, getAllXMLVersions } =
    useStorageXMLVersions();

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

  const translate = useCallback(
    (key: string, fallback?: string) => t(key, fallback ?? key),
    [t],
  );

  const resolvedProjectUuid = currentProjectId ?? DEFAULT_PROJECT_UUID;
  const { canChat, lockHolder, acquireLock, releaseLock } =
    useChatLock(resolvedProjectUuid);
  const { isOnline, offlineReason } = useNetworkStatus();

  useEffect(() => {
    setMcpOverlayPortalContainer(mcpOverlayContainerRef.current);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    refreshPageSelectorXml().catch((error) => {
      logger.warn("[ChatSidebar] 初始化页面选择器 XML 快照失败", { error });
    });
  }, [isOpen, refreshPageSelectorXml, resolvedProjectUuid]);

  useEffect(() => {
    isCanvasContextEnabledRef.current = isCanvasContextEnabled;
  }, [isCanvasContextEnabled]);

  const isMcpExposureOverlayOpen =
    isOpen &&
    Boolean(mcpOverlayPortalContainer) &&
    mcpServer.running &&
    Boolean(mcpServer.host) &&
    Boolean(mcpServer.port);

  useEffect(() => {
    const el = chatShellContainerRef.current;
    if (!el) return;

    // 仅禁用聊天内容的交互（含键盘焦点），不影响 DrawIO / 设置 / 版本等区域。
    if (isMcpExposureOverlayOpen) el.setAttribute("inert", "");
    else el.removeAttribute("inert");
  }, [isMcpExposureOverlayOpen]);

  useEffect(() => {
    if (mcpServer.running || mcpServer.isLoading) {
      setIsMcpConfigOpen(false);
    }
  }, [mcpServer.isLoading, mcpServer.running]);

  const handleMcpConfigOpenChange = useCallback(
    (open: boolean) => {
      if (open && (mcpServer.running || mcpServer.isLoading)) return;
      setIsMcpConfigOpen(open);
    },
    [mcpServer.isLoading, mcpServer.running],
  );

  const handleCanvasContextToggle = useCallback(() => {
    setIsCanvasContextEnabled((prev) => !prev);
  }, []);

  const handleConfirmMcpConfig = useCallback(
    async (config: McpConfig) => {
      await mcpServer.startServer(config);
    },
    [mcpServer],
  );

  const handleStopMcp = useCallback(() => {
    mcpServer.stopServer().catch((error) => {
      logger.warn("[ChatSidebar] 停止 MCP 失败", { error });
    });
  }, [mcpServer]);

  // ========== 引用 ==========
  const imageDataUrlCacheRef = useRef<Map<string, string>>(new Map());
  const imageDataUrlPendingRef = useRef<Map<string, Promise<string | null>>>(
    new Map(),
  );
  const alertOwnerRef = useRef<"single-delete" | "batch-delete" | null>(null);
  const reasoningTimersRef = useRef<Map<string, number>>(new Map());
  const finishReasonRef = useRef<string | null>(null);

  // 状态机
  const stateMachine = useRef(new ChatRunStateMachine());
  const activeRequestAbortRef = useRef<AbortController | null>(null);

  const safeTransition = useCallback(
    (
      event: Parameters<ChatRunStateMachine["transition"]>[0],
      reason: string,
    ): void => {
      try {
        if (!stateMachine.current.canTransition(event)) {
          logger.warn("[ChatSidebar] 状态转换被跳过（不可转换）", {
            event,
            reason,
            currentState: stateMachine.current.getState(),
          });
          return;
        }

        logger.info("[ChatSidebar] 状态转换", {
          event,
          reason,
          from: stateMachine.current.getState(),
        });
        stateMachine.current.transition(event);
      } catch (transitionError) {
        logger.error("[ChatSidebar] 状态转换失败", {
          event,
          reason,
          transitionError,
        });
      }
    },
    [],
  );

  // ========== 派生状态 ==========
  const fallbackModelName = useMemo(
    () => llmConfig?.modelName ?? DEFAULT_LLM_CONFIG.modelName,
    [llmConfig],
  );

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

      const normalizedModelName = (() => {
        if (typeof rawMetadata.modelName === "string") {
          const trimmed = rawMetadata.modelName.trim();
          return trimmed.length > 0 ? trimmed : null;
        }
        return rawMetadata.modelName ?? null;
      })();

      const normalizedMetadata: MessageMetadata = {
        modelName: normalizedModelName,
        createdAt:
          typeof rawMetadata.createdAt === "number"
            ? rawMetadata.createdAt
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
        message.metadata?.createdAt === resolvedMetadata.createdAt
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

  // ========== 前端工具配置 ==========
  const currentToolCallIdRef = useRef<string | null>(null);

  /**
   * 创建自动版本快照（同步阻塞）
   * 在 AI 工具执行前调用，等待版本快照（含 SVG 导出）完成后再执行工具
   */
  const createAutoVersionSnapshot = useCallback(
    async (description: string): Promise<void> => {
      const normalizedDescription = description?.trim() ?? "";
      const projectUuid = resolvedProjectUuid;

      // 检查设置是否启用自动版本
      const raw = await getSetting("version.autoVersionOnAIEdit");
      if (!isEnabledSetting(raw)) return;

      // 预先捕获 XML 快照
      const xmlSnapshot = await createDrawioXmlSnapshot(editorRef);

      let versions = await getAllXMLVersions(projectUuid);
      let parentVersion = pickLatestMainVersion(versions);

      // 如果没有主版本，先创建默认版本
      if (!parentVersion) {
        const shouldCreateDefault = !versions.some(
          (version) => version.semantic_version === DEFAULT_FIRST_VERSION,
        );

        if (shouldCreateDefault) {
          await createHistoricalVersion(
            projectUuid,
            DEFAULT_FIRST_VERSION,
            normalizedDescription || undefined,
            editorRef, // 传入 editorRef 用于 SVG 导出
            {
              xmlSnapshot, // 使用预捕获的 XML
            },
          );
        }

        versions = await getAllXMLVersions(projectUuid);
        parentVersion = pickLatestMainVersion(versions);
      }

      if (!parentVersion) {
        throw new Error(t("toasts.autoVersionSnapshotMissingParent"));
      }

      // 计算子版本号并创建版本
      const historicalVersions = versions.filter(
        (version) => version.semantic_version !== WIP_VERSION,
      );
      const nextSubVersion = getNextSubVersion(
        historicalVersions,
        parentVersion,
      );

      await createHistoricalVersion(
        projectUuid,
        nextSubVersion,
        normalizedDescription || undefined,
        editorRef, // 传入 editorRef 用于 SVG 导出
        {
          xmlSnapshot, // 使用预捕获的 XML
        },
      );
    },
    [
      createHistoricalVersion,
      editorRef,
      getAllXMLVersions,
      getSetting,
      resolvedProjectUuid,
      t,
    ],
  );

  const handleFrontendToolVersionSnapshot = useCallback(
    async (description: string) => {
      try {
        await createAutoVersionSnapshot(description);
      } catch (error) {
        // 降级处理：快照失败仅警告，不阻止工具执行
        const message =
          extractErrorMessage(error) ??
          (toErrorString(error) || t("toasts.unknownError"));
        showNotice(
          t("toasts.autoVersionSnapshotFailed", { error: message }),
          "warning",
        );
        logger.warn(
          "[ChatSidebar] AI 自动版本快照失败（已降级，不阻塞 AI 编辑）",
          { error, description },
        );
      }
    },
    [createAutoVersionSnapshot, extractErrorMessage, showNotice, t],
  );

  const frontendToolContext = useMemo<FrontendToolContext>(() => {
    return {
      getDrawioXML: async () => await getDrawioXmlFromRef(editorRef),
      replaceDrawioXML: async (xml, ctxOptions) => {
        return await replaceDrawioXmlFromRef(editorRef, xml, {
          requestId: currentToolCallIdRef.current ?? undefined,
          description: ctxOptions?.description,
        });
      },
      onVersionSnapshot: handleFrontendToolVersionSnapshot,
      getPageFilterContext: () => ({
        selectedPageIds: isAllSelectedPagesRef.current
          ? []
          : Array.from(selectedPageIdsRef.current),
        isMcpContext: false,
      }),
    };
  }, [editorRef, handleFrontendToolVersionSnapshot]);

  const mcpFrontendToolContext = useMemo<FrontendToolContext>(() => {
    return {
      getDrawioXML: async () => await getDrawioXmlFromRef(editorRef),
      replaceDrawioXML: async (xml, ctxOptions) => {
        return await replaceDrawioXmlFromRef(editorRef, xml, {
          requestId: currentToolCallIdRef.current ?? undefined,
          description: ctxOptions?.description,
        });
      },
      onVersionSnapshot: handleFrontendToolVersionSnapshot,
      getPageFilterContext: () => ({
        selectedPageIds: [],
        isMcpContext: true,
      }),
    };
  }, [editorRef, handleFrontendToolVersionSnapshot]);

  const frontendTools = useMemo(
    () => createFrontendDrawioTools(frontendToolContext),
    [frontendToolContext],
  );

  const frontendToolsRef = useRef(frontendTools);
  useEffect(() => {
    frontendToolsRef.current = frontendTools;
  }, [frontendTools]);

  const mcpFrontendTools = useMemo(
    () => createFrontendDrawioTools(mcpFrontendToolContext),
    [mcpFrontendToolContext],
  );

  const mcpFrontendToolsRef = useRef(mcpFrontendTools);
  useEffect(() => {
    mcpFrontendToolsRef.current = mcpFrontendTools;
  }, [mcpFrontendTools]);

  const llmConfigRef = useRef(llmConfig);
  useEffect(() => {
    llmConfigRef.current = llmConfig;
  }, [llmConfig]);

  // ========== useChat 传输层配置 ==========
  const chatTransport = useMemo(() => {
    const fetchWithAbort: typeof fetch = async (request, init) => {
      const abortController = new AbortController();
      activeRequestAbortRef.current = abortController;

      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, CHAT_REQUEST_TIMEOUT_MS);

      try {
        const mergedSignal = mergeAbortSignals([
          init?.signal as AbortSignal | undefined,
          abortController.signal,
        ]);
        const nextInit = { ...init, signal: mergedSignal };
        return await fetch(request, nextInit);
      } finally {
        clearTimeout(timeoutId);
        if (activeRequestAbortRef.current === abortController) {
          activeRequestAbortRef.current = null;
        }
      }
    };

    return new DefaultChatTransport<UseChatMessage>({
      api: "/api/ai-proxy",
      fetch: fetchWithAbort,
      prepareSendMessagesRequest: async (options) => {
        const isAppEnv =
          typeof window !== "undefined" && Boolean(window.electron);

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

        const requestMessages = await maybeInjectCanvasContext({
          enabled: isCanvasContextEnabledRef.current,
          messages: nextMessages,
          drawioReadTool: frontendToolsRef.current["drawio_read"],
          isAppEnv,
          selectionIds: selectionRef?.current ?? [],
        });

        const toolSchemas = buildToolSchemaPayload(frontendTools);

        const rawBody = (options.body ?? {}) as Record<string, unknown>;
        const { llmConfig: legacyLlmConfig, ...bodyRest } = rawBody;
        const config =
          (rawBody.config as unknown) ??
          legacyLlmConfig ??
          llmConfigRef.current ??
          DEFAULT_LLM_CONFIG;

        // 确保每次请求都包含 conversationId 和 projectUuid
        // 这对于工具调用后的自动请求尤其重要,因为 useChat 不会保留原始 body
        return {
          body: {
            ...bodyRest,
            config,
            tools: toolSchemas,
            messages: requestMessages,
            conversationId: activeConversationId,
            projectUuid: resolvedProjectUuid,
          },
        };
      },
    });
  }, [frontendTools, selectionRef, activeConversationId, resolvedProjectUuid]);

  // ========== useChat 集成 ==========
  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop: stopChat,
    error: chatError,
    addToolResult,
  } = useChat<UseChatMessage>({
    id: activeConversationId || "default",
    messages: initialMessages as unknown as UseChatMessage[],
    transport: chatTransport,
    onToolCall: ({ toolCall }) => {
      toolExecution.enqueueToolCall(async () => {
        await toolExecution.executeToolCall({
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          input: toolCall.input,
        });
      });
    },
    sendAutomaticallyWhen: ({ messages: currentMessages }) =>
      lastAssistantMessageIsCompleteWithToolCalls({
        messages: currentMessages,
      }),
    onFinish: async ({
      messages: finishedMessages,
      finishReason,
      isAbort,
      isError,
    }) => {
      const ctx = stateMachine.current.getContext();
      if (!ctx) {
        logger.error("[ChatSidebar] onFinish: 没有状态机上下文");
        return;
      }

      try {
        finishReasonRef.current =
          !isAbort && !isError && finishReason ? finishReason : null;

        logger.info("[ChatSidebar] onFinish: 等待工具队列清空");
        await toolExecution.drainQueue();
        logger.info("[ChatSidebar] onFinish: 工具队列已清空");

        const shouldContinue =
          !isAbort && !isError && finishReason === "tool-calls";

        if (shouldContinue) {
          if (
            toolExecution.toolError &&
            isFatalToolError(toolExecution.toolError)
          ) {
            logger.error(
              "[ChatSidebar] onFinish: shouldContinue 但检测到致命工具错误，停止继续轮次",
              {
                toolError: toolExecution.toolError,
                finishReason,
              },
            );
            return;
          }

          // 工具轮次也要落盘：避免多轮工具调用中间过程丢失（崩溃/刷新会丢）
          try {
            await chatService.saveNow(
              ctx.conversationId,
              finishedMessages as unknown as ChatUIMessage[],
              {
                forceTitleUpdate: false,
                resolveConversationId,
                onConversationResolved: (resolvedId) => {
                  ctx.conversationId = resolvedId;
                  setActiveConversationId(resolvedId);
                },
              },
            );
            logger.info("[ChatSidebar] onFinish: 工具轮次中间保存成功");
          } catch (saveError) {
            logger.error("[ChatSidebar] onFinish: 工具轮次保存失败", {
              saveError,
            });
          }

          logger.info("[ChatSidebar] onFinish: 工具需要继续，等待下一轮");
          // 状态机转换：streaming → tools-pending（如果当前是 streaming）
          safeTransition("finish-with-tools", "onFinish/shouldContinue");
          // 等待下一轮流式（sendAutomaticallyWhen 会触发）
          return;
        }

        logger.info("[ChatSidebar] onFinish: 开始最终化会话");

        // 状态机转换：streaming/tools-pending → finalizing
        const currentState = stateMachine.current.getState();
        if (currentState === "streaming") {
          safeTransition("finish-no-tools", "onFinish/finish-no-tools");
        } else if (currentState === "tools-pending") {
          safeTransition("tools-complete-done", "onFinish/tools-complete-done");
        }

        let resolvedConversationId: string | null = null;

        await chatService.saveNow(
          ctx.conversationId,
          finishedMessages as unknown as ChatUIMessage[],
          {
            forceTitleUpdate: true,
            resolveConversationId,
            onConversationResolved: (resolvedId) => {
              resolvedConversationId = resolvedId;
              ctx.conversationId = resolvedId;
              setActiveConversationId(resolvedId);
            },
          },
        );

        const finalId = resolvedConversationId ?? ctx.conversationId;

        await updateStreamingFlag(finalId, false);

        if (ctx.lockAcquired) {
          releaseLock();
        }

        // 状态机转换：finalizing → idle
        safeTransition("finalize-complete", "onFinish/finalize-complete");

        stateMachine.current.clearContext();
        logger.info("[ChatSidebar] onFinish: 会话已最终化");
      } catch (error) {
        logger.error("[ChatSidebar] onFinish: 发生错误", { error });

        // 即使失败也要保存消息（保留失败现场：工具调用输入/输出/错误信息）
        try {
          await chatService.saveNow(
            ctx.conversationId,
            finishedMessages as unknown as ChatUIMessage[],
            {
              forceTitleUpdate: false,
              resolveConversationId,
              onConversationResolved: (resolvedId) => {
                ctx.conversationId = resolvedId;
                setActiveConversationId(resolvedId);
              },
            },
          );
          logger.info("[ChatSidebar] onFinish/catch: 已保存失败现场");
        } catch (saveError) {
          logger.error("[ChatSidebar] onFinish/catch: 保存消息失败", {
            saveError,
          });
        }

        // 异常路径也要清理 streaming 标志，避免会话长期卡在 is_streaming=true
        logger.info("[ChatSidebar] onFinish/catch: 尝试清理 streaming 标志", {
          conversationId: ctx.conversationId,
        });
        await updateStreamingFlag(ctx.conversationId, false);

        // 错误时转换到 errored → idle
        safeTransition("error", "onFinish/catch");
        safeTransition("error-cleanup", "onFinish/catch");

        if (ctx.lockAcquired) {
          releaseLock();
        }

        stateMachine.current.clearContext();
      }
    },
  });

  const isChatStreaming = status === "submitted" || status === "streaming";

  // ========== 新 Hooks 集成 ==========

  // 工具执行 Hook
  const toolExecution = useChatToolExecution({
    frontendTools,
    addToolResult: addToolResult as unknown as AddToolResultFn,
  });

  // 同步 currentToolCallId
  useEffect(() => {
    currentToolCallIdRef.current = toolExecution.currentToolCallId;
  }, [toolExecution.currentToolCallId]);

  // MCP 工具调用桥接：主进程 -> 渲染进程（执行工具）-> 主进程
  useEffect(() => {
    if (typeof window === "undefined") return;
    const api = window.electronMcp;
    if (!api?.onToolRequest || !api?.sendToolResponse) return;

    const handleToolRequest = (request: McpToolRequest) => {
      const tool = mcpFrontendToolsRef.current[request.toolName];
      const execute = tool?.execute;
      if (!tool || typeof execute !== "function") {
        api.sendToolResponse(request.requestId, {
          success: false,
          error: `未知工具: ${request.toolName}`,
        });
        return;
      }

      enqueueAndWait(toolExecution.toolQueue, async () => {
        const prevToolCallId = currentToolCallIdRef.current;
        currentToolCallIdRef.current = request.requestId;

        try {
          const output = await withTimeout(
            Promise.resolve(
              execute(request.args as never, {
                toolCallId: request.requestId,
                messages: [],
              }),
            ),
            MCP_TOOL_TIMEOUT_MS,
            `[MCP] Tool execution timeout (${MCP_TOOL_TIMEOUT_MS}ms)`,
          );

          api.sendToolResponse(request.requestId, {
            success: true,
            data: output,
          });
        } catch (error) {
          const message =
            extractErrorMessage(error) ?? (toErrorString(error) || "未知错误");
          api.sendToolResponse(request.requestId, {
            success: false,
            error: message,
          });
        } finally {
          currentToolCallIdRef.current = prevToolCallId;
        }
      }).catch((error) => {
        // enqueueAndWait 会在内部 task throw 时 reject；这里仅兜底，确保不影响订阅回调
        logger.error("[ChatSidebar] MCP 工具执行队列异常", { error });
      });
    };

    const unsubscribe = api.onToolRequest(handleToolRequest);
    return () => {
      try {
        unsubscribe?.();
      } catch (error) {
        logger.warn("[ChatSidebar] MCP 工具监听清理失败", { error });
      }
    };
  }, [extractErrorMessage, toolExecution.toolQueue]);

  // 监听流式状态变化，处理 tools-pending → streaming 转换
  const prevIsChatStreamingRef = useRef(isChatStreaming);
  useEffect(() => {
    const prev = prevIsChatStreamingRef.current;
    const current = isChatStreaming;
    prevIsChatStreamingRef.current = current;

    // 流式开始（从 false 变为 true）
    if (!prev && current) {
      const currentState = stateMachine.current.getState();
      // 如果是从 tools-pending 状态开始流式，说明工具完成后需要继续
      if (currentState === "tools-pending") {
        logger.info(
          "[ChatSidebar] 工具完成后继续流式，状态转换: tools-pending → streaming",
        );
        safeTransition(
          "tools-complete-continue",
          "chatStreaming/tools-complete-continue",
        );
      }
    }
  }, [isChatStreaming, safeTransition]);

  const stop = useCallback(() => {
    activeRequestAbortRef.current?.abort();
    toolExecution.abortCurrentTool();
    toolExecution.setToolError(null);

    stopChat().catch((error) => {
      if (error instanceof Error && error.name === "AbortError") return;
      logger.warn("[ChatSidebar] 停止聊天失败", { error });
    });
  }, [stopChat, toolExecution]);

  // 更新流式状态的回调
  const updateStreamingFlag = useCallback(
    async (
      conversationId: string,
      isStreaming: boolean,
      options?: { syncOnly?: boolean },
    ) => {
      if (!conversationId) return;

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

  // 生命周期管理 Hook
  const lifecycle = useChatLifecycle({
    stateMachine,
    toolQueue: toolExecution.toolQueue,
    acquireLock,
    releaseLock,
    sendMessage: (message, options) =>
      sendMessage(message as unknown as UseChatMessage, options),
    stop,
    isChatStreaming,
    updateStreamingFlag,
    chatService,
    activeConversationId,
    setMessages: (value) => {
      setMessages(
        typeof value === "function"
          ? (prev: UseChatMessage[]) =>
              value(
                prev as unknown as ChatUIMessage[],
              ) as unknown as UseChatMessage[]
          : (value as unknown as UseChatMessage[]),
      );
    },
    finishReasonRef,
    onError: (message) => pushErrorToast(message),
  });
  const forceReset = lifecycle.forceReset;

  // 网络控制 Hook
  const { showOnlineRecoveryHint } = useChatNetworkControl({
    isOnline,
    offlineReasonLabel: offlineReasonLabel ?? undefined,
    isChatStreaming,
    activeConversationId,
    stateMachine: stateMachine.current,
    releaseLock,
    stop,
    updateStreamingFlag,
    markConversationAsCompleted,
    resolveConversationId,
    forceReset,
    openAlertDialog: (config) =>
      openAlertDialog({
        ...config,
        status: config.status as "warning" | "danger",
      }),
    t: (key: string, fallback?: string) => {
      if (fallback) {
        return t(key, { defaultValue: fallback });
      }
      return t(key);
    },
    toolQueue: toolExecution.toolQueue,
  });

  // 消息同步 Hook
  const { displayMessages } = useChatMessages({
    activeConversationId,
    chatService,
    isChatStreaming,
    chatRunStateMachine: stateMachine.current,
    conversationMessages,
    setMessages: (value) => {
      setMessages(
        typeof value === "function"
          ? (prev: UseChatMessage[]) =>
              value(
                prev as unknown as ChatUIMessage[],
              ) as unknown as UseChatMessage[]
          : (value as unknown as UseChatMessage[]),
      );
    },
    messages: messages as unknown as ChatUIMessage[],
    ensureMessageMetadata,
    resolveConversationId,
  });

  // ========== 初始化副作用 ==========
  useEffect(() => {
    void loadModelSelector();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ========== 推理时长计算 ==========
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

  // ========== 派生状态（UI 相关）==========
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

  // ========== 错误处理 ==========
  const lastHandledChatErrorRef = useRef<unknown>(null);
  const lastHandledToolErrorRef = useRef<unknown>(null);

  useEffect(() => {
    const message = extractErrorMessage(chatError);

    if (!message) return;
    if (lastHandledChatErrorRef.current === chatError) return;
    lastHandledChatErrorRef.current = chatError;

    pushErrorToast(message, t("toasts.chatRequestFailed"));

    const currentState = stateMachine.current.getState();
    if (currentState !== "idle") {
      logger.warn("[ChatSidebar] chatError: 状态非 idle，触发强制重置", {
        currentState,
        message,
      });
      forceReset("chatError").catch((error) => {
        logger.error("[ChatSidebar] chatError: forceReset 失败", { error });
      });
    }
  }, [chatError, extractErrorMessage, forceReset, pushErrorToast, t]);

  useEffect(() => {
    if (!toolExecution.toolError) return;
    if (!isFatalToolError(toolExecution.toolError)) return;
    if (lastHandledToolErrorRef.current === toolExecution.toolError) return;
    lastHandledToolErrorRef.current = toolExecution.toolError;

    pushErrorToast(
      toolExecution.toolError.message,
      t("toasts.chatRequestFailed"),
    );

    const currentState = stateMachine.current.getState();
    if (currentState !== "idle") {
      logger.warn("[ChatSidebar] toolError: 状态非 idle，触发强制重置", {
        currentState,
        toolError: toolExecution.toolError,
      });
      forceReset("toolError").catch((error) => {
        logger.error("[ChatSidebar] toolError: forceReset 失败", { error });
      });
    }
  }, [forceReset, pushErrorToast, t, toolExecution.toolError]);

  // ========== 事件处理函数 ==========

  const submitMessage = async () => {
    // 新一轮开始时清理旧的 toolError，避免污染 shouldContinue 判断
    if (toolExecution.toolError) {
      toolExecution.setToolError(null);
      logger.info("[ChatSidebar] submitMessage: 清理旧的 toolError");
    }

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

    const targetSessionId = activeConversationId;
    if (!targetSessionId) {
      showNotice(
        t("chat:messages.conversationNotReady", "对话尚未就绪，请稍后重试。"),
        "warning",
      );
      return;
    }

    // 如果不是全选模式，检查选择数量（允许空选，但发送时拦截并提示）。
    if (
      !isAllSelectedPagesRef.current &&
      selectedPageIdsRef.current.size === 0
    ) {
      showNotice(
        t("chat:pageSelector.noPagesSelected", "请至少选择一个页面"),
        "warning",
      );
      return;
    }

    await lifecycle.submitMessage({
      input: trimmedInput,
      readyAttachments,
      llmConfig,
      resolvedProjectUuid,
      targetSessionId,
      clearAttachments: () => {
        if (hasReadyAttachments) {
          imageAttachments.clearAll();
        }
      },
      setInput,
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitMessage();
  };

  const handleCancel = useCallback(async () => {
    await lifecycle.handleCancel();
  }, [lifecycle]);

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
    await lifecycle.stopStreamingSilently();

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
    lifecycle,
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

  const clearSyncedFingerprints = useCallback((ids: string[]) => {
    // 这个功能已经被 useChatMessages 内部管理，这里保留空实现以保持接口兼容
    logger.debug("[ChatSidebar] clearSyncedFingerprints called", { ids });
  }, []);

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
  const isModelConfigMissing = providers.length === 0 || models.length === 0;
  const isInputDisabled =
    configLoading ||
    !llmConfig ||
    isModelConfigMissing ||
    !canSendNewMessage ||
    !isOnline;

  // ========== 渲染 ==========

  const alerts = (
    <>
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
    <div ref={mcpOverlayContainerRef} className="relative h-full">
      <div ref={chatShellContainerRef} className="h-full">
        <ChatShell
          view={currentView}
          alerts={alerts}
          chatPane={
            <>
              <MessagePane
                messages={displayMessages}
                configLoading={configLoading}
                llmConfig={llmConfig}
                ensureMessageMetadata={ensureMessageMetadata}
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
                isCanvasContextEnabled={isCanvasContextEnabled}
                onCanvasContextToggle={handleCanvasContextToggle}
                pageSelector={{
                  pages: pageSelection.pages,
                  selectedPageIds: pageSelection.selectedPageIds,
                  onSelectionChange: pageSelection.setSelectedPageIds,
                  onRequestRefresh: refreshPageSelectorXml,
                  isDisabled: isInputDisabled,
                }}
                mcpConfigDialog={{
                  isActive: mcpServer.running,
                  isOpen: isMcpConfigOpen,
                  onOpenChange: handleMcpConfigOpenChange,
                  onConfirm: handleConfirmMcpConfig,
                  isDisabled: mcpServer.isLoading,
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
      </div>

      <McpExposureOverlay
        isOpen={isMcpExposureOverlayOpen}
        portalContainer={mcpOverlayPortalContainer}
        host={mcpServer.host ?? "127.0.0.1"}
        port={mcpServer.port ?? 8000}
        onStop={handleStopMcp}
      />
    </div>
  );
}
