import { debounce, type DebouncedFunction } from "@/app/lib/utils";
import type {
  Conversation,
  CreateMessageInput,
  Message,
} from "@/app/lib/storage";
import type {
  ChatUIMessage,
  MessageMetadata,
  ToolInvocationState,
} from "@/app/types/chat";
import { createLogger, type Logger } from "@/lib/logger";
import { toErrorString } from "./error-handler";

const logger = createLogger("chat-session-service");

export type SubscribeToConversations = (
  projectUuid: string,
  callback: (conversations: Conversation[]) => void,
  onError?: (error: Error) => void,
) => (() => void) | void;

export type SubscribeToMessages = (
  conversationId: string,
  callback: (messages: Message[]) => void,
  onError?: (error: Error) => void,
) => (() => void) | void;

export interface ChatSessionServiceDeps {
  getMessages: (conversationId: string) => Promise<Message[]>;
  addMessages: (messages: CreateMessageInput[]) => Promise<Message[]>;
  updateConversation: (
    id: string,
    updates: Partial<Pick<Conversation, "title">>,
  ) => Promise<void>;
  subscribeToConversations: SubscribeToConversations;
  subscribeToMessages: SubscribeToMessages;
}

export interface ChatSessionServiceOptions {
  defaultXmlVersionId?: string | null;
  debounceMs?: number;
  ensureMessageMetadata: (message: ChatUIMessage) => ChatUIMessage;
  onMessagesChange?: (
    conversationId: string,
    messages: ChatUIMessage[],
  ) => void;
  onSavingChange?: (saving: boolean) => void;
  onSaveError?: (message: string) => void;
}

export interface SaveOptions {
  forceTitleUpdate?: boolean;
  resolveConversationId?: (conversationId: string) => Promise<string>;
  onConversationResolved?: (resolvedId: string) => void;
}

export interface ChatSessionService {
  subscribeConversations: SubscribeToConversations;
  subscribeMessages: (
    conversationId: string,
    onError?: (error: Error) => void,
  ) => (() => void) | void;
  ensureMessages: (conversationId: string) => Promise<ChatUIMessage[]>;
  syncMessages: (
    conversationId: string,
    messages: ChatUIMessage[],
    options?: SaveOptions,
  ) => void;
  saveNow: (
    conversationId: string,
    messages: ChatUIMessage[],
    options?: SaveOptions,
  ) => Promise<void>;
  flushPending: (conversationId?: string | null) => void;
  handleConversationSwitch: (nextConversationId: string | null) => void;
  updateDefaultXmlVersionId: (versionId: string | null) => void;
  setEnsureMessageMetadata: (
    fn: (message: ChatUIMessage) => ChatUIMessage,
  ) => void;
  removeConversationCaches: (conversationIds: string[]) => void;
  getCachedMessages: (conversationId: string) => ChatUIMessage[] | undefined;
  dispose: () => void;
}

// ========== 消息转换与指纹 ========== //

const TOOL_PART_TYPES = new Set([
  "tool-call",
  "tool-result",
  "tool-error",
  "dynamic-tool",
  "tool-invocation",
]);

function stripRuntimeImageFields(
  part: ChatUIMessage["parts"][number],
): ChatUIMessage["parts"][number] {
  if (typeof part !== "object" || part === null) return part;
  const record = part as Record<string, unknown>;
  if (record.type !== "image") return part;

  return {
    type: "image",
    attachmentId: record.attachmentId as string,
    mimeType: record.mimeType as string,
    width:
      typeof record.width === "number" ? (record.width as number) : undefined,
    height:
      typeof record.height === "number" ? (record.height as number) : undefined,
    fileName:
      typeof record.fileName === "string"
        ? (record.fileName as string)
        : undefined,
    alt: typeof record.alt === "string" ? (record.alt as string) : undefined,
    purpose:
      typeof record.purpose === "string"
        ? (record.purpose as string)
        : undefined,
  } as ChatUIMessage["parts"][number];
}

const sanitizeSerializableValue = (
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): unknown => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (
    typeof value === "undefined" ||
    typeof value === "function" ||
    typeof value === "symbol"
  ) {
    return undefined;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    return value
      .map((item) => sanitizeSerializableValue(item, seen))
      .filter((item) => item !== undefined);
  }

  if (typeof value === "object") {
    if (seen.has(value as object)) return "[Circular]";
    seen.add(value as object);

    const result: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (key === "__proto__") continue;
      const sanitized = sanitizeSerializableValue(val, seen);
      if (sanitized !== undefined) {
        result[key] = sanitized;
      }
    }

    return result;
  }

  return undefined;
};

const safeJsonStringify = (value: unknown): string => {
  const seen = new WeakSet<object>();

  return JSON.stringify(value, (key, val) => {
    if (typeof val === "object" && val !== null) {
      if (seen.has(val)) return "[Circular]";
      seen.add(val);
    }

    if (typeof val === "function" || typeof val === "symbol") {
      return undefined;
    }

    if (typeof val === "bigint") {
      return val.toString();
    }

    return val;
  });
};

const TOOL_STATES = new Set<ToolInvocationState>([
  "input-streaming",
  "input-available",
  "output-available",
  "output-error",
]);

function isToolRelatedPart(part: ChatUIMessage["parts"][number]): boolean {
  const type = (part as { type?: unknown }).type;
  return (
    typeof type === "string" &&
    (TOOL_PART_TYPES.has(type) || type.startsWith("tool-"))
  );
}

const toRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;

const pickString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === "string") return value;
  }
  return undefined;
};

function normalizeToolState(
  value: unknown,
  fallback: ToolInvocationState,
): ToolInvocationState {
  if (
    typeof value === "string" &&
    TOOL_STATES.has(value as ToolInvocationState)
  ) {
    return value as ToolInvocationState;
  }
  return fallback;
}

const addIfDefined = (
  target: Record<string, unknown>,
  key: string,
  value: unknown,
) => {
  const sanitized = sanitizeSerializableValue(value);
  if (sanitized !== undefined) {
    target[key] = sanitized;
  }
};

// 规范化后的工具 part 结构，确保字段齐全且类型一致
interface CanonicalToolPart {
  type: string;
  toolName: string;
  toolCallId: string;
  state: ToolInvocationState;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  providerExecuted?: boolean;
  callProviderMetadata?: unknown;
  preliminary?: boolean;
}

// 公共字段提取器：统一处理工具调用的输入输出、错误与元信息
function extractToolFields(part: Record<string, unknown>): {
  rawType?: string;
  toolName?: string;
  toolCallId?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  providerExecuted?: boolean;
  callProviderMetadata?: unknown;
  preliminary?: unknown;
  rawState?: unknown;
} {
  const toolInvocation = toRecord(
    (part as { toolInvocation?: unknown }).toolInvocation,
  );

  const source = toolInvocation ?? part;

  const rawType = pickString(
    (source as { type?: unknown }).type,
    source === part ? undefined : (part as { type?: unknown }).type,
  );

  const toolNameCandidates: unknown[] = [
    (source as { toolName?: unknown }).toolName,
    (source as { name?: unknown }).name,
  ];

  if (source !== part) {
    toolNameCandidates.push(
      (part as { toolName?: unknown }).toolName,
      (part as { name?: unknown }).name,
    );
  }

  let toolName = pickString(...toolNameCandidates);

  if (!toolName && rawType?.startsWith("tool-")) {
    const suffix = rawType.slice(5);
    const genericToolTypes = ["call", "result", "invocation", "error"];

    if (!genericToolTypes.includes(suffix)) {
      toolName = suffix;
    }
  }

  const toolCallIdCandidates: unknown[] = [
    (source as { toolCallId?: unknown }).toolCallId,
    (source as { id?: unknown }).id,
  ];

  if (source !== part) {
    toolCallIdCandidates.push(
      (part as { toolCallId?: unknown }).toolCallId,
      (part as { id?: unknown }).id,
    );
  }

  const toolCallId = pickString(...toolCallIdCandidates);

  const input =
    (source as { input?: unknown }).input ??
    (source as { args?: unknown }).args ??
    (source as { parameters?: unknown }).parameters ??
    (source as { input_arguments?: unknown }).input_arguments ??
    (source as { rawInput?: unknown }).rawInput ??
    (source !== part
      ? (part.input ??
        (part as { args?: unknown }).args ??
        (part as { parameters?: unknown }).parameters ??
        (part as { input_arguments?: unknown }).input_arguments ??
        (part as { rawInput?: unknown }).rawInput)
      : undefined);

  const output =
    (source as { output?: unknown }).output ??
    (source as { result?: unknown }).result ??
    (source as { data?: unknown }).data ??
    (source !== part
      ? (part.output ??
        (part as { result?: unknown }).result ??
        (part as { data?: unknown }).data)
      : undefined);

  const errorTextCandidates: unknown[] = [
    (source as { errorText?: unknown }).errorText,
    (source as { error?: unknown }).error,
    (source as { rawError?: unknown }).rawError,
  ];

  if (source !== part) {
    errorTextCandidates.push(
      (part as { errorText?: unknown }).errorText,
      (part as { error?: unknown }).error,
      (part as { rawError?: unknown }).rawError,
    );
  }

  const errorText = pickString(...errorTextCandidates);

  let rawExecuted: unknown =
    typeof (source as { providerExecuted?: unknown }).providerExecuted ===
    "boolean"
      ? (source as { providerExecuted?: unknown }).providerExecuted
      : (source as { executed?: unknown }).executed;

  if (typeof rawExecuted !== "boolean" && source !== part) {
    rawExecuted =
      typeof (part as { providerExecuted?: unknown }).providerExecuted ===
      "boolean"
        ? (part as { providerExecuted?: unknown }).providerExecuted
        : (part as { executed?: unknown }).executed;
  }

  const providerExecuted =
    typeof rawExecuted === "boolean" ? rawExecuted : undefined;

  const callProviderMetadata =
    (source as { callProviderMetadata?: unknown }).callProviderMetadata ??
    (source as { metadata?: unknown }).metadata ??
    (source !== part
      ? ((part as { callProviderMetadata?: unknown }).callProviderMetadata ??
        (part as { metadata?: unknown }).metadata)
      : undefined);

  const preliminary =
    (source as { preliminary?: unknown }).preliminary ??
    (source !== part
      ? (part as { preliminary?: unknown }).preliminary
      : undefined);

  const rawState =
    (source as { state?: unknown }).state ??
    (source !== part ? (part as { state?: unknown }).state : undefined);

  return {
    rawType,
    toolName,
    toolCallId,
    input,
    output,
    errorText,
    providerExecuted,
    callProviderMetadata,
    preliminary,
    rawState,
  };
}

// 统一的状态推断逻辑：优先映射已有 state，缺省时按类型与输出/错误推导
function inferToolState(params: {
  rawState: unknown;
  type?: string;
  output: unknown;
  errorText?: string;
}): ToolInvocationState {
  const { rawState, type, output, errorText } = params;

  const fallback: ToolInvocationState = (() => {
    if (type === "tool-result") {
      return errorText ? "output-error" : "output-available";
    }
    if (type === "tool-call" || type === "tool-invocation") {
      return "input-available";
    }
    if (output !== undefined) return "output-available";
    if (errorText) return "output-error";
    return "input-available";
  })();

  return normalizeToolState(rawState, fallback);
}

// 类型规范化：将通用类型映射为 tool-<name>，否则落回原值或默认动态工具
function normalizeToolType(params: {
  rawType?: string;
  toolName?: string;
}): string {
  const { rawType, toolName } = params;

  if (
    toolName &&
    (rawType === "tool-invocation" ||
      rawType === "tool-call" ||
      rawType === "tool-result")
  ) {
    return `tool-${toolName}`;
  }

  if (rawType) return rawType;

  return "dynamic-tool";
}

// 核心构建器：将任意原始对象转换为规范化的工具 part，缺少关键字段则返回 null
function buildCanonicalToolPart(
  raw: unknown,
  options?: { defaultType?: string },
): CanonicalToolPart | null {
  const record = toRecord(raw);
  if (!record) return null;

  const {
    rawType,
    toolName,
    toolCallId,
    input,
    output,
    errorText,
    providerExecuted,
    callProviderMetadata,
    preliminary,
    rawState,
  } = extractToolFields(record);

  if (!toolName || !toolCallId) return null;

  const resolvedType = rawType ?? options?.defaultType;

  const canonicalType = normalizeToolType({
    rawType: resolvedType,
    toolName,
  });

  const canonicalState = inferToolState({
    rawState,
    type: resolvedType,
    output,
    errorText,
  });

  const canonical: CanonicalToolPart = {
    type: canonicalType,
    toolName,
    toolCallId,
    state: canonicalState,
  };

  const canonicalRecord = canonical as unknown as Record<string, unknown>;

  addIfDefined(canonicalRecord, "input", input);
  addIfDefined(canonicalRecord, "output", output);
  addIfDefined(canonicalRecord, "errorText", errorText);
  addIfDefined(canonicalRecord, "providerExecuted", providerExecuted);
  addIfDefined(canonicalRecord, "callProviderMetadata", callProviderMetadata);
  addIfDefined(canonicalRecord, "preliminary", preliminary);

  return canonical;
}

function normalizeStoredToolPart(
  raw: unknown,
): ChatUIMessage["parts"][number] | null {
  return buildCanonicalToolPart(raw) as ChatUIMessage["parts"][number] | null;
}

/**
 * 将存储的 Message 转换为 UIMessage（用于 @ai-sdk/react）
 * AI SDK 5.0 使用 parts 数组结构
 */
export function convertMessageToUIMessage(msg: Message): ChatUIMessage {
  let parts: ChatUIMessage["parts"] = [];

  try {
    const parsedParts = JSON.parse(msg.parts_structure);
    if (Array.isArray(parsedParts)) {
      parts = parsedParts
        .map((part) => {
          if (isToolRelatedPart(part)) {
            return normalizeStoredToolPart(part);
          }
          return part;
        })
        .filter((part): part is ChatUIMessage["parts"][number] =>
          Boolean(part),
        );
    }
  } catch (error) {
    logger.error("解析 parts_structure 失败", {
      messageId: msg.id,
      error,
    });
  }

  const metadata: MessageMetadata = {
    modelName: msg.model_name ?? null,
    createdAt: msg.created_at,
  };

  return {
    id: msg.id,
    role: msg.role as "user" | "assistant" | "system",
    parts,
    metadata,
  };
}

/**
 * 将 UIMessage 转换为 CreateMessageInput（用于存储）
 * 规范化工具 part 为 canonical 格式
 */
export function convertUIMessageToCreateInput(
  uiMsg: ChatUIMessage,
  conversationId: string,
  xmlVersionId?: string,
): CreateMessageInput {
  // 规范化所有 parts，特别是工具相关的 part
  const normalizedParts = uiMsg.parts.map((part) => {
    if (isToolRelatedPart(part)) {
      return buildCanonicalToolPart(part, { defaultType: "dynamic-tool" });
    }
    return stripRuntimeImageFields(part);
  });

  const parts_structure = safeJsonStringify(normalizedParts);
  const metadata = (uiMsg.metadata as MessageMetadata | undefined) ?? {};
  const createdAt =
    typeof metadata.createdAt === "number" ? metadata.createdAt : undefined;

  return {
    id: uiMsg.id,
    conversation_id: conversationId,
    role: uiMsg.role as "user" | "assistant" | "system",
    parts_structure,
    model_name: metadata.modelName ?? null,
    xml_version_id: xmlVersionId,
    created_at: createdAt,
  };
}

export function fingerprintMessage(message: ChatUIMessage): string {
  // 指纹忽略时间戳，避免 ensureMessageMetadata 在缺失 createdAt 时注入的临时时间
  // 导致毫秒级抖动，从而触发无意义的同步循环。
  const { metadata } = message;
  const restMetadata: MessageMetadata = {
    ...((metadata as MessageMetadata | undefined) ?? {}),
  };
  delete restMetadata.createdAt;

  return JSON.stringify({
    id: message.id,
    role: message.role,
    parts: message.parts.map(stripRuntimeImageFields),
    metadata: restMetadata,
  });
}

export function getChangedMessages(
  previous: ChatUIMessage[] = [],
  next: ChatUIMessage[] = [],
): ChatUIMessage[] {
  const previousFingerprints = new Map(
    previous.map((msg) => [msg.id, fingerprintMessage(msg)]),
  );

  return next.filter((msg) => {
    const nextFingerprint = fingerprintMessage(msg);
    const prevFingerprint = previousFingerprints.get(msg.id);
    return !prevFingerprint || prevFingerprint !== nextFingerprint;
  });
}

export function generateTitle(messages: ChatUIMessage[]): string {
  if (messages.length === 0) return "新对话";

  const firstUserMessage = messages.find((msg) => msg.role === "user");
  if (!firstUserMessage) return "新对话";

  const textPart = firstUserMessage.parts.find((part) => part.type === "text");
  const text = textPart && "text" in textPart ? textPart.text : "";

  return text.trim().slice(0, 30) || "新对话";
}

async function migrateConversationCaches(
  originalId: string,
  resolveConversationId: ((id: string) => Promise<string | null>) | undefined,
  onConversationResolved: ((resolvedId: string) => void) | undefined,
  conversationMessages: Map<string, ChatUIMessage[]>,
  lastSavedMessages: Map<string, ChatUIMessage[]>,
  notifyMessagesChange: (id: string, messages: ChatUIMessage[]) => void,
): Promise<{ resolvedId: string; error?: string }> {
  if (!resolveConversationId) {
    return { resolvedId: originalId };
  }

  try {
    const resolvedId = await resolveConversationId(originalId);
    if (!resolvedId || resolvedId === originalId) {
      return { resolvedId: originalId };
    }

    onConversationResolved?.(resolvedId);

    const cached = conversationMessages.get(originalId);
    if (cached && !conversationMessages.has(resolvedId)) {
      conversationMessages.set(resolvedId, cached);
      conversationMessages.delete(originalId);
      notifyMessagesChange(resolvedId, cached);
    }

    const saved = lastSavedMessages.get(originalId);
    if (saved && !lastSavedMessages.has(resolvedId)) {
      lastSavedMessages.set(resolvedId, saved);
      lastSavedMessages.delete(originalId);
    }

    return { resolvedId };
  } catch (error) {
    return {
      resolvedId: originalId,
      error: toErrorString(error) || "保存前校验会话失败",
    };
  }
}

async function handleNoChanges(
  conversationId: string,
  normalizedMessages: ChatUIMessage[],
  previousMessages: ChatUIMessage[],
  forceTitleUpdate: boolean,
  lastSavedMessages: Map<string, ChatUIMessage[]>,
  updateConversation: (
    id: string,
    updates: Partial<Pick<Conversation, "title">>,
  ) => Promise<void>,
  generateTitle: (messages: ChatUIMessage[]) => string,
  logger: Logger,
): Promise<boolean> {
  const changedMessages = getChangedMessages(
    previousMessages,
    normalizedMessages,
  );

  if (changedMessages.length > 0) {
    return false;
  }

  const nextTitle = generateTitle(normalizedMessages);

  if (forceTitleUpdate) {
    try {
      await updateConversation(conversationId, { title: nextTitle });
    } catch (error) {
      logger.error("强制更新对话标题失败", { conversationId, error });
    }
  }

  if (!lastSavedMessages.has(conversationId)) {
    lastSavedMessages.set(conversationId, normalizedMessages);
  }

  return true;
}

async function persistWithRetry(
  messagesToPersist: CreateMessageInput[],
  conversationId: string,
  normalizedMessages: ChatUIMessage[],
  addMessages: (messages: CreateMessageInput[]) => Promise<Message[]>,
  updateConversation: (
    id: string,
    updates: Partial<Pick<Conversation, "title">>,
  ) => Promise<void>,
  generateTitle: (messages: ChatUIMessage[]) => string,
  conversationMessages: Map<string, ChatUIMessage[]>,
  lastSavedMessages: Map<string, ChatUIMessage[]>,
  notifyMessagesChange: (id: string, messages: ChatUIMessage[]) => void,
  logger: Logger,
  maxRetries = 3,
): Promise<{ success: boolean; error?: string }> {
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      await addMessages(messagesToPersist);

      const nextTitle = generateTitle(normalizedMessages);
      await updateConversation(conversationId, { title: nextTitle });

      conversationMessages.set(conversationId, normalizedMessages);
      lastSavedMessages.set(conversationId, normalizedMessages);
      notifyMessagesChange(conversationId, normalizedMessages);

      return { success: true };
    } catch (error) {
      logger.error("保存消息失败", { conversationId, attempt, error });

      if (attempt >= maxRetries) {
        const message = toErrorString(error) || "消息保存失败";
        return { success: false, error: message };
      }

      await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
    }
  }

  return { success: false, error: "重试次数已用尽" };
}

// ========== 服务实现 ========== //

interface SavePayload extends SaveOptions {
  conversationId: string;
  messages: ChatUIMessage[];
}

export function createChatSessionService(
  deps: ChatSessionServiceDeps,
  options: ChatSessionServiceOptions,
): ChatSessionService {
  const {
    getMessages,
    addMessages,
    updateConversation,
    subscribeToConversations,
    subscribeToMessages,
  } = deps;

  const {
    onMessagesChange,
    onSavingChange,
    onSaveError,
    debounceMs = 1000,
  } = options;

  let ensureMessageMetadata = options.ensureMessageMetadata;
  let defaultXmlVersionId = options.defaultXmlVersionId ?? null;
  let previousConversationId: string | null = null;
  let pendingSavePayload: SavePayload | null = null;

  const conversationMessages = new Map<string, ChatUIMessage[]>();
  const lastSavedMessages = new Map<string, ChatUIMessage[]>();

  const notifyMessagesChange = (
    conversationId: string,
    messages: ChatUIMessage[],
  ) => {
    onMessagesChange?.(conversationId, messages);
  };

  const debouncedSave: DebouncedFunction<[SavePayload]> = debounce(
    (payload: SavePayload) => {
      pendingSavePayload = payload;
      void persistMessages(payload);
    },
    debounceMs,
  );

  const persistMessages = async (payload: SavePayload) => {
    if (!payload.conversationId) return;

    onSaveError?.("");

    const originalId = payload.conversationId;
    const { resolvedId, error: migrateError } = await migrateConversationCaches(
      originalId,
      payload.resolveConversationId,
      payload.onConversationResolved,
      conversationMessages,
      lastSavedMessages,
      notifyMessagesChange,
    );

    if (migrateError) {
      onSaveError?.(migrateError);
      onSavingChange?.(false);
      return;
    }

    const conversationId = resolvedId;

    const normalizedMessages = payload.messages.map(ensureMessageMetadata);

    const previousMessages =
      lastSavedMessages.get(conversationId) ??
      conversationMessages.get(conversationId) ??
      [];

    const noChanges = await handleNoChanges(
      conversationId,
      normalizedMessages,
      previousMessages,
      Boolean(payload.forceTitleUpdate),
      lastSavedMessages,
      updateConversation,
      generateTitle,
      logger,
    );

    if (noChanges) {
      onSavingChange?.(false);
      onSaveError?.("");
      return;
    }

    const changedMessages = getChangedMessages(
      previousMessages,
      normalizedMessages,
    );

    const messagesToPersist = changedMessages.map((msg) =>
      convertUIMessageToCreateInput(
        msg,
        conversationId,
        defaultXmlVersionId ?? undefined,
      ),
    );

    onSavingChange?.(true);
    onSaveError?.("");

    const { success } = await persistWithRetry(
      messagesToPersist,
      conversationId,
      normalizedMessages,
      addMessages,
      updateConversation,
      generateTitle,
      conversationMessages,
      lastSavedMessages,
      notifyMessagesChange,
      logger,
    );

    onSavingChange?.(false);

    if (!success) {
      const userMessage =
        "消息自动保存失败，已停止自动重试。请检查存储或网络状态后重试。";
      onSaveError?.(userMessage);
      pendingSavePayload = null;
      return;
    }

    onSaveError?.("");
    pendingSavePayload = null;
  };

  const ensureMessages = async (
    conversationId: string,
  ): Promise<ChatUIMessage[]> => {
    if (!conversationId) return [];

    const cached = conversationMessages.get(conversationId);
    if (cached) return cached;

    const storedMessages = await getMessages(conversationId);
    const normalized = storedMessages
      .map(convertMessageToUIMessage)
      .map(ensureMessageMetadata);

    conversationMessages.set(conversationId, normalized);
    lastSavedMessages.set(conversationId, normalized);
    notifyMessagesChange(conversationId, normalized);

    return normalized;
  };

  const handleSubscribedMessages = (
    conversationId: string,
    storedMessages: Message[],
  ) => {
    const normalized = storedMessages
      .map(convertMessageToUIMessage)
      .map(ensureMessageMetadata);
    conversationMessages.set(conversationId, normalized);
    lastSavedMessages.set(conversationId, normalized);
    notifyMessagesChange(conversationId, normalized);
  };

  const syncMessages = (
    conversationId: string,
    messages: ChatUIMessage[],
    options?: SaveOptions,
  ) => {
    if (!conversationId) return;
    const normalized = messages.map(ensureMessageMetadata);
    conversationMessages.set(conversationId, normalized);
    notifyMessagesChange(conversationId, normalized);

    const payload: SavePayload = {
      conversationId,
      messages: normalized,
      ...options,
    };

    pendingSavePayload = payload;
    debouncedSave(payload);
  };

  const saveNow = async (
    conversationId: string,
    messages: ChatUIMessage[],
    options?: SaveOptions,
  ) => {
    const payload: SavePayload = {
      conversationId,
      messages,
      ...options,
    };
    pendingSavePayload = payload;
    await persistMessages(payload);
  };

  const flushPending = (conversationId?: string | null) => {
    if (!pendingSavePayload) return;
    if (
      !conversationId ||
      pendingSavePayload.conversationId === conversationId
    ) {
      debouncedSave.flush();
      pendingSavePayload = null;
    }
  };

  const handleConversationSwitch = (nextConversationId: string | null) => {
    if (
      previousConversationId &&
      previousConversationId !== nextConversationId
    ) {
      flushPending(previousConversationId);
    }
    previousConversationId = nextConversationId;
  };

  const subscribeMessagesWithCache = (
    conversationId: string,
    onError?: (error: Error) => void,
  ) => {
    if (!conversationId) return () => undefined;
    return subscribeToMessages(
      conversationId,
      (storedMessages) =>
        handleSubscribedMessages(conversationId, storedMessages),
      onError,
    );
  };

  const removeConversationCaches = (conversationIds: string[]) => {
    conversationIds.forEach((id) => {
      conversationMessages.delete(id);
      lastSavedMessages.delete(id);
    });
  };

  const dispose = () => {
    if (pendingSavePayload) {
      debouncedSave.flush();
      pendingSavePayload = null;
    } else {
      debouncedSave.cancel();
    }
  };

  return {
    subscribeConversations: subscribeToConversations,
    subscribeMessages: subscribeMessagesWithCache,
    ensureMessages,
    syncMessages,
    saveNow,
    flushPending,
    handleConversationSwitch,
    updateDefaultXmlVersionId: (versionId: string | null) => {
      defaultXmlVersionId = versionId;
    },
    setEnsureMessageMetadata: (fn) => {
      ensureMessageMetadata = fn;
    },
    removeConversationCaches,
    getCachedMessages: (conversationId: string) =>
      conversationMessages.get(conversationId),
    dispose,
  };
}
