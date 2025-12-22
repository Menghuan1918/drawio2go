# API 模块

> 本文档是 `app/api/` 的 AI 代理指南，详细说明 API 端点的实现与使用规范。

## 目录概览

```
app/api/
├── AGENTS.md           # 本文档
├── ai-proxy/
│   └── route.ts        # 纯 AI 代理端点（仅转发，不含业务逻辑）
├── health/
│   └── route.ts        # 轻量级健康检查（在线心跳）
└── test/
    └── route.ts        # 连接测试 API
```

## 端点列表

| 端点            | 方法       | 功能                       | 运行时  |
| --------------- | ---------- | -------------------------- | ------- |
| `/api/ai-proxy` | POST       | 纯代理：转发到 AI Provider | Node.js |
| `/api/test`     | POST       | LLM 配置连接测试           | Edge    |
| `/api/health`   | HEAD / GET | 健康检查（<100ms 心跳）    | Edge    |

---

## 核心实现

### `/api/ai-proxy` - 纯 AI 代理端点

**文件**: `drawio2go/app/api/ai-proxy/route.ts`

#### 功能描述

仅负责将前端请求转发到 AI Provider，返回标准 `UIMessageStreamResponse` 流式响应。

#### 请求格式

```typescript
{
  messages: UIMessage[];
  config: {
    providerType: ProviderType;
    modelName: string;
    apiUrl?: string;
    apiKey: string;
    systemPrompt?: string;
    temperature?: number;
    maxToolRounds?: number;
  };
  // 可选：前端上送 tools schema，BFF 纯透传给 AI SDK（后端不执行工具）
  tools?: {
    [toolName: string]: {
      description?: string;
      inputJsonSchema: unknown; // JSON Schema
    };
  };
}
```

#### 注意事项

- 不做会话校验/项目隔离
- 纯 HTTP 代理转发：不注入/不执行 DrawIO 工具
- `tools` 仅用于让模型产出 tool-call；后端不会为 tool 提供 `execute`
- 对 `tools` 整体 payload 做 64KB 上限保护，避免异常输入

### `/api/test` - 连接测试端点

**文件**: `drawio2go/app/api/test/route.ts`

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

向 LLM 发送携带 `test` 工具的请求，并使用 `toolChoice: { type: "tool", toolName: "test" }` 强制模型调用该工具；工具 `execute` 返回 `{ ok: true }`，用于同时验证连通性与 function call（tools）能力。

---

### `/api/health` - 健康检查端点

**文件**: `drawio2go/app/api/health/route.ts`

**功能描述**

用于网络连通性心跳检测，供 `useNetworkStatus` 判定“真在线 / 假在线”。

**运行时**: `export const runtime = "edge"`（超轻量，默认 <100ms）

**方法**:

- `HEAD /api/health` → `204 No Content`
- `GET /api/health` → `{ ok: true, timestamp }`

**缓存**: `Cache-Control: no-store`，避免 CDN/浏览器缓存导致误判。

---

## DrawIO 工具（v1.1）

- 后端端点（`/api/ai-proxy`）不再注入/执行任何 DrawIO 工具。
- DrawIO 工具执行已迁移到前端：见 `app/lib/frontend-tools.ts` 与 `app/components/ChatSidebar.tsx`（`useChat` 的 `onToolCall`）。

## 类型定义

**来源**: `drawio2go/app/types/chat.ts`

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
  | "gemini" // Google Gemini API
  | "openai-reasoning" // OpenAI o1/o3 推理模型
  | "openai-compatible" // OpenAI 兼容接口（LM Studio 等）
  | "deepseek-native" // DeepSeek 原生 API
  | "anthropic"; // Anthropic Claude API
```

---

## 配置工具

**来源**: `drawio2go/app/lib/config-utils.ts`

### 默认配置

```typescript
export const DEFAULT_LLM_CONFIG: LLMConfig = {
  // 默认不预置任何供应商/模型，需要用户在设置中显式配置
  apiUrl: "",
  apiKey: "",
  temperature: 0.3,
  modelName: "",
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
console.log("[AI Proxy API] 收到请求:", {...});
console.log("[AI Proxy API] 步骤完成:", {...});
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

### Q: 如何支持新的 LLM 提供者？

1. 在 `ProviderType` 添加新类型
2. 在 `route.ts` 的 Provider 选择逻辑中添加分支
3. 更新 `DEFAULT_LLM_CONFIG` 如需修改默认值

### Q: DrawIO 工具超时怎么处理？

A: v1.1 后端不再执行 DrawIO 工具；超时由前端工具层控制（见 `TOOL_TIMEOUT_CONFIG`）。

---

_最后更新: 2025-12-18_
