import { drawioTools } from '@/app/lib/drawio-ai-tools';
import { normalizeLLMConfig } from '@/app/lib/llm-config';
import { LLMConfig } from '@/app/types/chat';
import {
  streamText,
  stepCountIs,
  convertToModelMessages,
  type UIMessage,
} from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { NextRequest, NextResponse } from 'next/server';

const isDev = process.env.NODE_ENV === 'development';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages = body?.messages as UIMessage[] | undefined;
    const rawConfig = body?.llmConfig;

    if (!Array.isArray(messages) || !rawConfig) {
      return NextResponse.json(
        { error: '缺少必要参数：messages 或 llmConfig' },
        { status: 400 }
      );
    }

    const modelMessages = convertToModelMessages(messages, {
      tools: drawioTools,
    });

    let normalizedConfig: LLMConfig;

    try {
      normalizedConfig = normalizeLLMConfig(rawConfig);
    } catch (error) {
      return NextResponse.json(
        { error: (error as Error)?.message || 'LLM 配置无效' },
        { status: 400 }
      );
    }

    if (normalizedConfig.providerType === 'anthropic') {
      return NextResponse.json(
        { error: 'Anthropic 供应商暂未实现' },
        { status: 400 }
      );
    }

    if (isDev) {
      console.log('[Chat API] 收到请求:', {
        messagesCount: modelMessages.length,
        provider: normalizedConfig.providerType,
        model: normalizedConfig.modelName,
        maxRounds: normalizedConfig.maxToolRounds,
      });
    }

    const openaiProvider = createOpenAI({
      baseURL: normalizedConfig.apiUrl,
      apiKey: normalizedConfig.apiKey || 'dummy-key',
      name: normalizedConfig.providerType === 'deepseek' ? 'deepseek' : undefined,
    });

    const model = normalizedConfig.providerType === 'openai-response'
      ? openaiProvider(normalizedConfig.modelName)
      : openaiProvider.chat(normalizedConfig.modelName);

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

        console.log('[Chat API] 步骤完成:', {
          toolCalls: step.toolCalls.length,
          textLength: step.text.length,
          reasoning: step.reasoning.length,
        });
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error: any) {
    console.error('聊天 API 错误:', error);

    let errorMessage = '服务器内部错误';
    let statusCode = 500;

    if (error.message?.includes('Anthropic')) {
      errorMessage = error.message;
      statusCode = 400;
    } else if (error.message?.includes('API key')) {
      errorMessage = 'API 密钥无效或缺失';
      statusCode = 401;
    } else if (error.message?.includes('model')) {
      errorMessage = '模型不存在或不可用';
      statusCode = 400;
    } else if (error.message?.includes('配置参数')) {
      errorMessage = error.message;
      statusCode = 400;
    } else if (error.message) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
  }
}
