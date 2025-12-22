import {
  normalizeLLMConfig,
  DEFAULT_ANTHROPIC_API_URL,
  DEFAULT_DEEPSEEK_API_URL,
  DEFAULT_GEMINI_API_URL,
  DEFAULT_OPENAI_API_URL,
} from "@/app/lib/config-utils";
import { LLMConfig } from "@/app/types/chat";
import { createOpenAI } from "@ai-sdk/openai";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, jsonSchema, tool } from "ai";
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

    return parts.join(" | ") || "models.test.requestFailed";
  }

  if (error instanceof Error && error.message) return error.message;
  return "models.test.requestFailed";
}

function isFunctionCallUnsupportedError(error: unknown) {
  if (!APICallError.isInstance(error)) return false;

  const message = buildErrorMessage(error).toLowerCase();
  return (
    message.includes("tool_choice") ||
    message.includes("tool choice") ||
    message.includes("tools are not supported") ||
    message.includes("tool is not supported") ||
    message.includes("does not support tools") ||
    message.includes("function calling") ||
    message.includes("functions are not supported") ||
    message.includes("does not support functions") ||
    message.includes("unsupported tool") ||
    message.includes("unsupported tools")
  );
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
      return apiError(400, "models.test.missingConfig");
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
    } else if (normalizedConfig.providerType === "gemini") {
      const geminiProvider = createGoogleGenerativeAI({
        baseURL: normalizedConfig.apiUrl || DEFAULT_GEMINI_API_URL,
        apiKey: normalizedConfig.apiKey || "dummy-key",
      });
      model = geminiProvider(normalizedConfig.modelName);
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

    const result = await (async () => {
      try {
        return await generateText({
          model,
          tools: {
            test: tool({
              description: "Test connectivity and tool-calling capability.",
              inputSchema: jsonSchema({
                type: "object",
                properties: {},
                additionalProperties: false,
              }),
              execute: async () => ({ ok: true }),
            }),
          },
          toolChoice: { type: "tool", toolName: "test" },
          messages: [
            {
              role: "system",
              content: "This is a test request. You MUST call the `test` tool.",
            },
            { role: "user", content: "Run test tool now." },
          ],
          temperature: normalizedConfig.temperature,
        });
      } catch (error: unknown) {
        if (isFunctionCallUnsupportedError(error)) {
          return NextResponse.json(
            {
              success: false,
              error: "models.test.functionCallUnsupported",
              provider: normalizedConfig.providerType,
            },
            { status: 200 },
          );
        }
        throw error;
      }
    })();

    if (result instanceof NextResponse) return result;

    const toolCall = result.toolCalls.find(
      (call) => call.type === "tool-call" && call.toolName === "test",
    );
    const toolResult = result.toolResults.find(
      (item) => item.type === "tool-result" && item.toolName === "test",
    );

    const ok =
      Boolean(toolCall) &&
      Boolean(toolResult) &&
      (toolResult as { output?: unknown }).output != null &&
      (toolResult as { output?: { ok?: boolean } }).output?.ok === true;

    if (!ok) {
      return NextResponse.json(
        {
          success: false,
          error: "models.test.toolCallFailed",
          provider: normalizedConfig.providerType,
        },
        { status: 200 },
      );
    }

    return NextResponse.json({
      success: true,
      response: JSON.stringify((toolResult as { output?: unknown }).output),
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
