# 里程碑 3：聊天 API 核心逻辑

**状态**：✅ 已完成
**预计耗时**：90 分钟
**依赖**：里程碑 1, 2

## 目标

实现支持 agentic loop 的流式聊天 API，集成 Socket.IO 工具执行系统

## 任务清单

### 1. 创建 API 路由文件

- [x] 创建 `app/api/chat/route.ts`
- [x] 注意：**不使用 Edge Runtime**，因为需要支持 Socket.IO 服务器集成
  ```typescript
  // 移除 export const runtime = 'edge';
  // Socket.IO 需要完整的 Node.js 环境
  ```

### 2. 添加必要的导入

- [x] 添加导入语句：
  ```typescript
  import { drawioTools } from "@/app/lib/drawio-ai-tools";
  import { normalizeLLMConfig } from "@/app/lib/llm-config";
  import { LLMConfig } from "@/app/types/chat";
  import {
    streamText,
    stepCountIs,
    convertToModelMessages,
    type UIMessage,
  } from "ai";
  import { createOpenAI } from "@ai-sdk/openai";
  import { NextRequest, NextResponse } from "next/server";
  ```

### 3. 配置验证和标准化

- [x] 使用统一的配置处理逻辑：

  ```typescript
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

      let normalizedConfig: LLMConfig;
      try {
        normalizedConfig = normalizeLLMConfig(rawConfig);
      } catch (error) {
        return NextResponse.json(
          { error: (error as Error)?.message || 'LLM 配置无效' },
          { status: 400 }
        );
      }
  ```

### 4. 消息格式转换

- [x] 使用 AI SDK 的消息转换功能：
  ```typescript
  const modelMessages = convertToModelMessages(messages, {
    tools: drawioTools,
  });
  ```

### 5. 开发环境日志

- [x] 添加详细的调试日志：

  ```typescript
  const isDev = process.env.NODE_ENV === "development";

  if (isDev) {
    console.log("[Chat API] 收到请求:", {
      messagesCount: modelMessages.length,
      provider: normalizedConfig.providerType,
      model: normalizedConfig.modelName,
      maxRounds: normalizedConfig.maxToolRounds,
    });
  }
  ```

### 6. 实现动态 Provider 选择与路由

- [x] 根据 `providerType` 选择对应的 Provider 和调用方式：

  ```typescript
  if (normalizedConfig.providerType === "anthropic") {
    return NextResponse.json(
      { error: "Anthropic 供应商暂未实现" },
      { status: 400 },
    );
  }

  const openaiProvider = createOpenAI({
    baseURL: normalizedConfig.apiUrl,
    apiKey: normalizedConfig.apiKey || "dummy-key",
    name: normalizedConfig.providerType === "deepseek" ? "deepseek" : undefined,
  });

  const model =
    normalizedConfig.providerType === "openai-response"
      ? openaiProvider(normalizedConfig.modelName)
      : openaiProvider.chat(normalizedConfig.modelName);
  ```

**技术说明**：

- **openai (.chat)**：调用传统的 `/v1/chat/completions` 端点，对应 OpenAI Chat API
- **openai-response**：使用 AI SDK 5 的 Responses API，支持更多功能
- **deepseek**：使用 DeepSeek API，通过 OpenAI 兼容接口调用

### 7. 实现 Agent Loop

- [x] 调用 streamText API：

  ```typescript
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

  return result.toUIMessageStreamResponse();
  ```

### 8. Socket.IO 集成支持

- [x] 确保工具执行通过 Socket.IO 完成：
  - 工具定义使用 `executeToolOnClient`
  - Socket.IO 服务器在 `server.js` 中初始化
  - 前端 Hook `useDrawioSocket` 处理工具执行

### 9. 完善错误处理

- [x] 捕获并返回友好的错误消息：

  ```typescript
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
  ```

## 完整代码结构

```typescript
import { drawioTools } from "@/app/lib/drawio-ai-tools";
import { normalizeLLMConfig } from "@/app/lib/llm-config";
import { LLMConfig } from "@/app/types/chat";
import {
  streamText,
  stepCountIs,
  convertToModelMessages,
  type UIMessage,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { NextRequest, NextResponse } from "next/server";

const isDev = process.env.NODE_ENV === "development";

export async function POST(req: NextRequest) {
  try {
    // 1. 解析和验证请求
    // 2. 标准化配置
    // 3. 转换消息格式
    // 4. 选择 Provider 并创建模型
    // 5. 调用 streamText with Socket.IO tools
    // 6. 返回流式响应
  } catch (error) {
    // 错误处理和分类
  }
}
```

## 验收标准

- [x] API 路由能正确处理 POST 请求
- [x] 能正确解析 messages 和 llmConfig
- [x] 使用 `normalizeLLMConfig` 标准化配置
- [x] 使用 `convertToModelMessages` 转换消息格式
- [x] `providerType = 'openai'` 时使用 .chat() 方法
- [x] `providerType = 'openai-response'` 时使用默认方法
- [x] 不支持的 providerType 能正确抛出错误
- [x] 工具调用通过 Socket.IO 正确执行
- [x] 达到 `maxToolRounds` 限制时停止
- [x] 使用 `toUIMessageStreamResponse()` 返回流式响应
- [x] 开发环境有详细日志输出
- [x] 错误能被正确分类和返回
- [x] 无 TypeScript 编译错误
- [x] **不使用 Edge Runtime**（支持 Socket.IO）

## 测试步骤

1. 启动服务器（包含 Socket.IO）：

   ```bash
   pnpm run dev
   ```

2. 使用浏览器测试聊天功能（需要 Socket.IO 连接）

3. 测试不同的 providerType：
   - `"providerType": "openai"` - 使用 Chat API
   - `"providerType": "openai-response"` - 使用 Responses API
   - `"providerType": "deepseek"` - 使用 DeepSeek

4. 检查响应是否为流式格式
5. 查看服务器日志确认步骤完成事件
6. 验证 Socket.IO 工具调用流程

## 实际增强功能

- ✅ **统一配置管理**：使用 `normalizeLLMConfig` 标准化配置
- ✅ **消息格式转换**：使用 `convertToModelMessages` 处理 AI SDK 消息格式
- ✅ **Socket.IO 集成**：工具执行通过实时双向通信完成
- ✅ **详细日志系统**：开发环境下的完整调试信息
- ✅ **错误分类处理**：针对不同错误类型的专门处理
- ✅ **非 Edge Runtime**：支持 Socket.IO 服务器集成

## 注意事项

- **非 Edge Runtime**：Socket.IO 需要完整的 Node.js 环境，不能使用 Edge Runtime
- **API Key**：如果为空，使用 `'dummy-key'` 占位符
- **错误处理**：确保所有错误都被捕获并返回 JSON 格式
- **调试日志**：生产环境可移除 `onStepFinish` 回调
- **Socket.IO 依赖**：确保 `server.js` 正确启动并初始化 Socket.IO
- **工具执行**：所有工具通过 `executeToolOnClient` 在前端执行

## 常见问题

**Q: 为什么不使用 Edge Runtime？**
A: Socket.IO 需要完整的 Node.js 环境，Edge Runtime 不支持 WebSocket 连接。

**Q: Socket.IO 工具执行流程是怎样的？**
A: API 路由 → 工具执行器 → Socket.IO 服务器 → 前端 Hook → 实际工具函数 → 结果返回

**Q: streamText 返回什么？**
A: 返回一个包含 `toUIMessageStreamResponse()` 方法的对象，支持工具调用和 UI 消息流。

**Q: maxSteps 和 maxToolRounds 的关系？**
A: `stepCountIs(normalizedConfig.maxToolRounds)` 控制最大工具调用轮次。

**Q: 如果工具执行失败会怎样？**
A: Socket.IO 返回错误信息，AI SDK 将错误作为工具结果返回给模型。

**Q: openai 和 openai-response 有什么区别？**
A:

- `openai`: 使用 `.chat()` 方法，调用传统 Chat Completions API
- `openai-response`: 使用 AI SDK 5 默认的 Responses API，功能更丰富

**Q: 如何调试 Socket.IO 工具调用？**
A: 查看浏览器控制台和服务器日志，确认 Socket.IO 连接状态和消息传递。

---

**下一步**：完成后继续 [里程碑 4：聊天 UI 集成](./milestone-4.md)
