# API 模块

> 本文档是 `app/api/` 的 AI 代理指南，详细说明 API 端点的实现与使用规范。

## 目录概览

```
app/api/
├── AGENTS.md           # 本文档
├── chat/
│   └── route.ts        # 聊天 API（流式响应 + 工具调用）
└── test/
    └── route.ts        # 连接测试 API
```

## 端点列表

| 端点        | 方法 | 功能                       | 运行时  |
| ----------- | ---- | -------------------------- | ------- |
| `/api/chat` | POST | 流式聊天 + DrawIO 工具调用 | Node.js |
| `/api/test` | POST | LLM 配置连接测试           | Edge    |

---

## 核心实现

### `/api/chat` - 聊天端点

**文件**: `/home/aaa/Code/drawio2go/app/api/chat/route.ts`

#### 功能描述

基于 Vercel AI SDK 的流式聊天 API，集成 DrawIO XML 操作工具，支持多轮工具调用循环。

#### 请求格式

```typescript
interface ChatRequest {
  messages: UIMessage[]; // @ai-sdk/react 的 UIMessage 类型
  llmConfig: {
    apiUrl: string; // API 端点 URL（自动添加 /v1）
    apiKey: string; // API 密钥
    temperature: number; // 温度参数（默认 0.3）
    modelName: string; // 模型名称（如 deepseek-chat）
    systemPrompt: string; // 系统提示词
    providerType: ProviderType; // 见下方类型定义
    maxToolRounds: number; // 最大工具调用轮次（默认 5）
  };
}

type ProviderType = "openai-reasoning" | "openai-compatible" | "deepseek";
```

#### 响应格式

- 返回 `UIMessageStreamResponse`（Vercel AI SDK 标准流式响应）
- 包含推理过程（`sendReasoning: true`）

#### 处理流程

```
1. 解析请求 → 验证 messages + llmConfig
2. 规范化配置 → normalizeLLMConfig()
3. 转换消息 → convertToModelMessages()
4. 创建 Provider → 根据 providerType 选择
5. 执行流式生成 → streamText() + drawioTools
6. 返回流响应 → toUIMessageStreamResponse()
```

#### Provider 选择逻辑

```typescript
if (providerType === "openai-reasoning") {
  // OpenAI 原生推理模型（o1/o3 系列）
  // 使用 @ai-sdk/openai
  model = createOpenAI({...}).chat(modelName);
} else {
  // OpenAI Compatible / DeepSeek
  // 使用 @ai-sdk/openai-compatible
  model = createOpenAICompatible({...})(modelName);
}
```

#### 错误处理

| 状态码 | 场景                             |
| ------ | -------------------------------- |
| 400    | 缺少参数 / 配置无效 / 模型不存在 |
| 401    | API 密钥无效                     |
| 500    | 服务器内部错误                   |

---

### `/api/test` - 连接测试端点

**文件**: `/home/aaa/Code/drawio2go/app/api/test/route.ts`

#### 功能描述

轻量级 LLM 配置验证端点，用于测试 API 连接是否正常。

#### 运行时

- `export const runtime = "edge"` - 使用 Edge Runtime 提升响应速度

#### 请求格式

```typescript
interface TestRequest {
  apiUrl: string;
  apiKey: string;
  temperature?: number;
  modelName: string;
  providerType?: ProviderType;
  maxToolRounds?: number;
}
```

#### 响应格式

```typescript
// 成功
{ success: true, response: string, provider: ProviderType }

// 失败
{ success: false, error: string }
```

#### 测试逻辑

向 LLM 发送固定的简单请求（要求返回 "ok"），验证配置是否有效。

---

## AI 工具集成

### DrawIO 工具定义

**来源**: `/home/aaa/Code/drawio2go/app/lib/drawio-ai-tools.ts`

```typescript
export const drawioTools = {
  drawio_read: drawioReadTool, // XPath 读取 XML
  drawio_edit_batch: drawioEditBatchTool, // 原子化批量编辑
  drawio_overwrite: drawioOverwriteTool, // 完整覆写 XML
};
```

### 工具详情

| 工具名              | 功能                           | 执行位置 |
| ------------------- | ------------------------------ | -------- |
| `drawio_read`       | XPath 查询 DrawIO XML          | 后端     |
| `drawio_edit_batch` | 批量 XPath 编辑（原子性回滚）  | 后端     |
| `drawio_overwrite`  | 完整替换 XML（通过 Socket.IO） | 前端     |

### 工具调用流程

```
AI 决定调用工具
    ↓
streamText() 检测 toolCalls
    ↓
execute() 执行工具逻辑
    ├── drawio_read/edit_batch → 后端 XML 操作
    └── drawio_overwrite → Socket.IO 转发前端
    ↓
返回结果到 AI
    ↓
继续对话循环（最多 maxToolRounds 轮）
```

### 停止条件

```typescript
stopWhen: stepCountIs(normalizedConfig.maxToolRounds);
```

当工具调用轮次达到 `maxToolRounds`（默认 5）时自动停止。

---

## 类型定义

**来源**: `/home/aaa/Code/drawio2go/app/types/chat.ts`

### LLMConfig

```typescript
export interface LLMConfig {
  apiUrl: string; // API 端点（自动规范化）
  apiKey: string; // API 密钥
  temperature: number; // 温度（0-1）
  modelName: string; // 模型标识
  systemPrompt: string; // 系统提示词
  providerType: ProviderType; // 提供者类型
  maxToolRounds: number; // 最大工具轮次
}
```

### ProviderType

```typescript
type ProviderType =
  | "openai-reasoning" // OpenAI o1/o3 推理模型
  | "openai-compatible" // OpenAI 兼容接口（LM Studio 等）
  | "deepseek"; // DeepSeek API
```

---

## 配置工具

**来源**: `/home/aaa/Code/drawio2go/app/lib/config-utils.ts`

### 默认配置

```typescript
export const DEFAULT_LLM_CONFIG: LLMConfig = {
  apiUrl: "https://api.deepseek.com/v1",
  apiKey: "",
  temperature: 0.3,
  modelName: "deepseek-chat",
  systemPrompt: DEFAULT_SYSTEM_PROMPT, // DrawIO 专用提示词
  providerType: "openai-compatible",
  maxToolRounds: 5,
};
```

### URL 规范化

```typescript
normalizeApiUrl(url: string): string
// - 移除尾部斜杠
// - 自动添加 /v1（如无版本号）
```

### 配置规范化

```typescript
normalizeLLMConfig(config?: Partial<LLMConfig>): LLMConfig
// - 应用默认值
// - 验证类型
// - 标准化格式
```

---

## 开发要点

### 1. 依赖包

```typescript
// Vercel AI SDK
import { streamText, stepCountIs, convertToModelMessages } from "ai";
import type { UIMessage } from "ai";

// AI Provider
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

// Next.js
import { NextRequest, NextResponse } from "next/server";
```

### 2. 调试日志

开发环境（`NODE_ENV === "development"`）自动启用日志：

```typescript
console.log("[Chat API] 收到请求:", {...});
console.log("[Chat API] 步骤完成:", {...});
```

### 3. 添加新端点

```typescript
// app/api/your-endpoint/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // 业务逻辑
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
```

### 4. 错误处理模式

```typescript
// 统一错误响应格式
return NextResponse.json({ error: "错误描述" }, { status: 400 | 401 | 500 });
```

### 5. Edge vs Node.js Runtime

| Runtime | 适用场景                | 声明方式                        |
| ------- | ----------------------- | ------------------------------- |
| Edge    | 轻量请求、低延迟        | `export const runtime = "edge"` |
| Node.js | 复杂操作、需要 Node API | 默认（无需声明）                |

---

## 常见问题

### Q: 为什么 `/api/chat` 不使用 Edge Runtime？

A: 聊天 API 使用 `@xmldom/xmldom` 解析 XML，该包需要 Node.js 环境。

### Q: 如何支持新的 LLM 提供者？

1. 在 `ProviderType` 添加新类型
2. 在 `route.ts` 的 Provider 选择逻辑中添加分支
3. 更新 `DEFAULT_LLM_CONFIG` 如需修改默认值

### Q: 工具调用超时怎么处理？

A: `drawio_overwrite` 工具内置 60 秒超时。如需调整，修改 `drawio-ai-tools.ts` 中的超时参数。

---

_最后更新: 2025-11-23_
