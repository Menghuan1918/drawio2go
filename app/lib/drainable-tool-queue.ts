/**
 * 可等待清空的工具执行队列
 *
 * 核心功能：
 * - 串行执行工具任务，保持执行顺序
 * - 提供 drain() 方法等待所有任务完成
 * - 支持多个调用者同时等待队列清空
 * - 单个任务失败不影响队列继续执行
 * - 带超时保护，防止永久阻塞
 *
 * 用途：确保 onFinish 等待工具队列完成后再保存消息和释放锁
 */

import { createLogger } from "@/lib/logger";

const logger = createLogger("DrainableToolQueue");

export class DrainableToolQueue {
  // Promise 链用于串行执行任务
  private queue: Promise<void> = Promise.resolve();

  // 待执行任务计数器
  private pendingCount = 0;

  // 等待队列清空的 Promise resolvers
  private drainResolvers: Array<() => void> = [];

  /**
   * 将任务添加到队列
   *
   * @param task 异步任务函数
   *
   * @example
   * queue.enqueue(async () => {
   *   await executeToolCall(toolCall);
   * });
   */
  enqueue(task: () => Promise<void>): void {
    this.pendingCount++;
    logger.debug("Task enqueued", { pendingCount: this.pendingCount });

    this.queue = this.queue
      .then(async () => {
        try {
          await task();
          logger.debug("Task completed successfully");
        } catch (error) {
          // 单个任务失败不影响队列继续
          logger.error("Task failed", { error });
        }
      })
      .finally(() => {
        this.pendingCount--;
        logger.debug("Task finished", { pendingCount: this.pendingCount });

        // 如果队列已清空，通知所有等待者
        if (this.pendingCount === 0) {
          logger.info("Queue drained, resolving all waiters", {
            waiterCount: this.drainResolvers.length,
          });
          this.drainResolvers.forEach((resolve) => resolve());
          this.drainResolvers = [];
        }
      });
  }

  /**
   * 等待队列清空
   *
   * - 如果队列已空，立即返回
   * - 如果队列有任务，阻塞等待所有任务完成
   * - 支持超时保护（默认 60 秒）
   *
   * @param timeout 超时时间（毫秒），默认 60000ms
   * @returns Promise<void>
   * @throws Error 如果超时
   *
   * @example
   * await queue.drain(); // 等待所有工具完成
   */
  async drain(timeout = 60000): Promise<void> {
    if (this.pendingCount === 0) {
      logger.debug("Queue already empty, drain immediately");
      return;
    }

    logger.info("Waiting for queue to drain", {
      pendingCount: this.pendingCount,
      timeout,
    });

    // 创建等待 Promise，并记录 resolver 用于超时清理
    let drainResolver: (() => void) | null = null;
    const drainPromise = new Promise<void>((resolve) => {
      drainResolver = resolve;
      this.drainResolvers.push(resolve);
    });

    // 创建超时 Promise
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            `Tool queue drain timeout after ${timeout}ms (${this.pendingCount} tasks still pending)`,
          ),
        );
      }, timeout);
    });

    // 竞争：先完成的 Promise 胜出
    try {
      await Promise.race([drainPromise, timeoutPromise]);
      logger.info("Queue drained successfully");
    } catch (error) {
      // 超时后清理等待者列表
      if (drainResolver) {
        this.drainResolvers = this.drainResolvers.filter(
          (resolve) => resolve !== drainResolver,
        );
      }
      logger.error("Queue drain failed", {
        error,
        pendingCount: this.pendingCount,
      });
      throw error;
    }
  }

  /**
   * 获取待执行任务数量
   *
   * @returns 待执行任务数
   *
   * @example
   * const count = queue.getPendingCount();
   * console.log(`${count} tasks pending`);
   */
  getPendingCount(): number {
    return this.pendingCount;
  }
}
