# 里程碑 2：工具定义层

**状态**：✅ 已完成
**实际耗时**：完成
**依赖**：无

## 目标

将 DrawIO 工具集包装为 AI SDK 兼容的 tool schema，采用 Socket.IO 架构实现前后端分离

## 任务清单

### 1. 创建工具定义文件

- [x] 创建 `app/lib/drawio-ai-tools.ts`
- [x] 添加必要的导入：
  ```typescript
  import { tool } from "ai";
  import { z } from "zod";
  import { executeToolOnClient } from "./tool-executor";
  ```

### 2. 定义工具 1：get_drawio_xml

- [x] 实现获取 XML 工具，使用 Socket.IO 执行：
  ```typescript
  export const getDrawioXMLTool = tool({
    description:
      "获取当前 DrawIO 图表的完整 XML 内容。使用场景：需要查看当前图表结构时调用此工具。",
    inputSchema: z.object({}),
    execute: async () => {
      return await executeToolOnClient("get_drawio_xml", {}, 10000);
    },
  });
  ```

### 3. 定义工具 2：replace_drawio_xml

- [x] 实现完全替换 XML 工具，使用 Socket.IO 执行：
  ```typescript
  export const replaceDrawioXMLTool = tool({
    description:
      "完全替换当前 DrawIO 图表的 XML 内容。使用场景：需要生成全新的图表或进行大范围修改时使用。注意：此操作会覆盖整个图表。",
    inputSchema: z.object({
      drawio_xml: z
        .string()
        .describe("新的完整 DrawIO XML 内容，必须是合法的 XML 格式"),
    }),
    execute: async ({ drawio_xml }) => {
      return await executeToolOnClient(
        "replace_drawio_xml",
        { drawio_xml },
        30000,
      );
    },
  });
  ```

### 4. 定义工具 3：batch_replace_drawio_xml

- [x] 实现批量替换工具，使用 Socket.IO 执行：
  ```typescript
  export const batchReplaceDrawioXMLTool = tool({
    description:
      "批量精准替换 DrawIO XML 中的内容片段。使用场景：需要修改图表中的特定文本、属性或样式时使用。每个 search 字符串必须在 XML 中唯一出现，否则会跳过该替换。建议先使用 get_drawio_xml 获取内容，确认要替换的字符串唯一后再调用。",
    inputSchema: z.object({
      replacements: z
        .array(
          z.object({
            search: z
              .string()
              .describe("要搜索的字符串，必须在 XML 中唯一出现"),
            replace: z.string().describe("替换后的字符串"),
          }),
        )
        .describe("替换对数组，每个对象包含 search 和 replace 字段"),
    }),
    execute: async ({ replacements }) => {
      return await executeToolOnClient(
        "batch_replace_drawio_xml",
        { replacements },
        30000,
      );
    },
  });
  ```

### 5. 导出工具对象

- [x] 在文件末尾添加统一导出：
  ```typescript
  /**
   * 所有 DrawIO 工具的集合，用于传递给 AI SDK
   */
  export const drawioTools = {
    get_drawio_xml: getDrawioXMLTool,
    replace_drawio_xml: replaceDrawioXMLTool,
    batch_replace_drawio_xml: batchReplaceDrawioXMLTool,
  };
  ```

### 6. 创建工具执行器（新增）

- [x] 创建 `app/lib/tool-executor.ts`：
  ```typescript
  export async function executeToolOnClient(
    toolName: string,
    input: any,
    timeout: number = 30000,
  ): Promise<any> {
    // 通过 Socket.IO 在客户端执行工具
    // 支持 Promise 基础的超时处理和错误管理
  }
  ```

### 7. 创建 Socket.IO 协议定义（新增）

- [x] 创建 `app/types/socket-protocol.ts`：

  ```typescript
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
  ```

## 架构增强

### Socket.IO 工具执行流程

1. **API 路由**：调用工具的 `execute` 方法
2. **工具执行器**：通过 `executeToolOnClient` 发送 Socket.IO 请求
3. **Socket.IO 服务器**：广播工具调用请求到前端
4. **前端 Hook**：`useDrawioSocket` 监听并执行实际工具
5. **结果返回**：通过 Socket.IO 返回执行结果

### 文件完整结构

```typescript
// app/lib/drawio-ai-tools.ts
import { tool } from 'ai';
import { z } from 'zod';
import { executeToolOnClient } from './tool-executor';

// 工具 1
export const getDrawioXMLTool = tool({ ... });

// 工具 2
export const replaceDrawioXMLTool = tool({ ... });

// 工具 3
export const batchReplaceDrawioXMLTool = tool({ ... });

// 统一导出
export const drawioTools = { ... };

// app/lib/tool-executor.ts
import { v4 as uuidv4 } from 'uuid';
import type { ToolCallRequest } from '@/app/types/socket-protocol';

export async function executeToolOnClient(...) { ... }

// app/types/socket-protocol.ts
export interface ToolCallRequest { ... }
export interface ToolCallResult { ... }
```

## 验收标准

- [x] 文件能正常导入，无 TypeScript 错误
- [x] 每个工具都有清晰的 description
- [x] 参数使用 zod schema 正确定义（使用 inputSchema）
- [x] execute 函数通过 Socket.IO 正确调用工具
- [x] 错误情况能正确通过 Socket.IO 返回
- [x] 工具名称使用下划线命名（snake_case）
- [x] Socket.IO 协议类型定义完整
- [x] 工具执行器支持超时和错误处理

## 测试步骤

1. 验证 Socket.IO 连接状态
2. 测试工具调用流程：

   ```typescript
   import { getDrawioXMLTool } from "@/lib/drawio-ai-tools";

   // 测试参数验证
   console.log(getDrawioXMLTool.inputSchema.safeParse({}));

   // 测试执行（需要 Socket.IO 连接）
   const result = await getDrawioXMLTool.execute({});
   console.log(result);
   ```

3. 确认每个工具的 description 描述清晰
4. 确认 zod schema 能正确验证参数
5. 测试 Socket.IO 通信流程

## 实际增强功能

- ✅ **前后端分离架构**：工具执行通过 Socket.IO 在客户端完成
- ✅ **实时通信**：支持工具执行状态的实时反馈
- ✅ **超时管理**：可配置的工具执行超时机制
- ✅ **类型安全**：完整的 Socket.IO 协议类型定义
- ✅ **错误处理**：完善的错误传播机制
- ✅ **可扩展性**：易于添加新的客户端或服务器端工具

## 注意事项

- **工具名称**：使用 snake_case（AI 模型更容易理解）
- **描述**：包含使用场景和注意事项
- **Socket.IO 连接**：确保客户端已连接到服务器
- **超时设置**：不同工具可设置不同的超时时间
- **返回格式**：通过 Socket.IO 统一返回工具执行结果
- **错误处理**：错误信息通过 Socket.IO 传递给 AI SDK

---

**下一步**：完成后继续 [里程碑 3：聊天 API 核心逻辑](./milestone-3.md)
