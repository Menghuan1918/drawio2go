"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import { MessageSyncStateMachine } from "@/lib/message-sync-state-machine";
import { fingerprintMessage } from "@/lib/chat-session-service";
import type { ChatUIMessage } from "@/app/types/chat";
import type { ChatSessionService } from "@/lib/chat-session-service";
import { createLogger } from "@/lib/logger";
import type {
  ChatRunState,
  ChatRunStateMachine,
} from "@/lib/chat-run-state-machine";

const logger = createLogger("useChatMessages");

/**
 * 日志前缀常量
 */
const LOG_PREFIX = "[useChatMessages]";

/**
 * 同步完成事件常量
 */
const SYNC_COMPLETE_EVENT = "sync-complete" as const;

/**
 * 消息指纹数组（用于对比消息变更）
 */
type MessageFingerprints = string[];

/**
 * useChatMessages Hook 参数
 */
export interface UseChatMessagesOptions {
  /**
   * 当前活动的会话 ID
   */
  activeConversationId: string | null;

  /**
   * 聊天会话服务实例
   */
  chatService: ChatSessionService;

  /**
   * 是否正在流式聊天
   * - 流式时锁定同步，避免干扰
   */
  isChatStreaming: boolean;

  /**
   * 聊天运行状态机（ChatSidebar 内创建）
   *
   * 用于扩展锁范围：在 preparing/上传附件阶段同样锁住 storage ↔ UI 同步，
   * 避免 saveUserMessage（storage 写入 + 订阅更新）与 sendMessage（useChat 内部追加）
   * 产生竞态，导致 UI 中出现重复 message.id（React 重复 key）。
   */
  chatRunStateMachine: ChatRunStateMachine;

  /**
   * 会话消息缓存（来自 useChatSessionsController）
   * - key: conversationId
   * - value: messages
   */
  conversationMessages: Record<string, ChatUIMessage[]>;

  /**
   * useChat 的 setMessages 函数
   * - 用于更新 AI SDK 的消息状态
   */
  setMessages: Dispatch<SetStateAction<ChatUIMessage[]>>;

  /**
   * 当前 useChat 的消息列表（原始）
   * - 用于计算 displayMessages 和同步到存储
   */
  messages: ChatUIMessage[];

  /**
   * 消息元数据补全函数
   * - 确保每条消息都有完整的 metadata（modelName, createdAt）
   */
  ensureMessageMetadata: (message: ChatUIMessage) => ChatUIMessage;

  /**
   * 会话 ID 解析函数
   * - 将 temp-xxx 转换为真实 ID
   */
  resolveConversationId: (conversationId: string) => Promise<string>;
}

/**
 * useChatMessages Hook 返回值
 */
export interface UseChatMessagesResult {
  /**
   * 展示用消息列表（过滤系统消息）
   */
  displayMessages: ChatUIMessage[];

  /**
   * 消息同步状态机
   */
  syncStateMachine: MessageSyncStateMachine;

  /**
   * 手动从存储刷新消息
   * - 用于外部触发强制刷新
   */
  refreshFromStorage: () => void;
}

/**
 * 聊天消息管理 Hook
 *
 * 职责：
 * - 消息同步（storage ↔ UI）的双向同步逻辑
 * - 使用 MessageSyncStateMachine 管理同步状态
 * - 消息指纹计算和对比，避免无意义的同步循环
 * - displayMessages 的计算和过滤（移除系统消息）
 * - 与 @ai-sdk/react useChat 的消息集成
 *
 * 设计说明：
 * - 使用状态机替代 applyingFromStorageRef，解决竞态问题
 * - 使用指纹对比避免重复同步
 * - 流式时锁定同步，确保流式消息不被覆盖
 * - 提供清晰的同步方向和生命周期管理
 *
 * @example
 * ```tsx
 * const {
 *   displayMessages,
 *   syncStateMachine,
 *   refreshFromStorage,
 * } = useChatMessages({
 *   activeConversationId,
 *   chatService,
 *   isChatStreaming,
 *   conversationMessages,
 *   setMessages,
 *   messages,
 *   resolveConversationId,
 * });
 * ```
 */
export function useChatMessages(
  options: UseChatMessagesOptions,
): UseChatMessagesResult {
  const {
    activeConversationId,
    chatService,
    isChatStreaming,
    chatRunStateMachine,
    conversationMessages,
    setMessages,
    messages,
    ensureMessageMetadata,
    resolveConversationId,
  } = options;

  // ========== 状态机与缓存 ========== //

  /**
   * 消息同步状态机
   * - 管理同步方向和锁定状态
   */
  const syncStateMachine = useRef(new MessageSyncStateMachine());

  /**
   * 上次同步到 UI 的消息指纹
   * - key: conversationId
   * - value: 消息指纹数组
   */
  const lastSyncedToUIRef = useRef<Record<string, MessageFingerprints>>({});

  /**
   * 上次同步到存储的消息指纹
   * - key: conversationId
   * - value: 消息指纹数组
   */
  const lastSyncedToStoreRef = useRef<Record<string, MessageFingerprints>>({});

  /**
   * setMessages 函数的引用
   * - 用于避免闭包陷阱
   */
  const setMessagesRef = useRef(setMessages);
  useEffect(() => {
    setMessagesRef.current = setMessages;
  }, [setMessages]);

  // ========== 辅助函数 ========== //

  /**
   * 比较两组消息指纹是否相同
   *
   * @param a 指纹数组 A
   * @param b 指纹数组 B
   * @returns 是否相同
   */
  const areFingerprintsEqual = useCallback(
    (
      a: MessageFingerprints | undefined,
      b: MessageFingerprints | undefined,
    ): boolean => {
      if (!a || !b) return false;
      if (a.length !== b.length) return false;
      return a.every((fp, index) => fp === b[index]);
    },
    [],
  );

  /**
   * 手动从存储刷新消息
   * - 跳过状态机检查，强制同步
   */
  const refreshFromStorage = useCallback(() => {
    if (!activeConversationId) {
      logger.warn(`${LOG_PREFIX} refreshFromStorage: 无活动会话`);
      return;
    }

    logger.info(`${LOG_PREFIX} refreshFromStorage: 强制从存储刷新消息`, {
      conversationId: activeConversationId,
    });

    const cached = conversationMessages[activeConversationId];
    if (!cached) {
      logger.warn(`${LOG_PREFIX} refreshFromStorage: 缓存中无消息`);
      return;
    }

    const cachedFingerprints = cached.map(fingerprintMessage);

    // 强制进入 storage-to-ui 状态
    if (syncStateMachine.current.canTransition("storage-changed")) {
      syncStateMachine.current.transition("storage-changed");
    }

    setMessagesRef.current(cached);

    // 更新指纹缓存
    lastSyncedToUIRef.current[activeConversationId] = cachedFingerprints;
    lastSyncedToStoreRef.current[activeConversationId] = cachedFingerprints;

    // 完成同步
    if (syncStateMachine.current.canTransition(SYNC_COMPLETE_EVENT)) {
      syncStateMachine.current.transition(SYNC_COMPLETE_EVENT);
    }
  }, [activeConversationId, conversationMessages]);

  // ========== 计算展示消息 ========== //

  /**
   * 展示用消息列表（过滤系统消息）
   * - 系统消息不展示在 UI 中
   * - 应用 ensureMessageMetadata 确保每条消息都有完整的 metadata
   */
  const displayMessages = useMemo(() => {
    return messages
      .filter((msg) => msg.role !== "system")
      .map(ensureMessageMetadata);
  }, [messages, ensureMessageMetadata]);

  // ========== 流式状态管理 ========== //

  /**
   * 应用同步锁（扩展范围）
   *
   * 说明：
   * - 过去只在流式阶段锁定同步（isChatStreaming）
   * - 但图片对话会在 preparing 阶段先写入消息与附件（saveUserMessage），触发 storage 订阅更新，
   *   与 sendMessage 产生竞态，可能把同一个 message.id 写入两次，触发 React 重复 key
   * - 因此锁条件扩展为：isChatStreaming || chatRunState !== "idle"
   */
  const applySyncLock = useCallback(
    (runState: ChatRunState) => {
      const machine = syncStateMachine.current;
      const shouldLockSync = isChatStreaming || runState !== "idle";

      if (shouldLockSync) {
        if (machine.canTransition("stream-start")) {
          logger.info(`${LOG_PREFIX} 聊天运行中，锁定消息同步`, {
            runState,
            isChatStreaming,
          });
          machine.transition("stream-start");
        }
        return;
      }

      if (machine.canTransition("stream-end")) {
        logger.info(`${LOG_PREFIX} 聊天空闲，解锁消息同步`, {
          runState,
          isChatStreaming,
        });
        machine.transition("stream-end");
      }
    },
    [isChatStreaming],
  );

  useEffect(() => {
    applySyncLock(chatRunStateMachine.getState());

    const unsubscribe = chatRunStateMachine.subscribe((state) => {
      applySyncLock(state);
    });

    return unsubscribe;
  }, [applySyncLock, chatRunStateMachine]);

  // ========== Storage → UI 同步 ========== //

  /**
   * 监听存储变化，同步到 UI
   * - 仅在非流式、非锁定状态下执行
   * - 使用指纹对比避免重复同步
   */
  useEffect(() => {
    const targetConversationId = activeConversationId;
    if (!targetConversationId) return;

    const machine = syncStateMachine.current;

    // 流式时不同步
    if (machine.isLocked()) {
      logger.debug(`${LOG_PREFIX} 同步被锁定（聊天运行中），跳过 storage → UI`);
      return;
    }

    // 正在同步中，避免冲突
    if (machine.isSyncing()) {
      logger.debug(`${LOG_PREFIX} 正在同步中，跳过 storage → UI`);
      return;
    }

    const cached = conversationMessages[targetConversationId];
    if (!cached) return;

    const cachedFingerprints = cached.map(fingerprintMessage);
    const lastSyncedToUI = lastSyncedToUIRef.current[targetConversationId];

    // 已同步过且内容未变化时直接跳过
    if (areFingerprintsEqual(cachedFingerprints, lastSyncedToUI)) {
      return;
    }

    logger.info(`${LOG_PREFIX} 存储变化,同步到 UI`, {
      conversationId: targetConversationId,
      messageCount: cached.length,
    });

    // 转换状态：idle → storage-to-ui
    if (machine.canTransition("storage-changed")) {
      machine.transition("storage-changed");
    }

    setMessagesRef.current((current) => {
      // 再次校验状态与会话，避免切换时覆盖流式消息
      const latestMachine = syncStateMachine.current;
      if (
        latestMachine.isLocked() ||
        activeConversationId !== targetConversationId
      ) {
        logger.warn(`${LOG_PREFIX} 状态变化，取消 storage → UI 同步`);
        return current;
      }

      const currentFingerprints = current.map(fingerprintMessage);

      const isSame = areFingerprintsEqual(
        cachedFingerprints,
        currentFingerprints,
      );

      if (isSame) {
        logger.debug(`${LOG_PREFIX} 消息已相同，跳过更新`);
        lastSyncedToUIRef.current[targetConversationId] = cachedFingerprints;
        lastSyncedToStoreRef.current[targetConversationId] = cachedFingerprints;
        return current;
      }

      logger.info(`${LOG_PREFIX} 应用存储消息到 UI`);
      lastSyncedToUIRef.current[targetConversationId] = cachedFingerprints;
      lastSyncedToStoreRef.current[targetConversationId] = cachedFingerprints;

      return cached;
    });

    // 在微任务中完成同步状态转换
    queueMicrotask(() => {
      const latestMachine = syncStateMachine.current;
      if (latestMachine.canTransition(SYNC_COMPLETE_EVENT)) {
        latestMachine.transition(SYNC_COMPLETE_EVENT);
      }
    });
  }, [
    activeConversationId,
    conversationMessages,
    areFingerprintsEqual,
    // isChatStreaming 不需要添加，因为状态机已经处理了
  ]);

  // ========== UI → Storage 同步 ========== //

  /**
   * 监听 displayMessages 变化，同步到存储
   * - 仅在非流式、非锁定、非 storage-to-ui 状态下执行
   * - 使用指纹对比避免重复同步
   */
  useEffect(() => {
    if (!activeConversationId) return;

    const machine = syncStateMachine.current;

    // 流式时不同步
    if (machine.isLocked()) {
      logger.debug(`${LOG_PREFIX} 同步被锁定（聊天运行中），跳过 UI → storage`);
      return;
    }

    // 正在从存储同步到 UI，避免循环
    if (machine.getState() === "storage-to-ui") {
      logger.debug(`${LOG_PREFIX} 正在从存储同步到 UI，跳过 UI → storage`);
      return;
    }

    const currentFingerprints = displayMessages.map(fingerprintMessage);

    // 缓存与当前展示相同则无需再次触发同步
    if (
      areFingerprintsEqual(
        currentFingerprints,
        lastSyncedToStoreRef.current[activeConversationId],
      )
    ) {
      return;
    }

    logger.info(`${LOG_PREFIX} UI 消息变化，同步到存储`, {
      conversationId: activeConversationId,
      messageCount: displayMessages.length,
    });

    // 转换状态：idle → ui-to-storage
    if (machine.canTransition("ui-changed")) {
      machine.transition("ui-changed");
    }

    lastSyncedToStoreRef.current[activeConversationId] = currentFingerprints;

    chatService.syncMessages(activeConversationId, displayMessages, {
      resolveConversationId,
    });

    // 在微任务中完成同步状态转换
    queueMicrotask(() => {
      const latestMachine = syncStateMachine.current;
      if (latestMachine.canTransition(SYNC_COMPLETE_EVENT)) {
        latestMachine.transition(SYNC_COMPLETE_EVENT);
      }
    });
  }, [
    activeConversationId,
    chatService,
    displayMessages,
    areFingerprintsEqual,
    resolveConversationId,
    // isChatStreaming 不需要添加，因为状态机已经处理了
  ]);

  // ========== 返回值 ========== //

  return {
    displayMessages,
    syncStateMachine: syncStateMachine.current,
    refreshFromStorage,
  };
}
