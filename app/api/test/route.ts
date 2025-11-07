import { normalizeLLMConfig } from "@/app/lib/config-utils";
import { LLMConfig } from "@/app/types/chat";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

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
      return NextResponse.json(
        { error: "缺少必要的配置参数：apiUrl 和 modelName" },
        { status: 400 },
      );
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
    console.error("测试请求失败:", error);
    return NextResponse.json(
      {
        success: false,
        error: (error as Error)?.message || "测试请求失败，请检查配置是否正确",
      },
      { status: 500 },
    );
  }
}
