"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type FormEvent,
  type MutableRefObject,
  type RefObject,
} from "react";
import { Alert } from "@heroui/react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  asSchema,
  lastAssistantMessageIsCompleteWithToolCalls,
  type Tool,
  type UIMessage,
} from "ai";
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
import type { DrawioEditorRef } from "@/app/components/DrawioEditorNative";
import { ErrorCodes } from "@/app/errors/error-codes";
import { getDrawioXML, replaceDrawioXML } from "@/app/lib/drawio-tools";
import {
  createFrontendDrawioTools,
  type FrontendToolContext,
} from "@/app/lib/frontend-tools";
import {
  drawioEditBatchInputSchema,
  drawioOverwriteInputSchema,
  drawioReadInputSchema,
} from "@/app/lib/schemas/drawio-tool-schemas";
import {
  convertUIMessageToCreateInput,
  fingerprintMessage,
} from "@/app/lib/chat-session-service";
import { generateUUID } from "@/app/lib/utils";
import { DrainableToolQueue } from "@/app/lib/drainable-tool-queue";
import { ChatRunStateMachine } from "@/app/lib/chat-run-state-machine";
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
import { hasConversationIdMetadata } from "@/app/lib/type-guards";
import { TOOL_TIMEOUT_CONFIG } from "@/lib/constants/tool-config";
import { AI_TOOL_NAMES } from "@/lib/constants/tool-names";

const logger = createLogger("ChatSidebar");
type UseChatMessage = UIMessage<MessageMetadata>;

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

const hasToolPartsInLastAssistant = (messages: UseChatMessage[]): boolean => {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return false;
  const parts = (last as { parts?: unknown }).parts;
  if (!Array.isArray(parts)) return false;
  return parts.some((part) => {
    if (!part || typeof part !== "object") return false;
    const type = (part as { type?: unknown }).type;
    return (
      typeof type === "string" &&
      (type === "dynamic-tool" || type.startsWith("tool-"))
    );
  });
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

const TOOL_INPUT_SCHEMAS = {
  [AI_TOOL_NAMES.DRAWIO_READ]: drawioReadInputSchema.optional(),
  [AI_TOOL_NAMES.DRAWIO_EDIT_BATCH]: drawioEditBatchInputSchema,
  [AI_TOOL_NAMES.DRAWIO_OVERWRITE]: drawioOverwriteInputSchema,
} as const;

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "未知错误";
}

function createAbortError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
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

async function withTimeout<T>(
  task: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  if (timeoutMs <= 0) return await task;

  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`[${ErrorCodes.TIMEOUT}] 操作超时（${timeoutMs}ms）`));
    }, timeoutMs);
  });

  try {
    if (!signal) {
      return await Promise.race([task, timeoutPromise]);
    }

    const abortPromise = new Promise<T>((_, reject) => {
      if (signal.aborted) {
        reject(createAbortError("已取消"));
        return;
      }
      signal.addEventListener(
        "abort",
        () => reject(createAbortError("已取消")),
        { once: true },
      );
    });

    return await Promise.race([task, timeoutPromise, abortPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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

async function getDrawioXmlFromRef(
  drawioRef: RefObject<DrawioEditorRef | null>,
): Promise<string> {
  if (drawioRef.current) {
    const xml = await drawioRef.current.exportDiagram();
    if (typeof xml === "string" && xml.trim()) return xml;
  }

  const storageResult = await getDrawioXML();
  if (storageResult.success && storageResult.xml) return storageResult.xml;
  throw new Error(storageResult.error || "无法获取 DrawIO XML");
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

type AddToolResultFn = (
  args:
    | {
        state?: "output-available";
        tool: string;
        toolCallId: string;
        output: unknown;
      }
    | {
        state: "output-error";
        tool: string;
        toolCallId: string;
        errorText: string;
      },
) => Promise<void>;

async function executeToolCall(options: {
  toolCall: { toolCallId: string; toolName: string; input: unknown };
  toolsRef: MutableRefObject<Record<string, Tool>>;
  addToolResult: AddToolResultFn;
  setToolError: (error: Error | null) => void;
  currentToolCallIdRef: MutableRefObject<string | null>;
  activeToolAbortRef: MutableRefObject<AbortController | null>;
}): Promise<void> {
  const {
    toolCall,
    addToolResult,
    setToolError,
    currentToolCallIdRef,
    activeToolAbortRef,
  } = options;
  const toolName = toolCall.toolName;
  const toolCallId = toolCall.toolCallId;

  const tool = options.toolsRef.current[toolName];

  if (!tool || typeof tool.execute !== "function") {
    const errorText = `未知工具: ${toolName}`;
    setToolError(new Error(errorText));
    await addToolResult({
      state: "output-error",
      tool: toolName,
      toolCallId,
      errorText,
    });
    return;
  }

  const schema = (
    TOOL_INPUT_SCHEMAS as Record<
      string,
      { safeParse: (input: unknown) => { success: boolean; data?: unknown } }
    >
  )[toolName];
  if (!schema) {
    const errorText = `缺少工具 schema: ${toolName}`;
    setToolError(new Error(errorText));
    await addToolResult({
      state: "output-error",
      tool: toolName,
      toolCallId,
      errorText,
    });
    return;
  }

  const parsed = schema.safeParse(toolCall.input);
  if (!parsed.success) {
    const errorText = `工具输入校验失败: ${toolName}`;
    setToolError(new Error(errorText));
    await addToolResult({
      state: "output-error",
      tool: toolName,
      toolCallId,
      errorText,
    });
    return;
  }

  currentToolCallIdRef.current = toolCallId;
  const abortController = new AbortController();
  activeToolAbortRef.current = abortController;

  try {
    const timeoutMs =
      TOOL_TIMEOUT_CONFIG[toolName as keyof typeof TOOL_TIMEOUT_CONFIG] ??
      30_000;

    const output = await withTimeout(
      Promise.resolve(
        tool.execute(parsed.data as never, {
          toolCallId,
          messages: [],
          abortSignal: abortController.signal,
        }),
      ),
      timeoutMs,
      abortController.signal,
    );

    // AI SDK 5.0: 不要在 onToolCall 中 await addToolResult，否则会死锁
    // https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0
    void addToolResult({
      tool: toolName,
      toolCallId,
      output,
    });
  } catch (error) {
    if (isAbortError(error)) {
      void addToolResult({
        state: "output-error",
        tool: toolName,
        toolCallId,
        errorText: "已取消",
      });
      return;
    }

    const errorText = toErrorMessage(error);
    setToolError(error instanceof Error ? error : new Error(errorText));

    void addToolResult({
      state: "output-error",
      tool: toolName,
      toolCallId,
      errorText,
    });
  } finally {
    if (activeToolAbortRef.current === abortController) {
      activeToolAbortRef.current = null;
    }
    if (currentToolCallIdRef.current === toolCallId) {
      currentToolCallIdRef.current = null;
    }
  }
}

interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentProjectId?: string;
  editorRef: RefObject<DrawioEditorRef | null>;
}

// ========== 主组件 ==========

export default function ChatSidebar({
  isOpen = true,
  currentProjectId,
  editorRef,
}: ChatSidebarProps) {
  const [input, setInput] = useState("");
  const [toolError, setToolError] = useState<Error | null>(null);
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
  const { open: openAlertDialog } = useAlertDialog();
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

  const [showOnlineRecoveryHint, setShowOnlineRecoveryHint] = useState(false);

  const translate = useCallback(
    (key: string, fallback?: string) => t(key, fallback ?? key),
    [t],
  );

  const resolvedProjectUuid = currentProjectId ?? DEFAULT_PROJECT_UUID;
  const { canChat, lockHolder, acquireLock, releaseLock } =
    useChatLock(resolvedProjectUuid);
  const { isOnline, offlineReason } = useNetworkStatus();

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

  // ========== 引用 ==========
  const imageDataUrlCacheRef = useRef<Map<string, string>>(new Map());
  const imageDataUrlPendingRef = useRef<Map<string, Promise<string | null>>>(
    new Map(),
  );
  const alertOwnerRef = useRef<"single-delete" | "batch-delete" | null>(null);
  const pageUnloadHandledRef = useRef(false);
  const streamingFlagCacheRef = useRef<Record<string, boolean>>({});
  const forceStopReasonRef = useRef<"sidebar" | "history" | null>(null);
  const wasOfflineRef = useRef(false);
  const previousOnlineStatusRef = useRef<boolean | null>(null);
  const reasoningTimersRef = useRef<Map<string, number>>(new Map());
  const finishReasonRef = useRef<string | null>(null);

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
  // NOTE(Milestone 4): ChatSidebar 目前仍是"自管理"模式（内部 useChat + 存储/会话控制器）。
  // 如需复用聊天状态/动作，建议抽出 Provider/Context 注入，避免出现"双消息源 / 双流式状态 / 双取消逻辑"的竞态问题。

  // 工具执行队列：可等待清空的队列，确保 onFinish 等待工具完成
  const toolQueue = useRef(new DrainableToolQueue());

  // 聊天状态机：统一管理会话生命周期，避免 ref 竞态
  const stateMachine = useRef(new ChatRunStateMachine());

  const activeRequestAbortRef = useRef<AbortController | null>(null);
  const activeToolAbortRef = useRef<AbortController | null>(null);
  const currentToolCallIdRef = useRef<string | null>(null);

  const frontendToolContext = useMemo<FrontendToolContext>(() => {
    return {
      getDrawioXML: async () => await getDrawioXmlFromRef(editorRef),
      replaceDrawioXML: async (xml, ctxOptions) => {
        return await replaceDrawioXmlFromRef(editorRef, xml, {
          requestId: currentToolCallIdRef.current ?? undefined,
          description: ctxOptions?.description,
        });
      },
      onVersionSnapshot: (description) => {
        logger.info("[ChatSidebar] 触发版本快照（占位）", { description });
      },
    };
  }, [editorRef]);

  const frontendTools = useMemo(
    () => createFrontendDrawioTools(frontendToolContext),
    [frontendToolContext],
  );

  const frontendToolsRef = useRef(frontendTools);
  useEffect(() => {
    frontendToolsRef.current = frontendTools;
  }, [frontendTools]);

  const llmConfigRef = useRef(llmConfig);
  useEffect(() => {
    llmConfigRef.current = llmConfig;
  }, [llmConfig]);

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

        const toolSchemas = buildToolSchemaPayload(frontendToolsRef.current);

        const rawBody = (options.body ?? {}) as Record<string, unknown>;
        const { llmConfig: legacyLlmConfig, ...bodyRest } = rawBody;
        const config =
          (rawBody.config as unknown) ??
          legacyLlmConfig ??
          llmConfigRef.current ??
          DEFAULT_LLM_CONFIG;

        return {
          body: {
            ...bodyRest,
            config,
            tools: toolSchemas,
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
    stop: stopChat,
    error: chatError,
    addToolResult,
  } = useChat<UseChatMessage>({
    id: activeConversationId || "default",
    messages: initialMessages as unknown as UseChatMessage[],
    transport: chatTransport,
    // AI SDK 5.0: onToolCall 中不要 await addToolResult，否则会死锁
    // https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0
    onToolCall: ({ toolCall }) => {
      // 使用新的可等待队列，替代 Promise 链
      toolQueue.current.enqueue(async () => {
        await executeToolCall({
          toolCall,
          toolsRef: frontendToolsRef,
          addToolResult,
          setToolError,
          currentToolCallIdRef,
          activeToolAbortRef,
        });
      });

      // 不要 await，直接返回让 AI SDK 继续处理
    },
    sendAutomaticallyWhen: ({ messages: currentMessages }) =>
      lastAssistantMessageIsCompleteWithToolCalls({
        messages: currentMessages,
      }) ||
      (finishReasonRef.current === "tool-calls" &&
        hasToolPartsInLastAssistant(currentMessages)),
    onFinish: async ({
      messages: finishedMessages,
      finishReason,
      isAbort,
      isError,
    }) => {
      // 使用状态机获取上下文，替代 sendingSessionIdRef
      const ctx = stateMachine.current.getContext();
      if (!ctx) {
        logger.error("[ChatSidebar] onFinish: 没有状态机上下文");
        return;
      }

      try {
        finishReasonRef.current =
          !isAbort && !isError && finishReason ? finishReason : null;
        // ⭐ 核心修复：等待工具队列清空
        // 确保所有工具执行完成后才保存消息和释放锁
        logger.info("[ChatSidebar] onFinish: 等待工具队列清空");
        await toolQueue.current.drain();
        logger.info("[ChatSidebar] onFinish: 工具队列已清空");

        const shouldContinue =
          lastAssistantMessageIsCompleteWithToolCalls({
            messages: finishedMessages,
          }) ||
          (finishReason === "tool-calls" &&
            hasToolPartsInLastAssistant(finishedMessages));

        if (shouldContinue) {
          // 工具执行完成，需继续流式（sendAutomaticallyWhen 会自动触发）
          logger.info("[ChatSidebar] onFinish: 工具需要继续，等待下一轮");
          return;
        }

        // 进入最终化状态
        logger.info("[ChatSidebar] onFinish: 开始最终化会话");

        // 记录解析后的真实会话 ID，用于正确更新流式状态
        let resolvedConversationId: string | null = null;

        await chatService.saveNow(
          ctx.conversationId,
          finishedMessages as unknown as ChatUIMessage[],
          {
            forceTitleUpdate: true,
            resolveConversationId,
            onConversationResolved: (resolvedId) => {
              resolvedConversationId = resolvedId;
              // 更新上下文中的 conversationId
              ctx.conversationId = resolvedId;
              setActiveConversationId(resolvedId);
            },
          },
        );

        // 优先使用解析后的真实 ID，回落到原始 ID
        const finalId = resolvedConversationId ?? ctx.conversationId;

        // 更新流式状态为完成
        await updateStreamingFlag(finalId, false);

        // 释放锁
        if (ctx.lockAcquired) {
          releaseLock();
        }

        // 清理上下文
        stateMachine.current.clearContext();
        logger.info("[ChatSidebar] onFinish: 会话已最终化");
      } catch (error) {
        logger.error("[ChatSidebar] onFinish: 发生错误", { error });

        // 错误处理：确保锁被释放
        if (ctx.lockAcquired) {
          releaseLock();
        }

        // 清理上下文
        stateMachine.current.clearContext();
      }
    },
  });

  const stop = useCallback(() => {
    activeRequestAbortRef.current?.abort();
    activeToolAbortRef.current?.abort();
    setToolError(null);

    stopChat().catch((error) => {
      if (isAbortError(error)) return;
      logger.warn("[ChatSidebar] 停止聊天失败", { error });
    });
  }, [stopChat]);

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

      // 使用状态机获取上下文
      const ctx = stateMachine.current.getContext();
      const targetConversationId = activeConversationId ?? ctx?.conversationId;

      stop();
      releaseLock();

      if (targetConversationId) {
        void updateStreamingFlag(targetConversationId, false);
      }

      // 清理状态机上下文
      if (ctx) {
        stateMachine.current.clearContext();
      }
    },
    [
      activeConversationId,
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
    const onlineStatusChanged = previousOnline !== isOnline;
    previousOnlineStatusRef.current = isOnline;

    if (!onlineStatusChanged) return;

    if (!isOnline) {
      setShowOnlineRecoveryHint(false);

      if (isChatStreaming) {
        logger.warn("[ChatSidebar] 网络断开，停止聊天请求");
      } else {
        logger.warn("[ChatSidebar] 网络断开，当前无流式请求，释放聊天锁");
      }

      // 使用状态机获取上下文
      const ctx = stateMachine.current.getContext();
      const targetConversationId = activeConversationId ?? ctx?.conversationId;

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
    isChatStreaming,
    isOnline,
    markConversationAsCompleted,
    openAlertDialog,
    releaseLock,
    resolveConversationId,
    stop,
    t,
    offlineReasonLabel,
    updateStreamingFlag,
  ]);

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
    if (!toolError) return;
    pushErrorToast(toolError.message, t("toasts.chatRequestFailed"));
  }, [toolError, pushErrorToast, t]);

  useEffect(() => {
    pageUnloadHandledRef.current = false;

    const handlePageUnload = (
      _event: BeforeUnloadEvent | PageTransitionEvent,
    ) => {
      if (pageUnloadHandledRef.current) return;
      pageUnloadHandledRef.current = true;

      // 使用状态机获取上下文
      const ctx = stateMachine.current.getContext();
      if (!ctx) {
        // 没有正在进行的流式请求，只需要释放锁
        releaseLock();
        return;
      }

      logger.warn("[ChatSidebar] 页面即将卸载，停止聊天请求", {
        conversationId: ctx.conversationId,
      });

      // 1) 立即中断正在进行的流式请求
      stop();

      // 2) 释放聊天锁，避免遗留占用
      releaseLock();

      const targetConversationId = activeConversationId ?? ctx.conversationId;

      // 3) 同步标记流式结束，避免卸载时遗留 streaming 状态
      updateStreamingFlag(targetConversationId, false, { syncOnly: true });
      void updateStreamingFlag(targetConversationId, false);

      // 4) 刷新待保存队列，确保 debounce 队列立即写入
      chatService.flushPending(targetConversationId);

      // 5) 清理状态机上下文
      stateMachine.current.clearContext();
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
    releaseLock,
    stop,
    updateStreamingFlag,
  ]);

  useEffect(
    () => () => {
      // 组件卸载时清理状态机和释放锁
      const ctx = stateMachine.current.getContext();
      if (ctx) {
        stateMachine.current.clearContext();
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
      // 获取锁失败，释放锁
      releaseLock();
      showNotice(
        t("chat:messages.conversationNotReady", "对话尚未就绪，请稍后重试。"),
        "warning",
      );
      return;
    }

    // 初始化状态机上下文
    stateMachine.current.initContext(targetSessionId);
    const ctx = stateMachine.current.getContext()!;
    ctx.lockAcquired = true;

    logger.debug("[ChatSidebar] 开始发送消息到会话:", targetSessionId);

    const messageId = generateUUID("msg");
    const createdAt = Date.now();
    finishReasonRef.current = null;

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

      await sendMessage(userMessage as unknown as UseChatMessage, {
        body: {
          config: llmConfig,
          projectUuid: resolvedProjectUuid,
          conversationId: targetSessionId,
        },
      });
      lockTransferredToStream = true;
      if (hasReadyAttachments) {
        imageAttachments.clearAll();
      }
      void updateStreamingFlag(targetSessionId, true);
    } catch (error) {
      logger.error("[ChatSidebar] 发送消息失败:", error);

      // 使用状态机清理上下文
      stateMachine.current.clearContext();

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
        // 如果锁没有转移到流式响应，清理状态机并释放锁
        const ctx = stateMachine.current.getContext();
        if (ctx) {
          void updateStreamingFlag(ctx.conversationId, false);
          stateMachine.current.clearContext();
        }
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

    // 使用状态机获取上下文
    const ctx = stateMachine.current.getContext();
    const targetConversationId = activeConversationId ?? ctx?.conversationId;

    stop();

    if (targetConversationId) {
      void updateStreamingFlag(targetConversationId, false);
    }

    // 清理状态机上下文
    if (ctx) {
      stateMachine.current.clearContext();
    }

    releaseLock();
  }, [
    activeConversationId,
    isChatStreaming,
    releaseLock,
    stop,
    updateStreamingFlag,
  ]);

  const handleCancel = useCallback(async () => {
    if (!isChatStreaming) return;

    // 使用状态机获取上下文
    const ctx = stateMachine.current.getContext();
    if (!ctx) {
      logger.warn("[ChatSidebar] handleCancel: 没有状态机上下文");
      return;
    }

    logger.info("[ChatSidebar] 用户取消聊天", {
      conversationId: ctx.conversationId,
    });

    // 中止请求
    stop();

    try {
      // 等待工具队列清空（确保工具不会继续执行）
      logger.info("[ChatSidebar] handleCancel: 等待工具队列清空");
      await toolQueue.current.drain();
      logger.info("[ChatSidebar] handleCancel: 工具队列已清空");
    } catch (error) {
      logger.warn("[ChatSidebar] handleCancel: 工具队列清空失败", { error });
    }

    // 释放锁
    if (ctx.lockAcquired) {
      releaseLock();
    }

    // 更新流式状态
    try {
      await updateStreamingFlag(ctx.conversationId, false);
    } catch (error) {
      logger.error("[ChatSidebar] handleCancel: 更新流式状态失败", { error });
    }

    // 清理上下文
    stateMachine.current.clearContext();
    logger.info("[ChatSidebar] handleCancel: 聊天已取消");
  }, [isChatStreaming, stop, releaseLock, updateStreamingFlag]);

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
      // 使用状态机获取上下文
      const ctx = stateMachine.current.getContext();
      const targetConversationId = activeConversationId ?? ctx?.conversationId;
      if (!streaming || !targetConversationId) return;

      void updateStreamingFlag(targetConversationId, false);
    },
    [activeConversationId, status, updateStreamingFlag],
  );

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
