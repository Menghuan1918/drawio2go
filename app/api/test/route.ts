import {
  normalizeLLMConfig,
  DEFAULT_ANTHROPIC_API_URL,
  DEFAULT_DEEPSEEK_API_URL,
  DEFAULT_OPENAI_API_URL,
} from "@/app/lib/config-utils";
import { LLMConfig } from "@/app/types/chat";
import { createOpenAI } from "@ai-sdk/openai";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { APICallError } from "@ai-sdk/provider";

const logger = createLogger("Test API");

export const runtime = "edge";

type TestErrorResponse = {
  success: false;
  error: string;
  statusCode: number;
};

function apiError(statusCode: number, error: string) {
  const safeStatusCode =
    Number.isFinite(statusCode) && statusCode >= 400 && statusCode <= 599
      ? statusCode
      : 500;

  return NextResponse.json<TestErrorResponse>(
    {
      success: false,
      error,
      statusCode: safeStatusCode,
    },
    { status: safeStatusCode, statusText: error },
  );
}

function truncateString(value: string, maxLength = 1200) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}…`;
}

function buildErrorMessage(error: unknown) {
  if (APICallError.isInstance(error)) {
    const parts: string[] = [];
    if (error.message) parts.push(error.message);

    const responseBody = error.responseBody?.trim();
    if (responseBody) {
      parts.push(truncateString(responseBody));
    } else if (error.data != null) {
      try {
        parts.push(truncateString(JSON.stringify(error.data)));
      } catch {
        // ignore stringify failure
      }
    }

    return parts.join(" | ") || "测试请求失败，请检查配置是否正确";
  }

  if (error instanceof Error && error.message) return error.message;
  return "测试请求失败，请检查配置是否正确";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const normalizedConfig: LLMConfig = normalizeLLMConfig({
      apiUrl: body?.apiUrl,
      apiKey: body?.apiKey,
      temperature: body?.temperature,
      modelName: body?.modelName,
      providerType: body?.providerType,
      maxToolRounds: body?.maxToolRounds,
    });

    if (!normalizedConfig.apiUrl || !normalizedConfig.modelName) {
      return apiError(400, "缺少必要的配置参数：apiUrl 和 modelName");
    }

    // 根据 providerType 选择合适的 provider
    let model;

    if (normalizedConfig.providerType === "openai-reasoning") {
      // OpenAI Reasoning 模型：使用原生 @ai-sdk/openai
      const openaiProvider = createOpenAI({
        baseURL: normalizedConfig.apiUrl || DEFAULT_OPENAI_API_URL,
        apiKey: normalizedConfig.apiKey || "dummy-key",
      });
      model = openaiProvider.chat(normalizedConfig.modelName);
    } else if (normalizedConfig.providerType === "deepseek-native") {
      // DeepSeek Native：使用 @ai-sdk/deepseek
      const deepseekProvider = createDeepSeek({
        baseURL: normalizedConfig.apiUrl || DEFAULT_DEEPSEEK_API_URL,
        apiKey: normalizedConfig.apiKey || "dummy-key",
      });
      model = deepseekProvider(normalizedConfig.modelName);
    } else if (normalizedConfig.providerType === "anthropic") {
      const anthropicProvider = createAnthropic({
        baseURL: normalizedConfig.apiUrl || DEFAULT_ANTHROPIC_API_URL,
        apiKey: normalizedConfig.apiKey || "",
      });
      model = anthropicProvider(normalizedConfig.modelName);
    } else {
      // OpenAI Compatible：使用 @ai-sdk/openai-compatible
      const compatibleProvider = createOpenAICompatible({
        name: normalizedConfig.providerType,
        baseURL: normalizedConfig.apiUrl || DEFAULT_OPENAI_API_URL,
        apiKey: normalizedConfig.apiKey || "dummy-key",
      });
      model = compatibleProvider(normalizedConfig.modelName);
    }

    const result = await generateText({
      model,
      messages: [
        {
          role: "system",
          content: "This is a test req, you only need to say word 'ok'",
        },
        {
          role: "user",
          content: "test",
        },
      ],
      temperature: normalizedConfig.temperature,
    });

    return NextResponse.json({
      success: true,
      response: result.text,
      provider: normalizedConfig.providerType,
    });
  } catch (error: unknown) {
    const statusCode = APICallError.isInstance(error)
      ? (error.statusCode ?? 500)
      : 500;
    const message = buildErrorMessage(error);

    logger.error("测试请求失败", {
      statusCode,
      error:
        error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : error,
    });

    return apiError(statusCode, message);
  }
}
