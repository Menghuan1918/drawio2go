import { drawioTools } from "@/app/lib/drawio-ai-tools";
import { normalizeLLMConfig } from "@/app/lib/config-utils";
import { LLMConfig } from "@/app/types/chat";
import { ErrorCodes, type ErrorCode } from "@/app/errors/error-codes";
import {
  streamText,
  stepCountIs,
  convertToModelMessages,
  type UIMessage,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { NextRequest, NextResponse } from "next/server";

const isDev = process.env.NODE_ENV === "development";

function apiError(code: ErrorCode, message: string, status = 500) {
  return NextResponse.json({ code, message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages = body?.messages as UIMessage[] | undefined;
    const rawConfig = body?.llmConfig;

    if (!Array.isArray(messages) || !rawConfig) {
      return apiError(
        ErrorCodes.CHAT_MISSING_PARAMS,
        "Missing required parameters: messages or llmConfig",
        400,
      );
    }

    const modelMessages = convertToModelMessages(messages, {
      tools: drawioTools,
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

    if (isDev) {
      console.log("[Chat API] 收到请求:", {
        messagesCount: modelMessages.length,
        provider: normalizedConfig.providerType,
        model: normalizedConfig.modelName,
        maxRounds: normalizedConfig.maxToolRounds,
      });
    }

    // 根据 providerType 选择合适的 provider
    let model;

    if (normalizedConfig.providerType === "openai-reasoning") {
      // OpenAI Reasoning 模型：使用原生 @ai-sdk/openai
      const openaiProvider = createOpenAI({
        baseURL: normalizedConfig.apiUrl,
        apiKey: normalizedConfig.apiKey || "dummy-key",
      });
      model = openaiProvider.chat(normalizedConfig.modelName);
    } else {
      // OpenAI Compatible 和 DeepSeek：使用 @ai-sdk/openai-compatible
      const compatibleProvider = createOpenAICompatible({
        name: normalizedConfig.providerType,
        baseURL: normalizedConfig.apiUrl,
        apiKey: normalizedConfig.apiKey || "dummy-key",
      });
      model = compatibleProvider(normalizedConfig.modelName);
    }

    const result = streamText({
      model,
      system: normalizedConfig.systemPrompt,
      messages: modelMessages,
      temperature: normalizedConfig.temperature,
      tools: drawioTools,
      stopWhen: stepCountIs(normalizedConfig.maxToolRounds),
      onStepFinish: (step) => {
        if (!isDev) {
          return;
        }

        console.log("[Chat API] 步骤完成:", {
          toolCalls: step.toolCalls.length,
          textLength: step.text.length,
          reasoning: step.reasoning.length,
        });
      },
    });

    return result.toUIMessageStreamResponse({ sendReasoning: true });
  } catch (error: unknown) {
    console.error("Chat API error:", error);

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
  }
}
