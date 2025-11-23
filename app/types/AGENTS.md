# TypeScript 类型定义

## 概述

项目的完整 TypeScript 类型定义，确保类型安全和开发体验。

## 类型文件

### chat.ts

LLM 供应商与聊天消息相关的核心类型定义。

#### 核心类型

- **ProviderType**: 支持的供应商枚举（`openai-reasoning`、`openai-compatible`、`deepseek`）。
- **LLMConfig**: 设置页与后端共用的 LLM 配置（URL、密钥、温度、模型、系统提示、供应商、工具轮次数）。
- **ToolInvocation/ToolInvocationState**: AI 工具调用的状态结构。
- **ChatMessage**: 扩展 AI SDK Message 的聊天消息定义。
- **MessageMetadata**: 消息元数据（模型名称、创建时间）。
- **ChatUIMessage**: 基于 AI SDK UIMessage 的带元数据消息类型。
- **ChatSession**: 聊天会话定义（ID、标题、消息列表、时间戳）。
- **ChatSessionsData**: 会话数据管理结构。
- **ChatExportData**: 会话导入导出数据格式。

### socket-protocol.ts

Socket.IO 通讯协议的类型定义。

#### 核心接口

- **ToolCallRequest**: 工具调用请求结构（含 requestId、toolName、input、timeout、description、\_originalTool）
- **ToolCallResult**: 工具执行结果结构（含 requestId、success、result、error）
- **ServerToClientEvents**: Socket.IO 服务器到客户端事件类型
- **ClientToServerEvents**: Socket.IO 客户端到服务器事件类型

### global.d.ts

全局类型声明和环境变量定义。

#### 主要内容

- 全局 Socket.IO 服务器实例类型（`io`）
- 待处理工具调用请求 Map（`pendingRequests`）
- 扩展的 Window 对象属性（`electron` 和 `electronStorage` API）
- `declare module 'xpath'`：为第三方库补充最小化声明
- `declare module 'pako'`：压缩库类型声明

### drawio-tools.ts

DrawIO XML 操作的完整类型定义。

#### 前端桥接类型

**GetXMLResult** - 获取 XML 的返回结果

```typescript
export interface GetXMLResult {
  success: boolean;
  xml?: string;
  error?: string;
}
```

**ReplaceXMLResult** - 替换 XML 的返回结果

```typescript
export interface ReplaceXMLResult {
  success: boolean;
  message: string;
  error?: string;
}
```

**XMLValidationResult** - XML 验证结果

```typescript
export interface XMLValidationResult {
  valid: boolean;
  error?: string;
}
```

#### drawio_read 查询结果

**DrawioQueryResult** - 统一的查询结果联合类型（包含 matched_xpath 字段，指向命中的节点路径）

```typescript
export type DrawioQueryResult =
  | {
      type: "element";
      tag_name: string;
      attributes: Record<string, string>;
      xml_string: string;
      matched_xpath: string;
    }
  | { type: "attribute"; name: string; value: string; matched_xpath: string }
  | { type: "text"; value: string; matched_xpath: string };
```

**DrawioReadResult** - 查询响应

```typescript
export interface DrawioReadResult {
  success: boolean;
  results?: DrawioQueryResult[];
  error?: string;
}
```

#### drawio_edit_batch 操作定义

所有操作共享 `allow_no_match?: boolean` 标志，未匹配节点时根据该标志决定是否视为成功跳过。

- **SetAttributeOperation** (`type: 'set_attribute'`)
- **RemoveAttributeOperation** (`type: 'remove_attribute'`)
- **InsertElementOperation** (`type: 'insert_element'`, `target_xpath`, `new_xml`, `position`)
- **RemoveElementOperation** (`type: 'remove_element'`, `xpath`)
- **ReplaceElementOperation** (`type: 'replace_element'`, `xpath`, `new_xml`)
- **SetTextContentOperation** (`type: 'set_text_content'`, `xpath`, `value`)

联合类型示例：

```typescript
export type DrawioEditOperation =
  | SetAttributeOperation
  | RemoveAttributeOperation
  | InsertElementOperation
  | RemoveElementOperation
  | ReplaceElementOperation
  | SetTextContentOperation;
```

**DrawioEditBatchResult** - 批量编辑返回结构

```typescript
export interface DrawioEditBatchResult {
  success: true;
  operations_applied: number;
}
```

**DrawioSelectionInfo** - DrawIO 选中元素信息

```typescript
export interface DrawioSelectionInfo {
  count: number;
  cells: DrawioCellInfo[];
}
```

**DrawioCellInfo** - DrawIO 单个选中元素信息

```typescript
export interface DrawioCellInfo {
  id: string;
  type: "vertex" | "edge" | "unknown";
  value: unknown;
  style: string;
  label: string;
  geometry?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
}
```

## 类型设计原则

### 1. 完整性

- 所有公共 API 都有对应的类型定义
- 包含所有可能的返回状态和错误情况

### 2. 详细错误信息

- 每个错误都包含具体的描述信息
- 批量操作保留触发失败的操作索引

### 3. 类型安全

- 使用严格的类型检查
- 避免使用 `any` 类型
- 提供明确的可选/必需字段标记

### 4. 开发友好

- 详细的 JSDoc 注释
- 清晰的字段命名
- 逻辑性的接口分组

## 使用示例

```typescript
import type {
  GetXMLResult,
  ReplaceXMLResult,
  DrawioReadResult,
  DrawioEditOperation,
  DrawioEditBatchResult,
} from "./drawio-tools";
import {
  executeDrawioRead,
  executeDrawioEditBatch,
} from "../lib/drawio-xml-service";

async function demo() {
  const read: DrawioReadResult = await executeDrawioRead(
    "//mxCell[@id='cat-head']",
  );

  const editOperations: DrawioEditOperation[] = [
    {
      type: "set_attribute",
      xpath: "//mxCell[@id='cat-head']",
      key: "value",
      value: "Cat Head",
    },
  ];

  const result: DrawioEditBatchResult = await executeDrawioEditBatch({
    operations: editOperations,
  });
}
```

## 扩展指南

### 添加新类型

1. 在相应的 `.ts` 文件中定义接口
2. 使用 `export` 导出公共类型
3. 添加详细的 JSDoc 注释
4. 更新相关的使用文档

### 类型命名规范

- **接口**: PascalCase (如 `GetXMLResult`)
- **类型别名**: PascalCase (如 `DrawioEditOperation`)
- **枚举**: PascalCase (如 `ThemeMode`)
- **常量**: camelCase (如 `storageKey`)

## 代码腐化清理记录

### 2025-11-23 清理

**执行的操作**：

- 删除 `drawio-tools.ts` 中冗余的 `ReplaceResult` 接口，改为直接定义 `ReplaceXMLResult` 接口

**影响文件**：1 个（`drawio-tools.ts`）

**下次关注**：

- 无
