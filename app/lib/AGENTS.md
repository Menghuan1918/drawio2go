# 工具库

## 概述

汇总应用层工具函数与 AI 工具定义，负责 DrawIO XML 的读取、写入与 Socket.IO 调用协调。

## 工具文件清单

- **drawio-tools.ts**: 浏览器端的 XML 存储桥接（统一存储抽象层 + 事件通知）
- **drawio-xml-service.ts**: 服务端 XML 转接层，负责 XPath 查询与批量编辑
- **drawio-ai-tools.ts**: AI 工具定义（`drawio_read` / `drawio_edit_batch`）
- **tool-executor.ts**: 工具执行路由器，通过 Socket.IO 与前端通讯
- **config-utils.ts**: LLM 配置规范化工具（默认值、类型校验、URL 规范化）
- **storage/**: 统一存储抽象层（适配器模式）

## DrawIO Socket.IO 调用流程

1. 后端工具通过 `executeToolOnClient()` 获取当前 XML 或请求前端写入
2. 前端（`useDrawioSocket` + `drawio-tools.ts`）访问统一存储层并响应请求
3. 服务端使用 `drawio-xml-service.ts` 对 XML 进行 XPath 查询或批量操作
4. 编辑完成后再次通过 Socket.IO 将新 XML 写回前端

## DrawIO XML 转接层（`drawio-xml-service.ts`）

### 核心设计原则

- **无推断 (No Inference)**: 不对 XML 做领域特化解析，只处理调用者提供的 XPath 与原始字符串
- **XPath 驱动**: 所有查询与编辑均使用标准 XPath 表达式定位节点
- **原子性**: `drawio_edit_batch` 全部成功后才写回前端，任一操作失败立即返回错误，不修改原始 XML
- **Base64 解码**: 每次从前端读取 XML 后都会自动检测并解码 `data:image/svg+xml;base64,` 前缀

### 提供的函数

- `executeDrawioRead(xpath?: string)`: 返回结构化的查询结果（元素 / 属性 / 文本），并在 `matched_xpath` 字段中携带命中路径
- `executeDrawioEditBatch({ operations })`: 执行批量操作，遵守 `allow_no_match` 语义并保持原子性

### 支持的操作类型

`set_attribute`, `remove_attribute`, `insert_element`, `remove_element`, `replace_element`, `set_text_content`

## DrawIO AI 工具（`drawio-ai-tools.ts`）

- **`drawio_read`**: 可选 `xpath` 参数，默认返回根节点。输出为结构化 JSON 数组
- **`drawio_edit_batch`**: `operations` 数组，严格遵循“全部成功或全部失败”规则
- 输入参数使用 Zod 校验并在内部调用 `drawio-xml-service.ts`

## 工具执行路由器（`tool-executor.ts`）

- 统一管理 Socket.IO 请求的发送与结果回传
- 自动生成 `requestId`、处理超时与错误
- 当前仅路由 DrawIO 相关工具（前端执行部分）

## 浏览器端存储工具（`drawio-tools.ts`）

- 使用统一存储抽象层（Electron: SQLite, Web: IndexedDB）
- 保存时自动解码 base64，并通过 `drawio-xml-updated` 自定义事件通知编辑器
- 提供 `getDrawioXML()`、`replaceDrawioXML()`、`saveDrawioXML()` 三个接口
- 当前采用单项目模式（uuid="default"）和最新版本策略（semantic_version="latest"）
  - 单项目模式：简化用户体验，所有数据存储在 "default" 项目下
  - 最新版本策略：每次保存自动删除旧版本，仅保留最新版本
  - 详见 `storage/constants.ts` 中的设计说明

## 配置规范化工具（`config-utils.ts`）

提供 LLM 配置的规范化和验证功能：

- **默认常量**:
  - `DEFAULT_SYSTEM_PROMPT`: 默认系统提示词（DrawIO XML 专用）
  - `DEFAULT_API_URL`: 默认 API 地址
  - `DEFAULT_LLM_CONFIG`: 完整的默认配置对象

- **核心函数**:
  - `isProviderType()`: 验证 provider 类型是否合法
  - `normalizeApiUrl()`: 规范化 API URL（自动添加 /v1 后缀）
  - `normalizeLLMConfig()`: 规范化完整配置（设置默认值、验证类型）

- **使用场景**:
  - API 路由中规范化用户输入
  - 存储设置时自动验证和补全
  - 确保配置格式一致性

## 统一存储抽象层（`storage/`）

### 设计原则

- **适配器模式**: 定义统一存储接口，支持多种存储后端
- **环境适配**: 运行时检测环境，自动选择合适的存储实现
  - **Electron**: SQLite 数据库（通过 better-sqlite3）
  - **Web**: IndexedDB（通过 idb）
- **类型安全**: 完整 TypeScript 类型定义
- **表结构统一**: 所有环境使用相同的表结构和字段命名

### 文件结构

- **adapter.ts**: 抽象基类 `StorageAdapter`，定义统一接口
- **sqlite-storage.ts**: SQLite 实现（Electron 环境）
- **indexeddb-storage.ts**: IndexedDB 实现（Web 环境）
- **storage-factory.ts**: 存储工厂，运行时创建存储实例
- **types.ts**: 存储层类型定义
- **constants.ts**: 常量定义（表名、默认值等）
- **index.ts**: 统一导出

### 表结构

#### Projects 表

项目元数据表，管理 DrawIO 项目信息

```typescript
interface Project {
  uuid: string; // 主键，唯一标识符
  name: string; // 项目名称
  description?: string; // 项目描述
  created_at: number; // 创建时间戳
  updated_at: number; // 更新时间戳
}
```

#### XMLVersions 表

XML 版本管理表，关联项目存储历史版本

```typescript
interface XMLVersion {
  id?: number; // 自增主键（SQLite）/ 自动生成（IndexedDB）
  project_uuid: string; // 关联项目
  semantic_version: string; // 语义化版本号（如 "v1.0.0" 或 "latest"）
  xml_content: string; // XML 内容
  created_at: number; // 创建时间戳
}
```

#### Conversations 表

聊天会话表，存储 AI 对话历史

```typescript
interface Conversation {
  id: string; // 会话 ID
  title: string; // 会话标题
  messages: string; // JSON 序列化的消息数组
  created_at: number; // 创建时间戳
  updated_at: number; // 更新时间戳
}
```

#### Settings 表

应用设置表，存储全局配置

```typescript
interface Settings {
  key: string; // 设置键（主键）
  value: string; // JSON 序列化的设置值
  updated_at: number; // 更新时间戳
}
```

### 核心 API

所有存储实现都继承自 `StorageAdapter` 并实现以下方法：

```typescript
abstract class StorageAdapter {
  // 初始化存储
  abstract initialize(): Promise<void>;

  // Projects 表操作
  abstract getProject(uuid: string): Promise<Project | null>;
  abstract getAllProjects(): Promise<Project[]>;
  abstract saveProject(project: Project): Promise<void>;
  abstract deleteProject(uuid: string): Promise<void>;

  // XMLVersions 表操作
  abstract getXMLVersion(
    project_uuid: string,
    version: string,
  ): Promise<XMLVersion | null>;
  abstract getLatestXML(project_uuid: string): Promise<XMLVersion | null>;
  abstract saveXMLVersion(version: XMLVersion): Promise<void>;
  abstract deleteXMLVersion(id: number): Promise<void>;

  // Conversations 表操作
  abstract getConversation(id: string): Promise<Conversation | null>;
  abstract getAllConversations(): Promise<Conversation[]>;
  abstract saveConversation(conversation: Conversation): Promise<void>;
  abstract deleteConversation(id: string): Promise<void>;
  abstract clearAllConversations(): Promise<void>;

  // Settings 表操作
  abstract getSetting(key: string): Promise<string | null>;
  abstract saveSetting(key: string, value: string): Promise<void>;
  abstract deleteSetting(key: string): Promise<void>;
}
```

### 使用方式

#### 1. 通过工厂创建实例

```typescript
import { createStorage } from "@/lib/storage";

const storage = await createStorage();
await storage.initialize();
```

#### 2. 推荐通过 Hooks 使用

```typescript
import { useStorageSettings, useStorageProjects } from "@/hooks";

// Hooks 内部自动处理存储实例创建和初始化
const { settings, saveSettings } = useStorageSettings();
```

### SQLite 实现细节

- **数据库文件**: `electron/storage/drawio2go.db`
- **同步 API**: 使用 better-sqlite3 的同步 API
- **事务支持**: 支持事务操作保证原子性
- **索引优化**: 为常用查询字段创建索引

### IndexedDB 实现细节

- **数据库名称**: `drawio2go`
- **版本管理**: 使用 idb 库简化版本迁移
- **对象存储**: 每个表对应一个对象存储（Object Store）
- **索引**: 为查询字段创建索引提升性能

### 架构决策

#### 单项目模式 vs 多项目支持

**当前实现：单项目模式**

- 所有数据存储在固定的 "default" 项目下
- 简化用户体验，无需手动管理项目
- 适合个人使用场景

**设计原因：**

- 避免过早引入复杂的项目管理概念
- 保持界面简洁，降低学习成本
- 当前用户需求集中在单图表编辑

**未来扩展（如需要）：**

- 支持多项目/工作区切换
- 添加项目创建、删除、重命名功能
- 项目级别的配置隔离

#### 最新版本策略 vs 完整版本管理

**当前实现：仅保留最新版本**

- 每次保存自动删除旧版本
- 固定使用 "latest" 语义版本号
- 保持存储空间最小化

**设计原因：**

- 避免版本管理的复杂性
- 减少存储空间占用
- 简化版本查询逻辑

**未来扩展（如需要）：**

- 实现真实的语义化版本管理
- 支持版本历史记录和回滚
- 版本比对和差异查看
- 自动版本号递增策略

## 类型定义

所有公共类型位于 `../types/drawio-tools.ts` 和 `storage/types.ts`，包含：

- 前端桥接返回结果（`GetXMLResult` / `ReplaceXMLResult` / `XMLValidationResult`）
- `drawio_read` 查询结果结构
- `drawio_edit_batch` 支持的操作及返回值
- 存储层接口和表结构类型
