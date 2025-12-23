"use client";

import { useCallback, useRef, useState } from "react";
import type { Tool } from "ai";
import { DrainableToolQueue } from "@/app/lib/drainable-tool-queue";
import { TOOL_TIMEOUT_CONFIG } from "@/lib/constants/tool-config";
import { AI_TOOL_NAMES } from "@/lib/constants/tool-names";
import { createLogger } from "@/lib/logger";
import { ErrorCodes } from "@/app/errors/error-codes";
import { normalizeToError, toErrorString } from "@/lib/error-utils";
import {
  isToolErrorResult,
  type ToolErrorResult,
  type ToolZodValidationErrorDetails,
} from "@/app/types/tool-errors";
import { formatToolErrorDetailsToText } from "@/app/lib/tool-error-format";
import {
  drawioEditBatchInputSchema,
  drawioOverwriteInputSchema,
  drawioReadInputSchema,
} from "@/app/lib/schemas/drawio-tool-schemas";

const logger = createLogger("useChatToolExecution");

/**
 * 工具输入 Schema 映射表
 * - 用于验证工具调用的输入参数
 */
const TOOL_INPUT_SCHEMAS = {
  [AI_TOOL_NAMES.DRAWIO_READ]: drawioReadInputSchema.optional(),
  [AI_TOOL_NAMES.DRAWIO_EDIT_BATCH]: drawioEditBatchInputSchema,
  [AI_TOOL_NAMES.DRAWIO_OVERWRITE]: drawioOverwriteInputSchema,
} as const;

/**
 * 工具调用参数
 */
export interface ToolCall {
  /**
   * 工具调用 ID
   */
  toolCallId: string;

  /**
   * 工具名称
   */
  toolName: string;

  /**
   * 工具输入参数
   */
  input: unknown;
}

/**
 * 添加工具结果的回调函数
 */
export type AddToolResultFn = (
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
        /**
         * 结构化错误信息（用于 ToolCallCard 展开查看/复制）
         *
         * 说明：
         * - AI SDK 的类型定义对 output-error 分支限制为 output?: never
         * - 但运行时实现会把 output 挂回 tool part（见 AbstractChat.addToolOutput）
         * - 因此这里允许传入 output，以确保错误信息在存储与展示链路中不丢失
         */
        output?: unknown;
        errorDetails?: unknown;
      },
) => Promise<void>;

/**
 * useChatToolExecution Hook 参数
 */
export interface UseChatToolExecutionOptions {
  /**
   * 前端工具定义
   * - 从 createFrontendDrawioTools 创建
   */
  frontendTools: Record<string, Tool>;

  /**
   * 添加工具结果的回调
   * - 来自 useChat 的 addToolResult
   */
  addToolResult: AddToolResultFn;
}

/**
 * useChatToolExecution Hook 返回值
 */
export interface UseChatToolExecutionResult {
  /**
   * 执行单个工具调用
   *
   * @param toolCall 工具调用参数
   *
   * @example
   * ```ts
   * await executeToolCall({
   *   toolCallId: "call-123",
   *   toolName: "drawio_read",
   *   input: {},
   * });
   * ```
   */
  executeToolCall: (toolCall: ToolCall) => Promise<void>;

  /**
   * 将工具调用添加到队列
   *
   * @param task 异步任务函数
   *
   * @example
   * ```ts
   * enqueueToolCall(async () => {
   *   await executeToolCall(toolCall);
   * });
   * ```
   */
  enqueueToolCall: (task: () => Promise<void>) => void;

  /**
   * 等待工具队列清空
   *
   * @param timeout 超时时间（毫秒），默认 60000ms
   *
   * @example
   * ```ts
   * await drainQueue();
   * console.log("All tools completed");
   * ```
   */
  drainQueue: (timeout?: number) => Promise<void>;

  /**
   * 中止当前正在执行的工具
   *
   * @example
   * ```ts
   * abortCurrentTool();
   * ```
   */
  abortCurrentTool: () => void;

  /**
   * 工具队列引用
   * - 用于检查队列状态
   */
  toolQueue: DrainableToolQueue;

  /**
   * 当前执行的工具调用 ID
   * - null 表示没有工具正在执行
   */
  currentToolCallId: string | null;

  /**
   * 工具执行错误状态
   * - null 表示没有错误
   */
  toolError: Error | null;

  /**
   * 设置工具错误状态
   *
   * @param error 错误对象或 null
   */
  setToolError: (error: Error | null) => void;
}

export type FatalToolError = Error & {
  isFatalToolError: true;
  fatalKind: "addToolResult" | "submitToolError";
  toolName?: string;
  toolCallId?: string;
};

export function isFatalToolError(error: unknown): error is FatalToolError {
  if (!(error instanceof Error)) return false;
  return (error as Partial<FatalToolError>).isFatalToolError === true;
}

function markFatalToolError(
  error: Error,
  meta: Pick<FatalToolError, "fatalKind" | "toolName" | "toolCallId">,
): FatalToolError {
  const fatal = error as FatalToolError;
  fatal.isFatalToolError = true;
  fatal.fatalKind = meta.fatalKind;
  fatal.toolName = meta.toolName;
  fatal.toolCallId = meta.toolCallId;
  return fatal;
}

function buildFatalToolSubmitError(args: {
  fatalKind: FatalToolError["fatalKind"];
  toolName: string;
  toolCallId: string;
  submitError: unknown;
}): FatalToolError {
  const normalized = normalizeToError(args.submitError);
  const prefix =
    args.fatalKind === "addToolResult"
      ? "提交工具结果失败"
      : "提交工具错误失败";
  const error = new Error(
    `${prefix}: ${normalized.message || "未知错误"}`,
  ) as Error & { cause?: unknown };
  error.cause = normalized;
  return markFatalToolError(error, {
    fatalKind: args.fatalKind,
    toolName: args.toolName,
    toolCallId: args.toolCallId,
  });
}

/**
 * 判断错误是否为中止错误
 *
 * @param error 错误对象
 * @returns 是否为中止错误
 */
function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * 创建中止错误
 *
 * @param message 错误消息
 * @returns 中止错误对象
 */
function createAbortError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function appendToolErrorDetailsToText(
  errorText: string,
  errorDetails?: unknown,
): string {
  const detailsText = formatToolErrorDetailsToText(errorDetails);
  if (!detailsText) return errorText;
  if (errorText.includes(detailsText)) return errorText;
  return `${errorText}\n\n${detailsText}`;
}

function buildToolErrorOutput(params: {
  error: string;
  message: string;
  errorDetails?: ToolErrorResult["errorDetails"];
}): { output: ToolErrorResult; combinedMessage: string } {
  const combinedMessage = appendToolErrorDetailsToText(
    params.message,
    params.errorDetails,
  );

  return {
    combinedMessage,
    output: {
      success: false,
      error: params.error,
      message: combinedMessage,
      // 注意：output 中不携带 errorDetails（仅保留在 tool part 顶层用于 UI 展示）
    },
  };
}

/**
 * 带超时的任务执行
 *
 * @param task 异步任务
 * @param timeoutMs 超时时间（毫秒）
 * @param signal 中止信号
 * @returns Promise<T>
 * @throws Error 超时或中止时抛出错误
 */
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

/**
 * 聊天工具执行 Hook
 *
 * 职责：
 * - 管理工具执行队列（DrainableToolQueue）
 * - 执行单个工具调用（executeToolCall）
 * - 管理工具执行的 AbortController
 * - 处理工具执行错误
 * - 跟踪当前执行的工具调用 ID
 *
 * 设计说明：
 * - 使用 DrainableToolQueue 确保工具串行执行
 * - 提供 drainQueue 方法等待所有工具完成
 * - 支持工具执行超时和中止
 * - 工具输入参数自动验证（使用 Zod schema）
 * - 错误处理统一，包括超时、中止、验证失败等
 *
 * @example
 * ```tsx
 * const {
 *   executeToolCall,
 *   enqueueToolCall,
 *   drainQueue,
 *   abortCurrentTool,
 *   toolQueue,
 *   currentToolCallId,
 *   toolError,
 *   setToolError,
 * } = useChatToolExecution({
 *   frontendTools,
 *   addToolResult,
 * });
 *
 * // 在 onToolCall 中使用
 * onToolCall: ({ toolCall }) => {
 *   enqueueToolCall(async () => {
 *     await executeToolCall({
 *       toolCall,
 *     });
 *   });
 * }
 *
 * // 在 onFinish 中等待工具完成
 * onFinish: async () => {
 *   await drainQueue();
 *   // 所有工具执行完成后再保存消息
 * }
 * ```
 */
export function useChatToolExecution(
  options: UseChatToolExecutionOptions,
): UseChatToolExecutionResult {
  const { frontendTools, addToolResult } = options;

  // ========== 状态 ========== //

  /**
   * 工具执行错误状态
   */
  const [toolError, setToolError] = useState<Error | null>(null);

  // ========== 引用 ========== //

  /**
   * 工具队列
   * - 可等待清空的串行执行队列
   */
  const toolQueue = useRef(new DrainableToolQueue());

  /**
   * 当前执行的工具调用 ID
   */
  const currentToolCallIdRef = useRef<string | null>(null);

  /**
   * 当前工具的中止控制器
   */
  const activeToolAbortRef = useRef<AbortController | null>(null);

  /**
   * 前端工具的引用
   * - 用于避免闭包陷阱
   */
  const frontendToolsRef = useRef(frontendTools);
  frontendToolsRef.current = frontendTools;

  // ========== 核心方法 ========== //

  /**
   * 执行单个工具调用
   */
  const executeToolCall = useCallback(
    async (toolCall: ToolCall): Promise<void> => {
      const { toolCallId, toolName, input } = toolCall;

      const tool = frontendToolsRef.current[toolName];

      const submitToolError = async (args: {
        errorText: string;
        output?: unknown;
        errorDetails?: unknown;
      }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 见 AddToolResultFn 说明：运行时支持携带 output
        const submit = addToolResult as any;
        await submit({
          state: "output-error",
          tool: toolName,
          toolCallId,
          errorText: args.errorText,
          output: args.output,
          errorDetails: args.errorDetails,
        });
      };

      // 1. 验证工具存在
      if (!tool || typeof tool.execute !== "function") {
        const errorText = `未知工具: ${toolName}`;
        const errorDetails = { kind: "unknown", toolName };
        const { output, combinedMessage } = buildToolErrorOutput({
          error: "tool_not_found",
          message: errorText,
          errorDetails,
        });
        try {
          await submitToolError({
            errorText: combinedMessage,
            output,
            errorDetails,
          });
        } catch (submitError) {
          const fatalError = buildFatalToolSubmitError({
            fatalKind: "submitToolError",
            toolName,
            toolCallId,
            submitError,
          });
          logger.error(
            "[useChatToolExecution] 提交工具错误失败（tool_not_found）",
            {
              error: fatalError,
              tool: toolName,
              toolCallId,
            },
          );
          setToolError(fatalError);
        }
        return;
      }

      // 2. 获取并验证工具 schema
      const schema = (
        TOOL_INPUT_SCHEMAS as Record<
          string,
          {
            safeParse: (input: unknown) => { success: boolean; data?: unknown };
          }
        >
      )[toolName];

      if (!schema) {
        const errorText = `缺少工具 schema: ${toolName}`;
        const errorDetails = { kind: "unknown", toolName };
        const { output, combinedMessage } = buildToolErrorOutput({
          error: "schema_missing",
          message: errorText,
          errorDetails,
        });
        try {
          await submitToolError({
            errorText: combinedMessage,
            output,
            errorDetails,
          });
        } catch (submitError) {
          const fatalError = buildFatalToolSubmitError({
            fatalKind: "submitToolError",
            toolName,
            toolCallId,
            submitError,
          });
          logger.error(
            "[useChatToolExecution] 提交工具错误失败（schema_missing）",
            {
              error: fatalError,
              tool: toolName,
              toolCallId,
            },
          );
          setToolError(fatalError);
        }
        return;
      }

      // 3. 验证输入参数
      const parsed = schema.safeParse(input) as
        | { success: true; data: unknown }
        | { success: false; error?: { issues?: unknown } };
      if (!parsed.success) {
        const errorText = `工具输入校验失败: ${toolName}`;
        const issuesRaw = parsed.error?.issues;
        const issues = Array.isArray(issuesRaw)
          ? (issuesRaw as Array<Record<string, unknown>>)
              .map((issue) => ({
                path: Array.isArray(issue.path)
                  ? (issue.path as Array<string | number>)
                  : [],
                message: typeof issue.message === "string" ? issue.message : "",
                code: typeof issue.code === "string" ? issue.code : undefined,
                expected: issue.expected,
                received: issue.received,
              }))
              .filter((issue) => issue.message)
          : [];

        const errorDetails: ToolZodValidationErrorDetails = {
          kind: "zod_validation",
          issues,
        };

        const { output, combinedMessage } = buildToolErrorOutput({
          error: "zod_validation",
          message: errorText,
          errorDetails,
        });

        try {
          await submitToolError({
            errorText: combinedMessage,
            output,
            errorDetails,
          });
        } catch (submitError) {
          const fatalError = buildFatalToolSubmitError({
            fatalKind: "submitToolError",
            toolName,
            toolCallId,
            submitError,
          });
          logger.error(
            "[useChatToolExecution] 提交工具错误失败（zod_validation）",
            {
              error: fatalError,
              tool: toolName,
              toolCallId,
            },
          );
          setToolError(fatalError);
        }
        return;
      }

      // 4. 设置当前工具调用 ID 和中止控制器
      currentToolCallIdRef.current = toolCallId;
      const abortController = new AbortController();
      activeToolAbortRef.current = abortController;

      try {
        // 5. 获取工具超时配置
        const timeoutMs =
          TOOL_TIMEOUT_CONFIG[toolName as keyof typeof TOOL_TIMEOUT_CONFIG] ??
          30_000;

        // 6. 执行工具（带超时和中止支持）
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

        // 7. 工具返回了结构化失败结果：统一按错误处理（但保留 output 以便 UI 展开与持久化）
        if (isToolErrorResult(output)) {
          const errorDetails = output.errorDetails;
          const baseText = output.message || output.error || "工具执行失败";
          const combinedMessage = appendToolErrorDetailsToText(
            baseText,
            errorDetails,
          );

          // 注意：传给模型的 output 不携带 errorDetails，避免 API 兼容性问题
          const sanitizedOutput = {
            ...(output as unknown as Record<string, unknown>),
            message: combinedMessage,
          } as Record<string, unknown>;
          delete sanitizedOutput.errorDetails;

          try {
            await submitToolError({
              errorText: combinedMessage,
              output: sanitizedOutput,
              errorDetails,
            });
          } catch (submitError) {
            const fatalError = buildFatalToolSubmitError({
              fatalKind: "submitToolError",
              toolName,
              toolCallId,
              submitError,
            });
            logger.error(
              "[useChatToolExecution] 提交工具结果失败（tool-error-result）",
              {
                error: fatalError,
                tool: toolName,
                toolCallId,
              },
            );
            setToolError(fatalError);
          }
          return;
        }

        // 8. 添加工具结果（成功）
        try {
          await addToolResult({
            tool: toolName,
            toolCallId,
            output,
          });
        } catch (submitError) {
          const fatalError = buildFatalToolSubmitError({
            fatalKind: "addToolResult",
            toolName,
            toolCallId,
            submitError,
          });
          logger.error("[useChatToolExecution] 提交工具结果失败（success）", {
            error: fatalError,
            tool: toolName,
            toolCallId,
          });
          setToolError(fatalError);
        }
      } catch (error) {
        // 9. 处理中止错误
        if (isAbortError(error)) {
          const errorDetails = { kind: "aborted" };
          const { output, combinedMessage } = buildToolErrorOutput({
            error: "aborted",
            message: "已取消",
            errorDetails,
          });
          try {
            await submitToolError({
              errorText: combinedMessage,
              output,
              errorDetails,
            });
          } catch (submitError) {
            const fatalError = buildFatalToolSubmitError({
              fatalKind: "submitToolError",
              toolName,
              toolCallId,
              submitError,
            });
            logger.error("[useChatToolExecution] 提交工具错误失败（abort）", {
              error: fatalError,
              tool: toolName,
              toolCallId,
            });
            setToolError(fatalError);
          }
          return;
        }

        // 10. 处理其他错误
        const errorText = toErrorString(error);

        try {
          const isTimeoutError =
            typeof errorText === "string" &&
            errorText.includes(`[${ErrorCodes.TIMEOUT}]`);

          const errorDetails = {
            kind: isTimeoutError ? "timeout" : "unknown",
          };
          const { output, combinedMessage } = buildToolErrorOutput({
            error: isTimeoutError ? String(ErrorCodes.TIMEOUT) : "tool_error",
            message: String(errorText),
            errorDetails,
          });

          await submitToolError({
            errorText: combinedMessage,
            output,
            errorDetails,
          });
        } catch (submitError) {
          const fatalError = buildFatalToolSubmitError({
            fatalKind: "submitToolError",
            toolName,
            toolCallId,
            submitError,
          });
          logger.error("[useChatToolExecution] 提交工具错误失败（error）", {
            error: fatalError,
            tool: toolName,
            toolCallId,
          });
          setToolError(fatalError);
        }
      } finally {
        // 10. 清理中止控制器和当前工具调用 ID
        if (activeToolAbortRef.current === abortController) {
          activeToolAbortRef.current = null;
        }
        if (currentToolCallIdRef.current === toolCallId) {
          currentToolCallIdRef.current = null;
        }
      }
    },
    [addToolResult],
  );

  /**
   * 将工具调用添加到队列
   */
  const enqueueToolCall = useCallback((task: () => Promise<void>): void => {
    toolQueue.current.enqueue(task);
  }, []);

  /**
   * 等待工具队列清空
   */
  const drainQueue = useCallback(async (timeout = 60000): Promise<void> => {
    await toolQueue.current.drain(timeout);
  }, []);

  /**
   * 中止当前正在执行的工具
   */
  const abortCurrentTool = useCallback((): void => {
    if (activeToolAbortRef.current) {
      activeToolAbortRef.current.abort();
      logger.info("[useChatToolExecution] 中止当前工具", {
        toolCallId: currentToolCallIdRef.current,
      });
    }
  }, []);

  // ========== 返回值 ========== //

  return {
    executeToolCall,
    enqueueToolCall,
    drainQueue,
    abortCurrentTool,
    toolQueue: toolQueue.current,
    currentToolCallId: currentToolCallIdRef.current,
    toolError,
    setToolError,
  };
}
