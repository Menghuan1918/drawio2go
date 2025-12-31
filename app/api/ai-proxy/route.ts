import { normalizeLLMConfig, isProviderType } from "@/app/lib/config-utils";
import {
  checkVisionSupport,
  convertImagePartsToFileUIParts,
  validateImageParts,
} from "@/app/lib/attachment-converter";
import {
  applyTemplateVariables,
  hasTemplateVariables,
} from "@/app/lib/prompt-template";
import type {
  ImagePart,
  LLMConfig,
  ModelCapabilities,
  ProviderType,
  SkillSettings,
} from "@/app/types/chat";
import { ErrorCodes, type ErrorCode } from "@/app/errors/error-codes";
import { createLogger } from "@/lib/logger";
import {
  streamText,
  stepCountIs,
  convertToModelMessages,
  tool,
  jsonSchema,
} from "ai";
import type { Tool, UIMessage } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { createModelFromConfig } from "@/lib/model-factory";
import { classifyError } from "@/lib/error-classifier";

const logger = createLogger("AI Proxy API");

const MAX_TOOLS_PAYLOAD_BYTES = 64 * 1024;

type IncomingTools = Record<
  string,
  { description?: string; inputJsonSchema: unknown }
>;

type AiProxyRequest = {
  messages: UIMessage[];
  config: AiProxyIncomingConfig;
  tools?: IncomingTools;
};

type AiProxyIncomingConfig = {
  providerType: string;
  modelName: string;
  apiUrl?: string;
  apiKey: string;
  systemPrompt?: string;
  temperature?: number;
  maxToolRounds?: number;
  capabilities?: ModelCapabilities;
  skillSettings?: SkillSettings;
  isCanvasContextEnabled?: boolean;
  isLayoutCheckEnabled?: boolean;
};

type AiProxyConfig = Omit<AiProxyIncomingConfig, "providerType"> & {
  providerType: ProviderType;
};

type AiProxyRequestParamsOk = {
  ok: true;
  messages: UIMessage[];
  rawConfig: AiProxyConfig;
  tools?: IncomingTools;
};

type AiProxyRequestParamsError = {
  ok: false;
  error: { code: ErrorCode; message: string; status: number };
};

type AiProxyRequestParamsResult =
  | AiProxyRequestParamsOk
  | AiProxyRequestParamsError;

type ParseToolsOk = { ok: true; tools?: IncomingTools };
type ParseToolsError = {
  ok: false;
  error: { code: ErrorCode; message: string; status: number };
};
type ParseToolsResult = ParseToolsOk | ParseToolsError;

type ConvertImagesOk = {
  ok: true;
  messages: UIMessage[];
  convertedImages: number;
};

type ConvertImagesError = {
  ok: false;
  error: { code: ErrorCode; message: string; status: number };
};

type ConvertImagesResult = ConvertImagesOk | ConvertImagesError;

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
    { status },
  );
}

function toToolSet(
  payload: IncomingTools | undefined,
): Record<string, Tool> | undefined {
  if (!payload) return undefined;

  const entries = Object.entries(payload);
  if (entries.length === 0) return undefined;

  const toolSet: Record<string, Tool> = {};

  for (const [name, def] of entries) {
    toolSet[name] = tool({
      description: def.description,
      inputSchema: jsonSchema(def.inputJsonSchema as never),
      // 注意：不要提供 execute，确保后端不执行工具
    });
  }

  return toolSet;
}

function parseToolsPayload(toolsRaw: unknown): ParseToolsResult {
  if (typeof toolsRaw === "undefined") return { ok: true, tools: undefined };

  if (
    typeof toolsRaw !== "object" ||
    toolsRaw === null ||
    Array.isArray(toolsRaw)
  ) {
    return {
      ok: false,
      error: {
        code: ErrorCodes.CHAT_INVALID_CONFIG,
        message: "Invalid tools format (expected object map)",
        status: 400,
      },
    };
  }

  let payloadBytes = 0;
  try {
    payloadBytes = new TextEncoder().encode(
      JSON.stringify(toolsRaw),
    ).byteLength;
  } catch {
    return {
      ok: false,
      error: {
        code: ErrorCodes.CHAT_INVALID_CONFIG,
        message: "Invalid tools payload (not JSON-serializable)",
        status: 400,
      },
    };
  }

  if (payloadBytes > MAX_TOOLS_PAYLOAD_BYTES) {
    return {
      ok: false,
      error: {
        code: ErrorCodes.CHAT_INVALID_CONFIG,
        message: `Tools schema payload too large (${payloadBytes} bytes, max ${MAX_TOOLS_PAYLOAD_BYTES})`,
        status: 413,
      },
    };
  }

  const toolMap = toolsRaw as Record<string, unknown>;
  for (const [name, value] of Object.entries(toolMap)) {
    if (!name.trim()) {
      return {
        ok: false,
        error: {
          code: ErrorCodes.CHAT_INVALID_CONFIG,
          message: "Invalid tool name (empty)",
          status: 400,
        },
      };
    }

    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return {
        ok: false,
        error: {
          code: ErrorCodes.CHAT_INVALID_CONFIG,
          message: `Invalid tool definition for: ${name}`,
          status: 400,
        },
      };
    }

    const def = value as Record<string, unknown>;
    const description = def.description;
    if (typeof description !== "undefined" && typeof description !== "string") {
      return {
        ok: false,
        error: {
          code: ErrorCodes.CHAT_INVALID_CONFIG,
          message: `Invalid tool description for: ${name}`,
          status: 400,
        },
      };
    }

    if (!("inputJsonSchema" in def)) {
      return {
        ok: false,
        error: {
          code: ErrorCodes.CHAT_INVALID_CONFIG,
          message: `Missing inputJsonSchema for tool: ${name}`,
          status: 400,
        },
      };
    }
  }

  return { ok: true, tools: toolMap as IncomingTools };
}

function validateRequest(body: unknown): AiProxyRequestParamsResult {
  const rawBody =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : undefined;

  const messages = rawBody?.messages as UIMessage[] | undefined;
  const config = rawBody?.config as AiProxyIncomingConfig | undefined;
  const toolsRaw = rawBody?.tools as unknown;

  if (!Array.isArray(messages) || !config) {
    return {
      ok: false,
      error: {
        code: ErrorCodes.CHAT_MISSING_PARAMS,
        message: "Missing required parameters: messages or config",
        status: 400,
      },
    };
  }

  const toolsResult = parseToolsPayload(toolsRaw);
  if (!toolsResult.ok) return toolsResult;

  const providerType = config.providerType;
  if (!isProviderType(providerType)) {
    return {
      ok: false,
      error: {
        code: ErrorCodes.CHAT_INVALID_CONFIG,
        message: "Invalid providerType",
        status: 400,
      },
    };
  }

  if (typeof config.modelName !== "string" || !config.modelName.trim()) {
    return {
      ok: false,
      error: {
        code: ErrorCodes.CHAT_INVALID_CONFIG,
        message: "Missing required config field: modelName",
        status: 400,
      },
    };
  }

  if (typeof config.apiKey !== "string" || !config.apiKey.trim()) {
    return {
      ok: false,
      error: {
        code: ErrorCodes.CHAT_INVALID_CONFIG,
        message: "Missing required config field: apiKey",
        status: 400,
      },
    };
  }

  return {
    ok: true,
    messages,
    rawConfig: { ...config, providerType },
    tools: toolsResult.tools,
  };
}

function isImagePart(value: unknown): value is ImagePart {
  if (typeof value !== "object" || value === null) return false;
  return (value as Record<string, unknown>).type === "image";
}

function convertImagePartsInMessages(
  messages: UIMessage[],
): ConvertImagesResult {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: true, messages, convertedImages: 0 };
  }

  let convertedImages = 0;
  const convertedMessages: UIMessage[] = [];

  for (const message of messages) {
    const parts = (message as unknown as { parts?: unknown }).parts;
    if (!Array.isArray(parts) || parts.length === 0) {
      convertedMessages.push(message);
      continue;
    }

    const imageParts = parts.filter(isImagePart);
    if (imageParts.length === 0) {
      convertedMessages.push(message);
      continue;
    }

    const validation = validateImageParts(imageParts);
    if (!validation.valid) {
      return {
        ok: false,
        error: {
          code: ErrorCodes.CHAT_INVALID_IMAGE,
          message: validation.error || "图片输入无效",
          status: 400,
        },
      };
    }

    try {
      const fileParts = convertImagePartsToFileUIParts(imageParts);

      let fileIndex = 0;
      const nextParts = parts.map((part) => {
        if (!isImagePart(part)) return part;
        const next = fileParts[fileIndex];
        fileIndex += 1;
        return next ?? part;
      });

      convertedImages += imageParts.length;
      convertedMessages.push({ ...message, parts: nextParts } as UIMessage);
    } catch (error: unknown) {
      const messageText =
        error instanceof Error && error.message
          ? error.message
          : "图片处理失败：无法解析图片内容。请重新上传图片或刷新后重试。";
      return {
        ok: false,
        error: {
          code: ErrorCodes.CHAT_INVALID_IMAGE,
          message: messageText,
          status: 400,
        },
      };
    }
  }

  return { ok: true, messages: convertedMessages, convertedImages };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AiProxyRequest;
    const validation = validateRequest(body);

    if (!validation.ok) {
      return apiError(
        validation.error.code,
        validation.error.message,
        validation.error.status,
      );
    }

    const normalizedConfig: LLMConfig = normalizeLLMConfig({
      providerType: validation.rawConfig.providerType,
      modelName: validation.rawConfig.modelName,
      apiUrl: validation.rawConfig.apiUrl,
      apiKey: validation.rawConfig.apiKey,
      systemPrompt: validation.rawConfig.systemPrompt,
      temperature: validation.rawConfig.temperature,
      maxToolRounds: validation.rawConfig.maxToolRounds,
      capabilities: validation.rawConfig.capabilities,
      skillSettings: validation.rawConfig.skillSettings,
    });

    const model = createModelFromConfig(normalizedConfig);
    const visionCheck = checkVisionSupport(
      validation.messages,
      normalizedConfig.capabilities.supportsVision,
    );
    if (visionCheck.shouldReject) {
      logger.info("拒绝图片请求：模型不支持 vision", {
        model: normalizedConfig.modelName,
        provider: normalizedConfig.providerType,
      });
      return apiError(
        ErrorCodes.CHAT_VISION_NOT_SUPPORTED,
        visionCheck.errorMessage ||
          "当前模型不支持视觉输入，无法处理图片消息。",
        400,
      );
    }

    const converted = convertImagePartsInMessages(validation.messages);
    if (!converted.ok) {
      logger.warn("图片转换失败", {
        model: normalizedConfig.modelName,
        provider: normalizedConfig.providerType,
        error: converted.error.message,
      });
      return apiError(
        converted.error.code,
        converted.error.message,
        converted.error.status,
      );
    }

    const modelMessages = await convertToModelMessages(converted.messages);
    const toolSet = toToolSet(validation.tools);

    let systemPrompt = normalizedConfig.systemPrompt;
    if (hasTemplateVariables(systemPrompt)) {
      if (normalizedConfig.skillSettings) {
        // 根据前端传入的 isCanvasContextEnabled 状态决定是否注入画布上下文指南
        // - 启用时：注入 CANVAS_CONTEXT_GUIDE，教导 LLM 如何理解画布上下文标签
        // - 禁用时：替换为空字符串，节省 token
        const isCanvasContextEnabled =
          validation.rawConfig.isCanvasContextEnabled ?? false;

        const isLayoutCheckEnabled =
          validation.rawConfig.isLayoutCheckEnabled ?? false;
        systemPrompt = applyTemplateVariables(
          systemPrompt,
          normalizedConfig.skillSettings,
          { isCanvasContextEnabled, isLayoutCheckEnabled },
        );
      } else {
        logger.warn("系统提示词包含模板变量，但未提供 skillSettings");
      }
    }

    logger.info("收到 AI 代理请求", {
      provider: normalizedConfig.providerType,
      model: normalizedConfig.modelName,
      messagesCount: modelMessages.length,
      convertedImages: converted.convertedImages,
      toolsCount: validation.tools ? Object.keys(validation.tools).length : 0,
    });

    const result = streamText({
      model,
      system: systemPrompt,
      messages: modelMessages,
      temperature: normalizedConfig.temperature,
      stopWhen: stepCountIs(normalizedConfig.maxToolRounds),
      tools: toolSet,
      abortSignal: req.signal,
    });

    return result.toUIMessageStreamResponse({ sendReasoning: true });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      logger.info("[AI Proxy API] 流式响应被用户中断");
      return apiError(
        ErrorCodes.CHAT_REQUEST_CANCELLED,
        "Request cancelled by user",
        499,
      );
    }

    logger.error("AI Proxy API error", error);
    const err = error as Error;
    const classified = classifyError(err);

    return apiError(classified.code, classified.message, classified.statusCode);
  }
}
