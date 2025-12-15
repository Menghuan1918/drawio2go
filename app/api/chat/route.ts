import { createDrawioTools } from "@/app/lib/drawio-ai-tools";
import { normalizeLLMConfig } from "@/app/lib/config-utils";
import { LLMConfig } from "@/app/types/chat";
import { ErrorCodes, type ErrorCode } from "@/app/errors/error-codes";
import { createLogger } from "@/lib/logger";
import type { ToolExecutionContext } from "@/app/types/socket";
import { getStorage } from "@/app/lib/storage";
import { streamText, stepCountIs, convertToModelMessages } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { validateAndExtractChatParams } from "./helpers/request-validator";
import { createModelFromConfig } from "./helpers/model-factory";
import { classifyError } from "./helpers/error-classifier";
import { buildReasoningParams } from "./helpers/reasoning-utils";
import { processImageAttachments } from "./helpers/image-utils";
import { generateUUID } from "@/app/lib/utils";

const logger = createLogger("Chat API");

function apiError(
  code: ErrorCode,
  message: string,
  status = 500,
  details?: Record<string, unknown>,
) {
  return NextResponse.json(
    {
      success: false,
      code,
      message,
      error: { code, message },
      ...(details ?? {}),
    },
    { status, statusText: message },
  );
}

export async function POST(req: NextRequest) {
  const abortController = new AbortController();
  const { signal: abortSignal } = abortController;
  const chatAbortControllers =
    global.chatAbortControllers ?? (global.chatAbortControllers = new Map());
  const cancelledChatRunIds =
    global.cancelledChatRunIds ?? (global.cancelledChatRunIds = new Map());
  let chatRunId: string | null = null;

  /**
   * 清理超过 5 分钟的已取消 chatRunId
   * 避免 Map 无限增长导致内存泄漏
   */
  const cleanupOldCancelledRunIds = () => {
    const now = Date.now();
    const FIVE_MINUTES = 5 * 60 * 1000;
    for (const [runId, timestamp] of cancelledChatRunIds.entries()) {
      if (now - timestamp > FIVE_MINUTES) {
        cancelledChatRunIds.delete(runId);
      }
    }
  };

  // 每次请求时清理旧条目
  cleanupOldCancelledRunIds();

  const abortListener = () => {
    logger.info("[Chat API] 客户端请求中断，停止流式响应");
    if (chatRunId) {
      cancelledChatRunIds.set(chatRunId, Date.now());
      const current = chatAbortControllers.get(chatRunId);
      if (current === abortController) {
        chatAbortControllers.delete(chatRunId);
      }
    }
    abortController.abort();
  };

  req.signal.addEventListener("abort", abortListener);

  try {
    const body = await req.json();
    const validation = validateAndExtractChatParams(body);
    if (!validation.ok) {
      return apiError(
        validation.error.code,
        validation.error.message,
        validation.error.status,
        validation.error.details,
      );
    }

    const {
      messages,
      rawConfig,
      projectUuid,
      conversationId,
      chatRunId: chatRunIdFromBody,
      paramSources,
    } = validation;

    const isServerEnvironment = typeof window === "undefined";

    const requestLogger = logger.withContext({
      projectUuid,
      conversationId,
      chatRunId: chatRunIdFromBody,
      ...paramSources,
    });

    chatRunId = chatRunIdFromBody ?? generateUUID("chat-run");
    chatAbortControllers.set(chatRunId, abortController);

    let conversation;
    if (isServerEnvironment) {
      // API 路由运行在 Node.js 服务器环境（无 window/indexedDB），跳过会话所有权校验
      requestLogger.info("服务器环境检测到，已跳过会话所有权校验", {
        environment: "server",
      });
    } else {
      try {
        const storage = await getStorage();
        conversation = await storage.getConversation(conversationId);
      } catch (storageError) {
        requestLogger.error("会话所有权校验失败（存储访问异常）", {
          error:
            storageError instanceof Error ? storageError.message : storageError,
        });
        return apiError(
          ErrorCodes.CHAT_SEND_FAILED,
          "Failed to validate conversation ownership",
          500,
          { source: "storage" },
        );
      }

      if (!conversation || conversation.project_uuid !== projectUuid) {
        requestLogger.warn("拒绝访问：会话不存在或不属于当前项目", {
          conversationProject: conversation?.project_uuid,
        });
        return apiError(
          ErrorCodes.CHAT_CONVERSATION_FORBIDDEN,
          "Unauthorized access to conversation",
          403,
          paramSources,
        );
      }
    }

    const toolContext: ToolExecutionContext = {
      projectUuid,
      conversationId,
      chatRunId,
      abortSignal,
    };

    const tools = createDrawioTools(toolContext);

    let normalizedConfig: LLMConfig;

    try {
      normalizedConfig = normalizeLLMConfig(
        rawConfig as Partial<LLMConfig> | null,
      );
    } catch {
      return apiError(
        ErrorCodes.CHAT_INVALID_CONFIG,
        "Invalid LLM configuration",
        400,
      );
    }

    const configAwareLogger = requestLogger.withContext({
      provider: normalizedConfig.providerType,
      model: normalizedConfig.modelName,
      maxRounds: normalizedConfig.maxToolRounds,
      projectUuid,
      conversationId,
      chatRunId,
    });

    // ==================== 图片消息处理（Milestone 3） ====================
    const imageResult = processImageAttachments(
      messages,
      normalizedConfig,
      configAwareLogger,
    );

    if (!imageResult.ok) {
      return apiError(
        imageResult.error.code,
        imageResult.error.message,
        imageResult.error.status,
      );
    }

    const modelMessages = convertToModelMessages(
      imageResult.processedMessages,
      {
        tools,
      },
    );

    configAwareLogger.info("收到请求", {
      messagesCount: modelMessages.length,
      imageCount: imageResult.allImageParts.length,
      capabilities: normalizedConfig.capabilities,
      enableToolsInThinking: normalizedConfig.enableToolsInThinking,
      paramSources,
    });

    const model = createModelFromConfig(normalizedConfig);

    const { experimentalParams } = buildReasoningParams(
      normalizedConfig,
      modelMessages,
      configAwareLogger,
    );

    const result = streamText({
      model,
      system: normalizedConfig.systemPrompt,
      messages: modelMessages,
      temperature: normalizedConfig.temperature,
      tools,
      stopWhen: stepCountIs(normalizedConfig.maxToolRounds),
      abortSignal,
      ...(experimentalParams && { experimental: experimentalParams }),
      onStepFinish: (step) => {
        configAwareLogger.debug("步骤完成", {
          toolCalls: step.toolCalls.length,
          textLength: step.text.length,
          reasoning: step.reasoning.length,
        });
      },
    });

    return result.toUIMessageStreamResponse({ sendReasoning: true });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      logger.info("[Chat API] 流式响应被用户中断");
      return apiError(
        ErrorCodes.CHAT_REQUEST_CANCELLED,
        "Request cancelled by user",
        499,
      );
    }

    logger.error("Chat API error", error);
    const err = error as Error;
    const classified = classifyError(err);

    return apiError(classified.code, classified.message, classified.statusCode);
  } finally {
    req.signal.removeEventListener("abort", abortListener);
    if (chatRunId) {
      const current = chatAbortControllers.get(chatRunId);
      if (current === abortController) {
        chatAbortControllers.delete(chatRunId);
      }
    }
  }
}
