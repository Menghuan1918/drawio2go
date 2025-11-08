# 里程碑 5：类型定义与优化

**状态**：✅ 已完成
**预计耗时**：30 分钟
**依赖**：里程碑 1-4

## 目标

完善 TypeScript 类型定义，优化代码结构和用户体验，集成 Socket.IO 协议类型

## 任务清单

### 1. 创建统一的类型定义文件

- [x] 创建 `app/types/chat.ts`：

  ```typescript
  export type ProviderType =
    | "openai"
    | "openai-response"
    | "deepseek"
    | "anthropic";

  export interface LLMConfig {
    apiUrl: string;
    apiKey: string;
    temperature: number;
    modelName: string;
    systemPrompt: string;
    providerType: ProviderType;
    maxToolRounds: number;
  }
  ```

- [x] 创建 `app/types/socket-protocol.ts`：

  ```typescript
  /**
   * Socket.IO 通讯协议类型定义
   */
  export interface ToolCallRequest {
    requestId: string;
    toolName:
      | "get_drawio_xml"
      | "replace_drawio_xml"
      | "batch_replace_drawio_xml";
    input: any;
    timeout: number;
  }

  export interface ToolCallResult {
    requestId: string;
    success: boolean;
    result?: any;
    error?: string;
  }

  export interface ServerToClientEvents {
    "tool:execute": (request: ToolCallRequest) => void;
  }

  export interface ClientToServerEvents {
    "tool:result": (result: ToolCallResult) => void;
  }
  ```

- [x] 定义工具调用相关类型：

  ```typescript
  export type ToolInvocationState = "call" | "result";

  export interface ToolInvocation {
    toolCallId: string;
    toolName: string;
    args: Record<string, any>;
    state: ToolInvocationState;
    result?: any;
  }

  export interface ChatMessage {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    toolInvocations?: ToolInvocation[];
    createdAt?: Date;
  }
  ```

### 2. 统一类型导入和使用

- [x] 更新所有文件使用统一类型：

  ```typescript
  // SettingsSidebar.tsx
  import { LLMConfig } from "@/app/types/chat";

  // ChatSidebar.tsx
  import { LLMConfig } from "@/app/types/chat";

  // API route
  import { LLMConfig } from "@/app/types/chat";
  ```

### 3. 创建自定义 Hook 系统

- [x] 创建 `app/hooks/useLLMConfig.ts`：

  ```typescript
  export function useLLMConfig() {
    const [config, setConfig] = useState<LLMConfig | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // 使用 normalizeLLMConfig 进行配置标准化
    // 支持配置迁移和验证
    // 集成 saveConfig 功能
  }
  ```

- [x] 创建 `app/hooks/useDrawioSocket.ts`：

  ```typescript
  export function useDrawioSocket() {
    const [isConnected, setIsConnected] = useState(false);
    const socketRef = useRef<Socket<
      ServerToClientEvents,
      ClientToServerEvents
    > | null>(null);

    // 完整的 Socket.IO 生命周期管理
    // 工具调用请求监听和处理
    // 连接状态管理和错误处理
  }
  ```

### 4. 配置标准化和迁移

- [x] 在 `app/lib/llm-config.ts` 中：

  ```typescript
  export const normalizeLLMConfig = (
    value?: Partial<LLMConfig> & { useLegacyOpenAIFormat?: boolean },
  ): LLMConfig => {
    const providerType = resolveProviderType(
      value?.providerType,
      value?.useLegacyOpenAIFormat,
    );
    // 完整的配置标准化逻辑
    // 支持旧配置格式迁移
    // 默认值填充和验证
  };

  const resolveProviderType = (
    providerType?: unknown,
    legacyFlag?: unknown,
  ): ProviderType => {
    // 智能供应商类型解析
  };
  ```

### 5. 服务器启动脚本

- [x] 创建 `server.js`：

  ```javascript
  const { createServer } = require("http");
  const { Server } = require("socket.io");
  const next = require("next");

  // 完整的 Socket.IO 服务器初始化
  // 工具调用请求处理
  // 全局实例挂载
  ```

- [x] 更新 `package.json` 脚本：
  ```json
  {
    "scripts": {
      "dev": "node server.js",
      "start": "NODE_ENV=production node server.js"
    }
  }
  ```

### 6. 完整的类型安全系统

- [x] Socket.IO 事件类型定义：

  ```typescript
  export interface ServerToClientEvents {
    "tool:execute": (request: ToolCallRequest) => void;
  }

  export interface ClientToServerEvents {
    "tool:result": (result: ToolCallResult) => void;
  }
  ```

- [x] 工具消息部分类型：
  ```typescript
  type ToolMessagePart = {
    type: string;
    state: string;
    toolCallId?: string;
    input?: unknown;
    output?: unknown;
    errorText?: string;
  };
  ```

### 7. 错误处理和日志系统

- [x] 统一的错误分类和处理：

  ```typescript
  // API 路由中的错误分类
  if (error.message?.includes("Anthropic")) {
    errorMessage = error.message;
    statusCode = 400;
  } else if (error.message?.includes("API key")) {
    errorMessage = "API 密钥无效或缺失";
    statusCode = 401;
  }
  ```

- [x] 开发环境调试日志：

  ```typescript
  const isDev = process.env.NODE_ENV === 'development';

  if (isDev) {
    console.log('[Chat API] 收到请求:', { ... });
    console.log('[Chat API] 步骤完成:', { ... });
  }
  ```

## 验收标准

- [x] 所有文件使用统一的类型定义
- [x] 无 TypeScript 编译错误或警告
- [x] 自定义 Hook 系统正常工作
- [x] Socket.IO 协议类型完整定义
- [x] 配置标准化和迁移功能正常
- [x] 开发环境日志清晰有用
- [x] 错误消息展示友好
- [x] 服务器脚本正确启动
- [x] 工具执行器类型安全

## 实际增强功能

- ✅ **完整的类型系统**：包括聊天、Socket.IO、工具调用等所有类型
- ✅ **配置管理系统**：自动迁移、验证、标准化
- ✅ **自定义 Hook 架构**：可复用的逻辑封装
- ✅ **Socket.IO 类型安全**：完整的事件类型定义
- ✅ **服务器集成**：Socket.IO 服务器与 Next.js 集成
- ✅ **错误处理系统**：分类错误处理和用户友好提示
- ✅ **开发工具支持**：详细的调试日志和类型检查

## 测试步骤

1. 运行 TypeScript 编译检查：
   ```bash
   npx tsc --noEmit
   ```
2. 启动服务器测试：
   ```bash
   pnpm run dev
   ```
3. 确认无类型错误
4. 测试配置加载和迁移功能
5. 验证 Socket.IO 连接和工具调用
6. 触发错误场景，检查错误显示
7. 查看浏览器和服务器控制台日志
8. 测试类型安全的工具执行流程

## 注意事项

- **类型导出**：确保所有类型从 `@/app/types/*` 正确导出
- **Hook 命名**：使用 `use` 前缀，遵循 React Hook 规范
- **Socket.IO 依赖**：确保服务器和客户端类型定义一致
- **配置迁移**：向后兼容旧配置格式
- **开发日志**：生产环境自动禁用详细日志
- **类型安全**：所有 Socket.IO 事件都有正确的类型定义

---

**下一步**：完成后继续 [里程碑 6：集成测试与调试](./milestone-6.md)
