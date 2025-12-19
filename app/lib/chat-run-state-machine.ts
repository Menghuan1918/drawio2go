/**
 * 聊天运行状态机
 *
 * 统一管理聊天会话生命周期状态，避免使用 ref 导致的竞态条件
 *
 * 核心功能：
 * - 定义清晰的状态和转换规则
 * - 管理会话上下文（conversationId、锁状态等）
 * - 支持状态变化订阅
 * - 记录详细的状态转换日志
 *
 * 用途：替代 sendingSessionIdRef，统一管理会话 ID 和生命周期
 */

import { createLogger } from "@/lib/logger";
import type { ChatUIMessage } from "@/app/types/chat";

const logger = createLogger("ChatRunStateMachine");

/**
 * 聊天运行状态
 */
export type ChatRunState =
  | "idle" // 空闲，无活动请求
  | "preparing" // 准备中（获取锁、验证输入）
  | "streaming" // 流式响应中
  | "tools-pending" // 工具执行中（流式已完成，等待工具）
  | "finalizing" // 最终化（保存消息、释放锁）
  | "cancelled" // 已取消
  | "errored"; // 出错

/**
 * 状态转换事件
 */
export type ChatRunEvent =
  | "submit" // 用户提交消息
  | "lock-acquired" // 锁获取成功
  | "lock-failed" // 锁获取失败
  | "streaming-start" // 开始流式响应
  | "finish-with-tools" // 流式完成，有工具待执行
  | "finish-no-tools" // 流式完成，无工具
  | "tools-complete-continue" // 工具完成，需继续流式
  | "tools-complete-done" // 工具完成，无需继续
  | "finalize-complete" // 最终化完成
  | "cancel" // 用户取消
  | "cancel-complete" // 取消完成
  | "error" // 发生错误
  | "error-cleanup"; // 错误清理完成

/**
 * 聊天运行上下文
 *
 * 替代 sendingSessionIdRef，集中管理会话状态
 */
export interface ChatRunContext {
  conversationId: string; // 目标会话 ID
  lockAcquired: boolean; // 锁是否已获取
  abortController: AbortController | null; // 请求中止器
  pendingToolCount: number; // 待执行工具数
  lastMessages: ChatUIMessage[]; // 最后消息快照
}

/**
 * 状态转换表
 *
 * 定义所有合法的状态转换
 */
const STATE_TRANSITIONS: Record<
  ChatRunState,
  Partial<Record<ChatRunEvent, ChatRunState>>
> = {
  idle: {
    submit: "preparing",
  },
  preparing: {
    "lock-acquired": "streaming",
    "lock-failed": "idle",
    error: "errored",
  },
  streaming: {
    "finish-with-tools": "tools-pending",
    "finish-no-tools": "finalizing",
    cancel: "cancelled",
    error: "errored",
  },
  "tools-pending": {
    "tools-complete-continue": "streaming",
    "tools-complete-done": "finalizing",
    cancel: "cancelled",
    error: "errored",
  },
  finalizing: {
    "finalize-complete": "idle",
    error: "errored",
  },
  cancelled: {
    "cancel-complete": "idle",
  },
  errored: {
    "error-cleanup": "idle",
  },
};

/**
 * 聊天运行状态机
 */
export class ChatRunStateMachine {
  private state: ChatRunState = "idle";
  private context: ChatRunContext | null = null;
  private listeners: Array<
    (state: ChatRunState, context: ChatRunContext | null) => void
  > = [];

  /**
   * 获取当前状态
   */
  getState(): ChatRunState {
    return this.state;
  }

  /**
   * 获取当前上下文
   *
   * @returns 上下文对象，如果未初始化则返回 null
   */
  getContext(): ChatRunContext | null {
    return this.context;
  }

  /**
   * 初始化上下文
   *
   * @param conversationId 会话 ID
   *
   * @example
   * stateMachine.initContext(activeConversationId);
   * const ctx = stateMachine.getContext()!;
   * ctx.lockAcquired = true;
   */
  initContext(conversationId: string): void {
    logger.info("Init context", { conversationId });
    this.context = {
      conversationId,
      lockAcquired: false,
      abortController: null,
      pendingToolCount: 0,
      lastMessages: [],
    };
  }

  /**
   * 清理上下文
   *
   * 通常在会话完成、取消或出错后调用
   *
   * @example
   * stateMachine.clearContext();
   */
  clearContext(): void {
    if (this.context) {
      logger.info("Clear context", {
        conversationId: this.context.conversationId,
      });
      this.context = null;
    }
  }

  /**
   * 状态转换
   *
   * @param event 触发事件
   * @throws Error 如果转换非法
   *
   * @example
   * stateMachine.transition('submit');
   * stateMachine.transition('lock-acquired');
   */
  transition(event: ChatRunEvent): void {
    const currentState = this.state;
    const transitions = STATE_TRANSITIONS[currentState];
    const nextState = transitions?.[event];

    if (!nextState) {
      const error = new Error(
        `Invalid state transition: ${currentState} -[${event}]-> (no valid transition)`,
      );
      logger.error("Invalid transition", {
        currentState,
        event,
        availableTransitions: Object.keys(transitions || {}),
      });
      throw error;
    }

    logger.info("State transition", {
      from: currentState,
      to: nextState,
      event,
      conversationId: this.context?.conversationId,
    });

    this.state = nextState;
    this.notifyListeners();
  }

  /**
   * 订阅状态变化
   *
   * @param listener 监听函数
   * @returns 取消订阅函数
   *
   * @example
   * const unsubscribe = stateMachine.subscribe((state, context) => {
   *   console.log('State changed:', state, context);
   * });
   *
   * // 取消订阅
   * unsubscribe();
   */
  subscribe(
    listener: (state: ChatRunState, context: ChatRunContext | null) => void,
  ): () => void {
    this.listeners.push(listener);
    logger.debug("Listener subscribed", {
      listenerCount: this.listeners.length,
    });

    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
      logger.debug("Listener unsubscribed", {
        listenerCount: this.listeners.length,
      });
    };
  }

  /**
   * 通知所有监听者
   */
  private notifyListeners(): void {
    if (this.listeners.length === 0) return;

    logger.debug("Notifying listeners", {
      listenerCount: this.listeners.length,
      state: this.state,
    });

    this.listeners.forEach((listener) => {
      try {
        listener(this.state, this.context);
      } catch (error) {
        logger.error("Listener error", { error });
      }
    });
  }

  /**
   * 检查是否可以进行某个转换
   *
   * @param event 事件
   * @returns 是否可以转换
   */
  canTransition(event: ChatRunEvent): boolean {
    const transitions = STATE_TRANSITIONS[this.state];
    return transitions?.[event] !== undefined;
  }
}
