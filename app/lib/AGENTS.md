# 工具库

## 概述

汇总应用层工具函数与 AI 工具定义，负责 DrawIO XML 的读取、写入与 Socket.IO 调用协调。

## 工具文件清单

- **drawio-tools.ts**: 浏览器端的 XML 存储桥接（统一存储抽象层 + 事件通知）
- **drawio-xml-service.ts**: 服务端 XML 转接层，负责 XPath 查询与批量编辑
- **drawio-ai-tools.ts**: AI 工具定义（`drawio_read` / `drawio_edit_batch`）
- **tool-executor.ts**: 工具执行路由器，通过 Socket.IO 与前端通讯
- **svg-export-utils.ts**: DrawIO 多页面 SVG 导出工具（页面拆分、单页 XML 重建、结果序列化）
- **compression-utils.ts**: Web/Node 共享的 `CompressionStream` / `DecompressionStream` deflate-raw 压缩工具
- **drawio-xml-utils.ts**: XML 归一化工具，支持裸 XML / data URI / Base64，并自动解压 `<diagram>` 内的 DrawIO 压缩内容（deflate + base64 + encodeURIComponent）
- **storage/writers.ts**: 统一的 WIP/历史版本写入管线（归一化 + 页面元数据 + 关键帧/Diff 计算 + 事件派发）
- **svg-smart-diff.ts**: SVG 智能差异对比引擎（基于 data-cell-id + 几何语义匹配的元素级高亮）
- **config-utils.ts**: LLM 配置规范化工具（默认值、类型校验、URL 规范化）
- **version-utils.ts**: 语义化版本号工具（解析、过滤子版本、子版本计数与递增推荐）
- **format-utils.ts**: 统一的日期格式化工具（版本时间戳、会话日期）
- **utils.ts**: 通用工具函数（debounce 防抖函数，支持 flush/cancel 方法；runStorageTask、withTimeout）

### svg-export-utils.ts

- `parsePages(xml)`: 解析 `<diagram>` 列表，返回 `{ id, name, index, xmlContent, element }`
- `createSinglePageXml(diagram)`: 复制 diagram 并生成完整 mxfile 字符串，保持 host/agent 等元数据
- `exportAllPagesSVG(editor, fullXml, options)`: 顺序执行 `loadDiagram → exportSVG` 并可接收 `onProgress`，结束后自动恢复原始 XML
- `serializeSVGsToBlob` / `deserializeSVGsFromBlob`: **异步** 工具，内部使用 `compression-utils` 将 JSON 结果以 `deflate-raw` 压缩后写入 Blob，再在读取时自动解压

### compression-utils.ts

- `compressBlob(blob)`：使用原生 `CompressionStream("deflate-raw")` 压缩 Blob（Node.js v17+ 和现代浏览器均支持）
- `decompressBlob(blob)`：配套解压实现，使用原生 `DecompressionStream`
- 该模块是 svg 存储和 preview_svg 压缩的唯一入口，避免重复实现

### svg-smart-diff.ts

**SVG 智能差异对比引擎** - 基于 `data-cell-id` + 几何语义的元素级匹配与视觉高亮

#### 核心功能

- **元素级匹配**: 先通过 `data-cell-id` 自动匹配，剩余元素按照几何尺寸、相对位置、标签类型、文本内容进行模糊匹配
- **差异分类**:
  - **匹配元素** (`matched`): 两个版本中完全相同的元素
  - **变更元素** (`changed`): ID 相同但内容不同的元素
  - **仅 A 存在** (`onlyA`): 被删除的元素
  - **仅 B 存在** (`onlyB`): 新增的元素
- **视觉归一化**: 自动缩放和居中对齐不同尺寸的 SVG
- **智能高亮**: 使用混合模式和滤镜高亮差异元素

**匹配策略升级（2025-11-17）**

1. **Cell 集合解析**：为每个 `data-cell-id` 叶子节点提取 `bbox`、中心点、面积、长宽比以及裁剪后的文本内容，统一归一化坐标。
2. **多阶段匹配**：
   - 阶段 1：`data-cell-id` 精确匹配（自动处理重复 ID，按出现顺序一对一匹配）。
   - 阶段 2：针对剩余元素构建候选对，综合尺寸（35%）+相对位置（25%）+文本（25%）+长宽比（15%）打分，使用最大匹配贪心策略筛选分值 ≥0.58 的配对。
3. **高亮基准选择**：仍然根据画布面积→元素数量的优先级挑选底层版本，保证差异渲染在更大的画布上呈现。
4. **自动补充 ID**：未携带 `data-cell-id` 的元素在差异 SVG 中会自动生成 `auto-x`，确保定位稳定。

> 受限于 DrawIO 导出的绝对坐标不可靠，新的匹配算法将重心放在几何/文本相似度，避免因整体平移而误判新增或删除。

#### 主要函数

```typescript
export function generateSmartDiffSvg(
  leftSvg?: string,
  rightSvg?: string,
): SmartDiffResult;
```

**返回类型**:

```typescript
interface SmartDiffResult {
  svg: string | null; // 生成的差异高亮 SVG
  stats: SmartDiffStats; // 匹配统计信息
  warnings: string[]; // 警告信息
}

interface SmartDiffStats {
  matched: number; // 匹配元素数量
  changed: number; // 变更元素数量
  onlyA: number; // 仅 A 存在的元素数量
  onlyB: number; // 仅 B 存在的元素数量
  coverage: number; // 匹配覆盖率 (matched / total)
}
```

#### 视觉样式

- **匹配元素**: 低透明度 (32%)，去饱和度，multiply 混合模式
- **删除元素**: 红色发光效果 (`--smart-diff-removed`)
- **新增元素**: 绿色发光效果 (`--smart-diff-added`)
- **变更元素**: 黄色发光效果，同时显示新旧版本

#### 使用场景

- `VersionCompare` 组件的 `smart` 对比模式
- 自动生成版本差异可视化
- 提供详细的差异统计信息

### storage/

统一存储抽象层（适配器模式）

- **current-project.ts**: 当前工程 ID 持久化工具
- **xml-version-engine.ts**: XML 版本恢复引擎（Diff 重放）
- **page-metadata-validators.ts**: `page_count` / `page_names` / SVG Blob 校验与规范化的共享工具，IndexedDB 与 SQLite 实现必须调用保持一致行为
- **migrations/indexeddb/**: IndexedDB v1 迁移脚本（当前仅 `v1.ts`），`IndexedDBStorage.initialize()` 会在 `upgrade` 回调内执行，禁止再删除/重建 Object Store
- **electron/storage/migrations/**: Electron 端 SQLite 迁移脚本（当前为 `v1.js`），主进程 `SQLiteManager` 初始化时自动运行并写入 `user_version`

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
- **WIP 工作区自动保存**：
  - 编辑器变更自动保存到 WIP 版本（v0.0.0）
  - WIP 版本不计入历史记录，仅用于实时保存，永远视为关键帧
  - 每次写入都会刷新 `created_at`，用于在 UI 中显示“最后更新”时间
  - WIP 不会参与关键帧 + Diff 链路计算，也不会被当作历史版本的 diff 基线
  - 用户手动创建版本时从 WIP 复制并生成语义化版本号
  - 详见 `storage/constants.ts` 中的 WIP_VERSION 常量

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
- **constants.ts**: 常量定义（表名、默认值、WIP_VERSION 等）
- **current-project.ts**: 当前工程 ID 持久化工具（读取/写入 `settings` 表）
- **xml-version-engine.ts**: XML 版本恢复引擎（通过 Diff 链重放恢复历史版本）
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
  id: string; // UUID 主键
  project_uuid: string; // 关联项目
  semantic_version: string; // 当前固定为 "latest"
  source_version_id: string; // 父版本 UUID，关键帧为 ZERO_SOURCE_VERSION_ID
  is_keyframe: boolean; // true = 存储完整 XML，false = 存储 diff-match-patch 字符串
  diff_chain_depth: number; // 距离最近关键帧的链长
  xml_content: string; // 根据 is_keyframe 存储完整 XML 或 diff 字符串
  metadata: Record<string, unknown> | null; // 预留字段（当前为空）
  page_count: number; // DrawIO 页面数量，>=1
  page_names?: string; // JSON 字符串，记录所有页面名称
  preview_svg?: Blob | Buffer; // 第一页 SVG 预览
  pages_svg?: Blob | Buffer; // 所有页面 SVG 序列化数据
  preview_image?: Blob | Buffer;
  created_at: number; // 创建时间戳
}
```

#### Conversations 表

聊天会话表，关联项目与 XML 版本

```typescript
interface Conversation {
  id: string;
  project_uuid: string;
  title: string;
  created_at: number;
  updated_at: number;
}
```

#### Messages 表

聊天消息明细表，记录模型元数据与工具调用

```typescript
interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  tool_invocations?: string; // JSON 字符串
  model_name?: string | null; // 关联的 LLM 模型
  xml_version_id?: string; // 关联的 XML 版本 UUID
  created_at: number;
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
    id: string,
    projectUuid?: string,
  ): Promise<XMLVersion | null>;
  abstract getLatestXML(project_uuid: string): Promise<XMLVersion | null>;
  abstract saveXMLVersion(version: XMLVersion): Promise<void>;
  abstract deleteXMLVersion(id: string, projectUuid?: string): Promise<void>;

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

> ⚠️ **2025-11-17 更新**：`getConversationsByXMLVersion` 已彻底移除，所有对话必须通过 `getConversationsByProject(projectUuid)` 查询。前端 Hook（`useStorageConversations`）和 Electron IPC 不再暴露 XML 版本维度查询，避免跨端行为不一致。

### 辅助工具

#### current-project.ts - 当前工程 ID 持久化

**功能**: 管理当前激活工程 ID 的存储和读取

```typescript
// 读取当前工程 ID（从 settings 表）
export async function getStoredCurrentProjectId(
  storage: StorageAdapter,
): Promise<string | null>;

// 持久化当前工程 ID
export async function persistCurrentProjectId(
  projectId: string,
  storage: StorageAdapter,
): Promise<void>;
```

**使用场景**:

- `useCurrentProject` Hook 加载和切换工程时
- 确保刷新页面后恢复到上次激活的工程

#### xml-version-engine.ts - XML 版本恢复引擎

**功能**: 通过 Diff 链重放恢复任意历史版本的完整 XML

**核心函数**:

```typescript
export async function restoreXMLFromVersion(
  versionId: string,
  storage: StorageAdapter,
): Promise<string>;
```

**工作原理**:

1. **查找目标版本**: 根据 `versionId` 获取版本记录
2. **关键帧检测**: 如果是关键帧（`is_keyframe=true`），直接返回完整 XML
3. **构建 Diff 链**: 向上追溯 `source_version_id`，直到找到关键帧
4. **Diff 重放**: 从关键帧开始，依次应用 Diff 补丁（使用 `diff-match-patch`）
5. **返回结果**: 返回完整恢复的 XML 内容

**使用场景**:

- 版本回滚功能（恢复到历史版本）
- 版本导出功能（导出历史版本的完整 DrawIO 文件）
- 版本对比功能（对比不同版本的 XML 差异）

**错误处理**:

- 版本不存在 → 抛出错误
- Diff 链断裂（找不到父版本）→ 抛出错误
- Diff 应用失败 → 抛出错误

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

#### 3. 使用版本恢复引擎

```typescript
import { restoreXMLFromVersion } from "@/lib/storage/xml-version-engine";
import { getStorage } from "@/lib/storage";

// 恢复历史版本
const storage = await getStorage();
const xml = await restoreXMLFromVersion("version-uuid", storage);
```

### SQLite 实现细节

- **数据库文件**: `electron/storage/drawio2go.db`
- **同步 API**: 使用 better-sqlite3 的同步 API
- **事务支持**: 支持事务操作保证原子性
- **索引优化**: 为常用查询字段创建索引

### IndexedDB 实现细节

- **数据库名称**: `drawio2go`
- **对象存储**: 每个表对应一个对象存储（Object Store）
- **索引**: 为查询字段创建索引提升性能

### 数据库迁移机制（2025-11-17 生效）

- **Web (IndexedDB)**: `app/lib/storage/migrations/indexeddb/` 维护版本化脚本，当前 `v1` 负责创建 `settings/projects/xml_versions/conversations/messages` 及其索引。`IndexedDBStorage.initialize()` 的 `openDB(..., { upgrade })` 仅调用迁移脚本，不再删除已有 Object Store。
- **Electron (SQLite)**: 主进程 `SQLiteManager` 在初始化时调用 `electron/storage/migrations/runSQLiteMigrations()`，根据 `pragma user_version` 依次执行 `v1` 脚本并写回最新版本号。
- **版本策略**: 现有结构视为 v1，后续 schema 升级只需新增迁移文件并递增版本号，无需强制清库。IndexedDB/SQLite 的升级逻辑必须保持幂等。

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

#### 版本管理架构（已实现）

**当前实现：WIP 工作区 + 关键帧 + Diff 混合存储**

- **WIP 工作区**（v0.0.0）：实时自动保存，不计入历史版本
- **关键帧快照**：存储完整 XML 内容（`is_keyframe=true`）
- **Diff 链**：使用 diff-match-patch 存储与父版本的差异
- **自动刷新关键帧**：差异率 >70% 或链长 >10 时自动创建关键帧

**核心特性：**

- **语义化版本号**：支持 major.minor.patch 版本格式
- **版本树结构**：通过 `source_version_id` 构建版本依赖关系
- **空间优化**：Diff 存储减少空间占用，关键帧保证恢复性能
- **版本回滚**：支持恢复到任意历史版本
- **版本导出**：支持导出任意版本为 DrawIO 文件

**相关文件：**

- `storage/xml-version-engine.ts` - 版本恢复引擎（Diff 重放）
- `storage/constants.ts` - 版本常量（WIP_VERSION, ZERO_SOURCE_VERSION_ID）
- `app/components/version/` - 版本管理 UI 组件
- `app/hooks/useStorageXMLVersions.ts` - 版本管理 Hook

## 类型定义

所有公共类型位于 `../types/drawio-tools.ts` 和 `storage/types.ts`，包含：

- 前端桥接返回结果（`GetXMLResult` / `ReplaceXMLResult` / `XMLValidationResult`）
- `drawio_read` 查询结果结构
- `drawio_edit_batch` 支持的操作及返回值
- 存储层接口和表结构类型

## 代码腐化清理记录

### 2025-11-23 清理（统一写入管线）

**执行的操作**：
- 新增 `storage/writers.ts` 统一 WIP/历史版本写入管线（归一化、元数据、事件派发）
- 新增 `format-utils.ts` 统一日期格式化（formatVersionTimestamp, formatConversationDate）
- 在 `drawio-xml-utils.ts` 中新增 `validateXMLFormat()` 统一 XML 验证逻辑
- 在 `drawio-xml-service.ts` 引入 DOMParser/XMLSerializer 缓存机制
- 在 `utils.ts` 新增 `runStorageTask()` 和 `withTimeout()` 工具函数
- `drawio-tools.ts`、`drawio-ai-tools.ts` 改用统一写入管线，删除重复逻辑

**影响文件**：7 个文件

**下次关注**：
- writers 管线事件顺序与前端订阅的兼容性
- 日期格式化的时区一致性（UTC→本地）验证

### 2025-11-23 清理

**执行的操作**：

- 修复 `drawio-xml-service.ts` 双重回滚职责冲突：当前端已通过 `drawio_syntax_error` 完成回滚时，服务端跳过二次回滚
- 清理重复的类型别名：`ReplaceResult` → 直接使用 `ReplaceXMLResult` 接口

**影响文件**：2 个（`drawio-xml-service.ts`, `../types/drawio-tools.ts`）

**下次关注**：

- `drawio-tools.ts` 与 `useStorageXMLVersions.ts` 的 WIP 写入逻辑差异（当前为合理的功能区分，暂不合并）
- XML 归一化调用链的性能优化机会（多处调用 `normalizeDiagramXml`）
