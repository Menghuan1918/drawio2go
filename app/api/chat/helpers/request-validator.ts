import { ErrorCodes, type ErrorCode } from "@/app/errors/error-codes";
import type { UIMessage } from "ai";

type ChatParamSources = {
  conversationIdSource: "body";
  projectUuidSource: "body" | "missing";
};

type ChatParamsOk = {
  ok: true;
  messages: UIMessage[];
  rawConfig: unknown;
  projectUuid: string;
  conversationId: string;
  chatRunId?: string;
  paramSources: ChatParamSources;
};

type ChatParamsError = {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
    status: number;
    details?: Record<string, unknown>;
  };
};

export type ChatParamsValidationResult = ChatParamsOk | ChatParamsError;

export function validateAndExtractChatParams(
  body: unknown,
): ChatParamsValidationResult {
  const rawBody =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : undefined;

  const messages = rawBody?.messages as UIMessage[] | undefined;
  const rawConfig = rawBody?.llmConfig;

  const projectUuidRaw = rawBody?.projectUuid;
  const projectUuid =
    typeof projectUuidRaw === "string" && projectUuidRaw.trim().length > 0
      ? projectUuidRaw.trim()
      : "";

  const conversationIdRaw = rawBody?.conversationId;
  const conversationId =
    typeof conversationIdRaw === "string" && conversationIdRaw.trim().length > 0
      ? conversationIdRaw.trim()
      : "";

  const chatRunIdRaw = rawBody?.chatRunId;
  const chatRunId =
    typeof chatRunIdRaw === "string" && chatRunIdRaw.trim().length > 0
      ? chatRunIdRaw.trim()
      : undefined;

  if (!Array.isArray(messages) || !rawConfig) {
    return {
      ok: false,
      error: {
        code: ErrorCodes.CHAT_MISSING_PARAMS,
        message: "Missing required parameters: messages or llmConfig",
        status: 400,
      },
    };
  }

  if (!projectUuid) {
    return {
      ok: false,
      error: {
        code: ErrorCodes.CHAT_MISSING_PARAMS,
        message: "Missing required parameter: projectUuid",
        status: 400,
      },
    };
  }

  if (!conversationId) {
    return {
      ok: false,
      error: {
        code: ErrorCodes.CHAT_MISSING_PARAMS,
        message: "Missing conversationId in request body",
        status: 400,
        details: {
          conversationIdSource: "body",
        },
      },
    };
  }

  const paramSources: ChatParamSources = {
    conversationIdSource: "body",
    projectUuidSource: projectUuid ? "body" : "missing",
  };

  return {
    ok: true,
    messages,
    rawConfig,
    projectUuid,
    conversationId,
    chatRunId,
    paramSources,
  };
}
