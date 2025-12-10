import { createDrawioTools } from "@/app/lib/drawio-ai-tools";
import { normalizeLLMConfig } from "@/app/lib/config-utils";
import { LLMConfig } from "@/app/types/chat";
import { ErrorCodes, type ErrorCode } from "@/app/errors/error-codes";
import { createLogger } from "@/lib/logger";
import type { ToolExecutionContext } from "@/app/types/socket";
import { getStorage } from "@/app/lib/storage";
import {
  streamText,
  stepCountIs,
  convertToModelMessages,
  type ModelMessage,
  type UIMessage,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { NextRequest, NextResponse } from "next/server";

const logger = createLogger("Chat API");

function extractRecentReasoning(messages: ModelMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "assistant") {
      continue;
    }

    const { content } = message;
    if (!Array.isArray(content)) {
      return undefined;
    }

    const reasoningText = content
      .filter((part) => part.type === "reasoning")
      .map((part) => part.text ?? "")
      .join("")
      .trim();

    return reasoningText || undefined;
  }

  return undefined;
}

function isNewUserQuestion(messages: ModelMessage[]): boolean {
  if (messages.length === 0) {
    return false;
  }

  const lastMessage = messages[messages.length - 1];
  return lastMessage.role === "user";
}

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

  const abortListener = () => {
    logger.info("[Chat API] 客户端请求中断，停止流式响应");
    abortController.abort();
  };

  req.signal.addEventListener("abort", abortListener);

  try {
    const body = await req.json();
    const messages = body?.messages as UIMessage[] | undefined;
    const rawConfig = body?.llmConfig;
    const bodyProjectUuid =
      typeof body?.projectUuid === "string" &&
      body.projectUuid.trim().length > 0
        ? body.projectUuid.trim()
        : "";
    const headerProjectUuid =
      typeof req.headers.get("x-project-uuid") === "string"
        ? (req.headers.get("x-project-uuid")?.trim() ?? "")
        : "";
    const projectUuid = bodyProjectUuid;
    const conversationId =
      typeof body?.conversationId === "string" &&
      body.conversationId.trim().length > 0
        ? body.conversationId.trim()
        : "";

    if (!Array.isArray(messages) || !rawConfig) {
      return apiError(
        ErrorCodes.CHAT_MISSING_PARAMS,
        "Missing required parameters: messages or llmConfig",
        400,
      );
    }

    if (!projectUuid) {
      return apiError(
        ErrorCodes.CHAT_MISSING_PARAMS,
        "Missing required parameter: projectUuid",
        400,
      );
    }

    if (!conversationId) {
      return apiError(
        ErrorCodes.CHAT_MISSING_PARAMS,
        "Missing conversationId in request body",
        400,
        {
          conversationIdSource: "body",
        },
      );
    }

    const paramSources = {
      conversationIdSource: "body",
      projectUuidSource: bodyProjectUuid
        ? "body"
        : headerProjectUuid
          ? "header"
          : "missing",
    };

    const isServerEnvironment = typeof window === "undefined";

    const requestLogger = logger.withContext({
      projectUuid,
      conversationId,
      ...paramSources,
    });

    if (headerProjectUuid && headerProjectUuid !== projectUuid) {
      requestLogger.warn("拒绝访问：projectUuid 不一致", {
        bodyProjectUuid,
        headerProjectUuid,
      });
      return apiError(
        ErrorCodes.CHAT_CONVERSATION_FORBIDDEN,
        "Project UUID mismatch between body and header",
        403,
        paramSources,
      );
    }

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
    };

    const tools = createDrawioTools(toolContext);

    const modelMessages = convertToModelMessages(messages, {
      tools,
    });

    let normalizedConfig: LLMConfig;

    try {
      normalizedConfig = normalizeLLMConfig(rawConfig);
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
    });

    configAwareLogger.info("收到请求", {
      messagesCount: modelMessages.length,
      capabilities: normalizedConfig.capabilities,
      enableToolsInThinking: normalizedConfig.enableToolsInThinking,
      paramSources,
    });

    // 根据 providerType 选择合适的 provider
    let model;

    if (normalizedConfig.providerType === "openai-reasoning") {
      // OpenAI Reasoning 模型：使用原生 @ai-sdk/openai
      const openaiProvider = createOpenAI({
        baseURL: normalizedConfig.apiUrl,
        apiKey: normalizedConfig.apiKey || "dummy-key",
      });
      model = openaiProvider.chat(normalizedConfig.modelName);
    } else if (normalizedConfig.providerType === "deepseek-native") {
      // DeepSeek Native：使用 @ai-sdk/deepseek
      const deepseekProvider = createDeepSeek({
        baseURL: normalizedConfig.apiUrl,
        apiKey: normalizedConfig.apiKey || "dummy-key",
      });
      // deepseekProvider 直接返回模型调用函数（无需 .chat）
      model = deepseekProvider(normalizedConfig.modelName);
    } else {
      // OpenAI Compatible：使用 @ai-sdk/openai-compatible
      const compatibleProvider = createOpenAICompatible({
        name: normalizedConfig.providerType,
        baseURL: normalizedConfig.apiUrl,
        apiKey: normalizedConfig.apiKey || "dummy-key",
      });
      model = compatibleProvider(normalizedConfig.modelName);
    }

    let experimentalParams: Record<string, unknown> | undefined;
    let reasoningContent: string | undefined;

    try {
      if (
        normalizedConfig.enableToolsInThinking &&
        normalizedConfig.capabilities?.supportsThinking
      ) {
        const isNewQuestion = isNewUserQuestion(modelMessages);

        if (!isNewQuestion) {
          reasoningContent = extractRecentReasoning(modelMessages);

          if (reasoningContent) {
            experimentalParams = { reasoning_content: reasoningContent };

            configAwareLogger.debug("复用 reasoning_content", {
              length: reasoningContent.length,
            });
          } else {
            configAwareLogger.debug("无可复用的 reasoning_content");
          }
        } else {
          configAwareLogger.debug("新用户问题，跳过 reasoning_content 复用");
        }
      }
    } catch (reasoningError) {
      configAwareLogger.error("构建 reasoning_content 失败，已降级为普通模式", {
        error:
          reasoningError instanceof Error
            ? reasoningError.message
            : reasoningError,
        stack:
          reasoningError instanceof Error ? reasoningError.stack : undefined,
      });
    }

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

    let statusCode = 500;
    let code: ErrorCode = ErrorCodes.CHAT_SEND_FAILED;
    let message = "Failed to send request";

    const err = error as Error;
    if (err.message?.includes("Anthropic")) {
      message = err.message;
      statusCode = 400;
    } else if (err.message?.includes("API key")) {
      code = ErrorCodes.CHAT_API_KEY_INVALID;
      message = "API key is missing or invalid";
      statusCode = 401;
    } else if (err.message?.includes("model")) {
      code = ErrorCodes.CHAT_MODEL_NOT_FOUND;
      message = "Model does not exist or is unavailable";
      statusCode = 400;
    } else if (err.message?.includes("配置参数")) {
      code = ErrorCodes.CHAT_INVALID_CONFIG;
      message = "Invalid LLM configuration";
      statusCode = 400;
    } else if (err.message) {
      message = err.message;
    }

    return apiError(code, message, statusCode);
  } finally {
    req.signal.removeEventListener("abort", abortListener);
  }
}
