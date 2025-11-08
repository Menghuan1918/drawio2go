# 里程碑 1：类型定义与接口设计

**状态**：✅ 已完成
**实际耗时**：待记录
**依赖**：无

## 目标

建立完整的 TypeScript 类型系统和抽象接口定义，为后续实现提供类型安全保障。

## 任务清单

### 1. 创建常量定义文件

- [x] 创建 `app/lib/storage/constants.ts`：

  ```typescript
  // 默认常量（临时实现）
  export const DEFAULT_PROJECT_UUID = "default";
  export const DEFAULT_XML_VERSION = "1.0.0";

  // 数据库配置
  export const DB_NAME = "drawio2go";
  export const DB_VERSION = 1;

  // Electron SQLite 数据库文件名
  export const SQLITE_DB_FILE = "drawio2go.db";
  ```

### 2. 创建类型定义文件

- [x] 创建 `app/lib/storage/types.ts`，定义所有数据模型：

#### Settings 类型

```typescript
/**
 * 设置键值对
 */
export interface Setting {
  key: string;
  value: string;
  updated_at: number;
}
```

#### Project 类型

```typescript
/**
 * 工程实体
 * 临时实现：固定使用 uuid="default" 的工程
 */
export interface Project {
  uuid: string;
  name: string;
  description?: string;
  active_xml_version_id?: number;
  active_conversation_id?: string;
  created_at: number;
  updated_at: number;
}

/**
 * 创建工程时的输入类型
 */
export type CreateProjectInput = Omit<Project, "created_at" | "updated_at">;

/**
 * 更新工程时的输入类型
 */
export type UpdateProjectInput = Partial<
  Omit<Project, "uuid" | "created_at" | "updated_at">
>;
```

#### XMLVersion 类型

```typescript
/**
 * XML 版本实体
 * 临时实现：所有版本固定为 semantic_version="1.0.0"
 */
export interface XMLVersion {
  id: number;
  project_uuid: string;
  semantic_version: string;
  name?: string;
  description?: string;
  source_version_id: number; // 0 表示首个版本
  xml_content: string;
  preview_image?: Blob | Buffer; // 🆕 预览图（Web: Blob, Electron: Buffer）
  created_at: number;
}

/**
 * 创建 XML 版本时的输入类型
 */
export type CreateXMLVersionInput = Omit<XMLVersion, "id" | "created_at">;

/**
 * 预览图数据类型（用于 IPC 传输）
 */
export interface PreviewImageData {
  buffer: ArrayBuffer;
  mimeType: string; // 'image/png' | 'image/jpeg'
}
```

#### Conversation 类型

```typescript
/**
 * 对话实体
 * 🆕 新增 xml_version_id 字段，关联特定的 XML 版本
 */
export interface Conversation {
  id: string;
  project_uuid: string;
  xml_version_id: number; // 🆕 关联的 XML 版本 ID
  title: string;
  created_at: number;
  updated_at: number;
}

/**
 * 创建对话时的输入类型
 */
export type CreateConversationInput = Omit<
  Conversation,
  "created_at" | "updated_at"
>;

/**
 * 更新对话时的输入类型
 */
export type UpdateConversationInput = Partial<
  Omit<Conversation, "id" | "created_at">
>;
```

#### Message 类型

```typescript
/**
 * 消息角色
 */
export type MessageRole = "user" | "assistant" | "system";

/**
 * 消息实体
 */
export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  tool_invocations?: string; // JSON 序列化的工具调用记录
  created_at: number;
}

/**
 * 创建消息时的输入类型
 */
export type CreateMessageInput = Omit<Message, "created_at">;
```

### 3. 创建抽象接口文件

- [x] 创建 `app/lib/storage/adapter.ts`，定义 StorageAdapter 接口：

```typescript
import type {
  Setting,
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  XMLVersion,
  CreateXMLVersionInput,
  Conversation,
  CreateConversationInput,
  UpdateConversationInput,
  Message,
  CreateMessageInput,
} from "./types";

/**
 * 存储适配器抽象接口
 *
 * 所有存储实现（SQLite, IndexedDB）必须实现此接口
 *
 * 设计原则：
 * - 所有方法返回 Promise，支持异步操作
 * - 使用明确的类型定义，避免 any
 * - 错误通过 Promise reject 传递
 */
export interface StorageAdapter {
  // ==================== 初始化 ====================

  /**
   * 初始化存储
   * - 创建数据库表 / Object Stores
   * - 创建默认工程（uuid="default"）
   * - 设置索引和约束
   */
  initialize(): Promise<void>;

  // ==================== Settings ====================

  /**
   * 获取设置值
   * @param key 设置键
   * @returns 设置值，不存在返回 null
   */
  getSetting(key: string): Promise<string | null>;

  /**
   * 设置值
   * @param key 设置键
   * @param value 设置值
   */
  setSetting(key: string, value: string): Promise<void>;

  /**
   * 删除设置
   * @param key 设置键
   */
  deleteSetting(key: string): Promise<void>;

  /**
   * 获取所有设置
   * @returns 所有设置的数组
   */
  getAllSettings(): Promise<Setting[]>;

  // ==================== Projects ====================

  /**
   * 获取工程
   * @param uuid 工程 UUID
   * @returns 工程实体，不存在返回 null
   */
  getProject(uuid: string): Promise<Project | null>;

  /**
   * 创建工程
   * @param project 工程数据（不包含时间戳）
   * @returns 创建后的完整工程实体
   */
  createProject(project: CreateProjectInput): Promise<Project>;

  /**
   * 更新工程
   * @param uuid 工程 UUID
   * @param updates 更新的字段（Partial）
   */
  updateProject(uuid: string, updates: UpdateProjectInput): Promise<void>;

  /**
   * 删除工程
   * @param uuid 工程 UUID
   */
  deleteProject(uuid: string): Promise<void>;

  /**
   * 获取所有工程
   * @returns 所有工程的数组
   */
  getAllProjects(): Promise<Project[]>;

  // ==================== XMLVersions ====================

  /**
   * 获取 XML 版本
   * @param id 版本 ID
   * @returns XML 版本实体，不存在返回 null
   */
  getXMLVersion(id: number): Promise<XMLVersion | null>;

  /**
   * 创建 XML 版本
   * @param version XML 版本数据（不包含 id 和时间戳）
   * @returns 创建后的完整 XML 版本实体
   */
  createXMLVersion(version: CreateXMLVersionInput): Promise<XMLVersion>;

  /**
   * 获取工程的所有 XML 版本
   * @param projectUuid 工程 UUID
   * @returns XML 版本数组（按创建时间倒序）
   */
  getXMLVersionsByProject(projectUuid: string): Promise<XMLVersion[]>;

  /**
   * 删除 XML 版本
   * @param id 版本 ID
   */
  deleteXMLVersion(id: number): Promise<void>;

  // ==================== Conversations ====================

  /**
   * 获取对话
   * @param id 对话 ID
   * @returns 对话实体，不存在返回 null
   */
  getConversation(id: string): Promise<Conversation | null>;

  /**
   * 创建对话
   * @param conversation 对话数据（不包含时间戳）
   * @returns 创建后的完整对话实体
   */
  createConversation(
    conversation: CreateConversationInput,
  ): Promise<Conversation>;

  /**
   * 更新对话
   * @param id 对话 ID
   * @param updates 更新的字段（Partial）
   */
  updateConversation(
    id: string,
    updates: UpdateConversationInput,
  ): Promise<void>;

  /**
   * 删除对话（级联删除关联的消息）
   * @param id 对话 ID
   */
  deleteConversation(id: string): Promise<void>;

  /**
   * 获取工程的所有对话
   * @param projectUuid 工程 UUID
   * @returns 对话数组（按更新时间倒序）
   */
  getConversationsByProject(projectUuid: string): Promise<Conversation[]>;

  /**
   * 获取 XML 版本关联的所有对话
   * @param xmlVersionId XML 版本 ID
   * @returns 对话数组（按更新时间倒序）
   */
  getConversationsByXMLVersion(xmlVersionId: number): Promise<Conversation[]>;

  // ==================== Messages ====================

  /**
   * 获取对话的所有消息
   * @param conversationId 对话 ID
   * @returns 消息数组（按创建时间正序）
   */
  getMessagesByConversation(conversationId: string): Promise<Message[]>;

  /**
   * 创建消息
   * @param message 消息数据（不包含时间戳）
   * @returns 创建后的完整消息实体
   */
  createMessage(message: CreateMessageInput): Promise<Message>;

  /**
   * 删除消息
   * @param id 消息 ID
   */
  deleteMessage(id: string): Promise<void>;

  /**
   * 批量创建消息（性能优化）
   * @param messages 消息数组
   * @returns 创建后的完整消息数组
   */
  createMessages(messages: CreateMessageInput[]): Promise<Message[]>;
}
```

### 4. 添加全局类型声明

- [x] 修改 `app/types/global.d.ts`，添加 Electron 存储接口类型：

```typescript
// 添加到现有的 global.d.ts 中：
import type {
  Setting,
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  XMLVersion,
  CreateXMLVersionInput,
  Conversation,
  CreateConversationInput,
  UpdateConversationInput,
  Message,
  CreateMessageInput,
} from '@/lib/storage/types';

// 在 Window 接口中添加：
electronStorage?: {
  // 初始化
  initialize: () => Promise<void>;

  // Settings
  getSetting: (key: string) => Promise<string | null>;
  setSetting: (key: string, value: string) => Promise<void>;
  deleteSetting: (key: string) => Promise<void>;
  getAllSettings: () => Promise<Setting[]>;

  // Projects
  getProject: (uuid: string) => Promise<Project | null>;
  createProject: (project: CreateProjectInput) => Promise<Project>;
  updateProject: (uuid: string, updates: UpdateProjectInput) => Promise<void>;
  deleteProject: (uuid: string) => Promise<void>;
  getAllProjects: () => Promise<Project[]>;

  // XMLVersions
  getXMLVersion: (id: number) => Promise<XMLVersion | null>;
  createXMLVersion: (version: CreateXMLVersionInput) => Promise<XMLVersion>;
  getXMLVersionsByProject: (projectUuid: string) => Promise<XMLVersion[]>;
  deleteXMLVersion: (id: number) => Promise<void>;

  // Conversations
  getConversation: (id: string) => Promise<Conversation | null>;
  createConversation: (conversation: CreateConversationInput) => Promise<Conversation>;
  updateConversation: (id: string, updates: UpdateConversationInput) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  getConversationsByProject: (projectUuid: string) => Promise<Conversation[]>;
  getConversationsByXMLVersion: (xmlVersionId: number) => Promise<Conversation[]>;

  // Messages
  getMessagesByConversation: (conversationId: string) => Promise<Message[]>;
  createMessage: (message: CreateMessageInput) => Promise<Message>;
  deleteMessage: (id: string) => Promise<void>;
  createMessages: (messages: CreateMessageInput[]) => Promise<Message[]>;
};
```

## 验收标准

- [x] `constants.ts` 定义所有必要常量
- [x] `types.ts` 包含 5 张表的完整类型定义
- [x] `types.ts` 包含所有 Input 类型（Create/Update）
- [x] `adapter.ts` 定义完整的 StorageAdapter 接口
- [x] `adapter.ts` 包含约 25+ 个方法签名
- [x] `global.d.ts` 添加 Window.electronStorage 类型声明
- [x] 所有类型包含 JSDoc 注释
- [x] 编译无 TypeScript 错误

## 测试步骤

1. ✅ 创建所有文件
2. ✅ 运行 `pnpm run build` 或 `pnpm tsc` 检查类型
3. ✅ 确认无编译错误
4. ✅ 检查 IDE 类型提示是否正常

## 设计要点

### 类型安全原则

- **明确的类型边界**：Input 类型省略时间戳和自增 ID
- **避免 any**：所有接口使用明确的类型定义
- **可选字段**：使用 `?` 标记可选字段
- **联合类型**：MessageRole 使用字面量联合类型

### 接口设计原则

- **异步优先**：所有方法返回 Promise
- **CRUD 完整性**：每张表提供完整的增删改查
- **批量操作**：提供 `createMessages` 等批量方法
- **关联查询**：提供按外键查询的方法（`getConversationsByXMLVersion`）

### 预览图处理

- **类型灵活性**：`Blob | Buffer` 适配 Web 和 Electron
- **IPC 传输**：定义 `PreviewImageData` 接口，使用 ArrayBuffer
- **MIME 类型**：记录图片格式，便于后续渲染

### 临时实现标记

- **JSDoc 注释**：标记临时实现的字段和方法
- **常量定义**：`DEFAULT_PROJECT_UUID` 和 `DEFAULT_XML_VERSION`
- **未来扩展**：预留 `getAllProjects` 等方法

## 注意事项

- 所有时间戳使用 `number` 类型（Unix timestamp 毫秒）
- 所有 ID 字段明确类型（`string` 或 `number`）
- 接口方法按功能分组（Settings, Projects, 等）
- JSDoc 注释说明每个方法的用途和参数

## 可扩展性设计

### 未来可添加的方法

```typescript
// 搜索和过滤
searchConversations(query: string): Promise<Conversation[]>;

// 统计信息
getConversationCount(projectUuid: string): Promise<number>;
getXMLVersionCount(projectUuid: string): Promise<number>;

// 数据导出
exportProject(uuid: string): Promise<ExportData>;
importProject(data: ExportData): Promise<Project>;

// 数据同步
syncProject(uuid: string, remoteData: any): Promise<void>;
```

## 破坏性变更

- 🆕 新增整套类型系统，不影响现有代码
- 🆕 新增 Window.electronStorage 接口

## 下一步

完成后继续：

- [里程碑 2：Electron SQLite 实现](./milestone-2.md)
- [里程碑 3：Web IndexedDB 实现](./milestone-3.md)（可并行）

---

**提示**：此里程碑只创建类型定义，不实现任何逻辑代码。
