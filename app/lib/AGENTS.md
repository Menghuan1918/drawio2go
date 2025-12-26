# 工具库

## 概述

汇总应用层工具函数与前端工具执行能力，负责 DrawIO XML 的读取、写入与（v1.1）前端侧工具执行。

## 工具文件清单

- **constants/tool-names.ts**: 工具名称常量与类型定义（AI 工具 / 前端执行工具）
- **constants/tool-config.ts**: 工具默认超时配置（毫秒），覆盖所有工具
- **drawio-tools.ts**: 浏览器端的 XML 存储桥接（统一存储抽象层 + 事件通知），包含 `waitForMergeValidation()`（返回含 `requestId/context/rawError` 的 merge 结果）
- **frontend-tools.ts**: 前端 AI 工具定义与执行（`drawio_read` / `drawio_edit_batch`），通过注入回调直接读取/写入编辑器 XML
- **schemas/drawio-tool-schemas.ts**: DrawIO AI 工具参数的统一 Zod Schema 单一真源（含类型导出）
- **svg-export-utils.ts**: DrawIO 多页面 SVG 导出工具（页面拆分、单页 XML 重建、结果序列化）
- **compression-utils.ts**: Web/Node 共享的 `CompressionStream` / `DecompressionStream` deflate-raw 压缩工具
- **drawio-xml-utils.ts**: XML 归一化工具，支持裸 XML / data URI / Base64，并自动解压 `<diagram>` 内的 DrawIO 压缩内容（deflate + base64 + encodeURIComponent）
- **storage/writers.ts**: 统一的 WIP/历史版本写入管线（归一化 + 页面元数据 + 关键帧/Diff 计算 + 事件派发）
- **svg-smart-diff.ts**: SVG 智能差异对比引擎（基于 data-cell-id + 几何语义匹配的元素级高亮）
- **config-utils.ts**: LLM 配置规范化工具（默认值、类型校验、URL 规范化）
- **prompt-template.ts**: 系统提示词模板变量替换（{{theme}} / {{knowledge}}）
- **model-factory.ts**: 服务器侧模型工厂：按 `providerType` 创建 AI SDK `LanguageModel`（供 `/api/ai-proxy` 使用）
- **error-classifier.ts**: 服务器侧错误分类：将错误归一化为 `{ statusCode, code, message }`（供 `/api/ai-proxy` 使用）
- **model-capabilities.ts**: 模型能力白名单与查找辅助函数（supportsThinking / supportsVision）
- **model-icons.ts**: 模型与供应商图标映射工具（@lobehub/icons 品牌图标 + lucide fallback，按模型规则/供应商/通用优先级）
- **version-utils.ts**: 语义化版本号工具（解析、过滤子版本、子版本计数与递增推荐）
- **format-utils.ts**: 统一的日期格式化工具（版本时间戳、会话日期）
- **select-utils.ts**: HeroUI Select 选择值提取与标准化工具，消除重复实现
- **image-utils.ts**: 图片工具层（校验/尺寸获取/Base64/压缩解压），用于视觉模型输入与存储策略对齐
- **image-message-utils.ts**: 图片消息发送工具（File→Data URL、附件持久化、AttachmentItem→ImagePart 转换），用于 Chat 发送侧集成
- **utils.ts**: 通用工具函数（debounce 防抖函数，支持 flush/cancel 方法；runStorageTask、withTimeout）
- **logger.ts**: 轻量日志工厂（`createLogger(componentName)`），自动加组件前缀并支持 debug/info/warn/error 级别过滤
- **error-handler.ts**: 通用错误处理工具（AppError + i18n 翻译 + API/Toast 友好消息）
- **error-utils.ts**: 轻量错误提取与归一化（unknown → message/string/Error），用于 UI/Hook 层保持既有行为
- **drainable-tool-queue.ts**: 可等待清空的工具执行队列，确保 onFinish 等待所有工具完成后再保存消息和释放锁
- **chat-run-state-machine.ts**: 聊天运行状态机，统一管理会话生命周期状态，避免 ref 竞态条件
- **message-sync-state-machine.ts**: 消息同步状态机，统一管理消息同步状态（storage ↔ UI），避免循环同步和竞态条件
- **set-utils.ts**: Set 相关通用工具函数（比较、全选判断、从页面列表构建 ID Set）

### svg-export-utils.ts

- `parsePages(xml)`: 解析 `<diagram>` 列表，返回页面元数据
- `createSinglePageXml(diagram)`: 生成单页 mxfile，保持元数据
- `exportAllPagesSVG(editor, fullXml)`: 顺序导出多页 SVG，自动恢复原始 XML
- `serializeSVGsToBlob` / `deserializeSVGsFromBlob`: 使用 `compression-utils` 压缩/解压 SVG 数据

### compression-utils.ts

- 统一入口：使用原生 `CompressionStream/DecompressionStream` 实现 deflate-raw 压缩
- 支持 Node.js v17+ 和现代浏览器
- 避免重复实现压缩逻辑

### svg-smart-diff.ts

**SVG 智能差异对比引擎** - 基于 `data-cell-id` + 几何语义的元素级匹配与视觉高亮

#### 核心功能

- **多阶段匹配**: data-cell-id 精确匹配 → 剩余元素按几何尺寸/位置/文本打分
- **差异分类**: matched / changed / onlyA / onlyB 四个类别
- **视觉高亮**: 自动缩放对齐，使用混合模式和滤镜显示差异
- **自动 ID 补充**: 未标记元素自动生成 `auto-x` 确保定位稳定

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

使用 multiply 混合模式和 CSS 变量高亮：匹配(32%透明度)、删除(红)、新增(绿)、变更(黄)

#### 使用场景

- `VersionCompare` 组件的版本差异可视化
- 提供详细的匹配统计（matched / changed / onlyA / onlyB）

### storage/

统一存储抽象层（适配器模式），详见 `app/lib/storage/AGENTS.md`

**核心设计原则：**

- **适配器模式**: 定义统一接口，支持 SQLite (Electron) 和 IndexedDB (Web)
- **环境自适应**: 运行时检测环境，自动选择实现
- **类型安全**: 完整 TypeScript 类型定义

**主要文件：**

- **adapter.ts**: 抽象基类 `StorageAdapter`，定义统一接口
- **sqlite-storage.ts**: SQLite 实现（Electron）
- **indexeddb-storage.ts**: IndexedDB 实现（Web）
- **storage-factory.ts**: 工厂函数，运行时创建实例
- **types.ts**: 共享类型定义
- **constants.ts**: 常量（表名、WIP_VERSION 等）
- **current-project.ts**: 当前工程 ID 持久化
- **xml-version-engine.ts**: XML 版本恢复引擎（Diff 重放）

#### 核心 API

所有存储实现继承 `StorageAdapter` 接口：

```typescript
// Projects 表操作
abstract getProject(uuid: string): Promise<Project | null>;
abstract getAllProjects(): Promise<Project[]>;
abstract saveProject(project: Project): Promise<void>;
abstract deleteProject(uuid: string): Promise<void>;

// XMLVersions 表操作
abstract getXMLVersion(id: string): Promise<XMLVersion | null>;
abstract getLatestXML(project_uuid: string): Promise<XMLVersion | null>;
abstract saveXMLVersion(version: XMLVersion): Promise<void>;
abstract deleteXMLVersion(id: string): Promise<void>;

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
```

#### 表结构概览

| 表名              | 主要字段                                                                             | 说明                 |
| ----------------- | ------------------------------------------------------------------------------------ | -------------------- |
| **Projects**      | uuid, name, created_at, updated_at                                                   | 项目元数据           |
| **XMLVersions**   | id, project_uuid, semantic_version, is_keyframe, xml_content, page_count, created_at | XML 版本与关键帧管理 |
| **Conversations** | id, project_uuid, title, created_at, updated_at                                      | 聊天会话             |
| **Messages**      | id, conversation_id, role, content, model_name, xml_version_id, created_at           | 消息明细             |
| **Settings**      | key, value, updated_at                                                               | 应用全局设置         |

#### 版本管理架构

**混合存储策略：**

- **WIP 工作区** (v0.0.0): 实时自动保存，不计历史
- **关键帧** (is_keyframe=true): 存储完整 XML，周期性创建
- **Diff 链** (is_keyframe=false): 存储与父版本的差异，使用 diff-match-patch

**恢复流程：**

1. 关键帧直接返回完整 XML
2. 非关键帧向上追溯关键帧
3. 从关键帧依次应用 Diff 补丁

#### 使用示例

```typescript
import { createStorage } from "@/lib/storage";

// 创建存储实例
const storage = await createStorage();
await storage.initialize();

// 保存项目
const project = {
  uuid: "...",
  name: "my-project",
  created_at: Date.now(),
  updated_at: Date.now(),
};
await storage.saveProject(project);

// 恢复历史版本
import { restoreXMLFromVersion } from "@/lib/storage/xml-version-engine";
const xml = await restoreXMLFromVersion("version-id", storage);
```

**Schema 初始化** (2025-12-07 破坏性更新):

- 迁移脚本已移除，v1 即当前完整 Schema（含流式字段 is_streaming/streaming_since）
- IndexedDB / SQLite 在初始化阶段直接建表，`DB_VERSION` / `pragma user_version` 固定为 1
- 目前允许破坏性变更，必要时可提升版本并清库，无需编写迁移脚本

## DrawIO 工具执行（v1.1）

- 后端不再执行任何 DrawIO 工具；工具执行全部迁移到前端（见 `frontend-tools.ts` 与 `components/ChatSidebar.tsx`）。
- `/api/ai-proxy` 仅负责转发到 AI Provider（纯 HTTP/BFF 代理），不注入/不执行 DrawIO 工具。

## 浏览器端存储工具（`drawio-tools.ts`）

- 使用统一存储抽象层（Electron: SQLite, Web: IndexedDB）
- 提供 `getDrawioXML()`、`replaceDrawioXML()`、`saveDrawioXML()` 三个接口
- 通过 `drawio-xml-updated` 自定义事件通知编辑器更新
- `replaceDrawioXML` 新增 `skipExportValidation`：AI merge 场景（`drawio_edit_batch`）信任 `drawio-merge-success`，跳过 export 校验；完整 load/overwrite 仍保留验证
- export 校验仅比较关键语义（mxCell 数量与 id 集合），避免因属性排序/默认值导致误报
- XML 归一化在 `storage/writers.prepareXmlContext` 统一处理
- **WIP 工作区**: 实时自动保存到 v0.0.0，不计入历史版本，每次写入刷新时间戳

## 配置规范化工具（`config-utils.ts`）

- **默认常量**: `DEFAULT_SYSTEM_PROMPT`, `DEFAULT_API_URL`（默认空字符串，不预置任何供应商）
- **LLM 存储键**: `settings.llm.providers`, `settings.llm.models`, `settings.llm.agent`, `settings.llm.activeModel`
- **默认数据**: `DEFAULT_PROVIDERS` / `DEFAULT_MODELS`（默认空数组）/ `DEFAULT_AGENT_SETTINGS` / `DEFAULT_ACTIVE_MODEL`（默认 null）
- **核心函数**: `isProviderType()` / `normalizeApiUrl()` / `normalizeAnthropicApiUrl()` / `normalizeProviderApiUrl()` / `initializeDefaultLLMConfig()`
- **用途**: 验证 provider 合法性，规范化 API URL；`initializeDefaultLLMConfig()` 仅用于清理旧键与兼容迁移（不再写入默认 provider/model）

## 其他工具函数

### version-utils.ts - 语义化版本管理

```typescript
export function parseVersion(version: string): {
  major: number;
  minor: number;
  patch: number;
};
export function formatVersion({ major, minor, patch }): string;
export function recommendNextVersion(
  versions: string[],
  type: "major" | "minor" | "patch",
): string;
export function sortVersions(versions: string[]): string[];
```

**使用场景：** 版本号解析、版本排序、推荐下一个版本号

### format-utils.ts - 日期格式化

```typescript
export function formatVersionTimestamp(timestamp: number): string;
export function formatConversationDate(timestamp: number): string;
```

**使用场景：** 版本创建时间显示、对话日期显示

### utils.ts - 通用工具

**防抖函数** (支持 flush/cancel):

```typescript
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number,
): DebouncedFunction<T>;
```

**异步工具**:

```typescript
export function runStorageTask<T>(
  fn: () => Promise<T>,
  timeout?: number,
): Promise<T>;
export function withTimeout<T>(
  promise: Promise<T>,
  timeout: number,
): Promise<T>;
```

**项目 UUID 生成**:

```typescript
export function generateProjectUUID(): string;
```

### dom-parser-cache.ts - DOM 缓存

```typescript
export function ensureParser(): {
  parser: DOMParser;
  serializer: XMLSerializer;
};
```

统一 DOMParser/XMLSerializer 缓存，避免重复创建实例

### logger.ts - 日志工厂

```typescript
import { createLogger } from "@/lib/logger";

const logger = createLogger("VersionSidebar");
logger.info("init", { projectId });
logger.warn("save:debounced", { pending: queue.length });
logger.error("save:failed", err);
```

**设计**：轻量级工厂，自动附加组件名前缀，暴露 `debug` / `info` / `warn` / `error` 四个级别，输出格式与浏览器/Electron 控制台兼容。

**使用最佳实践**：

- 在文件顶部创建单例 `logger`，避免在渲染中重复创建
- 日志 key 采用 `模块:动作` 命名，便于过滤（如 `autosave:debounce`）
- 传递结构化对象而非拼接字符串，方便后续接入日志收集
- 生产环境关闭 `debug`，保留 `info` 以上；高频路径使用防抖/采样避免噪声

### drainable-tool-queue.ts - 可等待工具队列

可等待清空的工具执行队列，确保 onFinish 等待所有工具完成后再保存消息和释放锁。

**核心功能**：

- 串行执行工具任务，保持执行顺序
- 提供 `drain()` 方法等待队列清空（**快照语义**：只等待调用时已入队的任务）
- 支持多个调用者同时等待队列清空
- 单个任务失败不影响队列继续执行
- 带超时保护（默认 60 秒），防止永久阻塞
- 支持 `cancel()` 丢弃未开始的任务（取消/断网等场景无需等待）

**主要 API**：

```typescript
class DrainableToolQueue {
  // 添加工具任务到队列
  enqueue(task: () => Promise<void>): void;

  // 等待队列清空（快照语义：只等待调用时已入队的任务）
  async drain(timeout?: number): Promise<void>;

  // 丢弃未开始的任务（不影响正在执行中的任务）
  cancel(): number;

  // 获取待执行任务数
  getPendingCount(): number;
}
```

**使用示例**：

```typescript
import { DrainableToolQueue } from "@/lib/drainable-tool-queue";

const toolQueue = new DrainableToolQueue();

// 添加工具任务
toolQueue.enqueue(async () => {
  await executeToolCall(toolCall);
});

// 等待所有工具完成
await toolQueue.drain();
```

**用途**：在 ChatSidebar 的 onFinish 回调中，等待所有工具执行完成后再保存消息和释放锁，解决工具队列与 onFinish 不同步的问题。

**单元测试**：

- `app/lib/__tests__/drainable-tool-queue.test.ts`

### chat-run-state-machine.ts - 聊天状态机

状态机管理聊天会话生命周期，避免使用 ref 导致的竞态条件。

**状态定义**：

- `idle`: 空闲，无活动请求
- `preparing`: 准备中（获取锁、验证输入）
- `streaming`: 流式响应中
- `tools-pending`: 工具执行中（流式已完成，等待工具）
- `finalizing`: 最终化（保存消息、释放锁）
- `cancelled`: 已取消
- `errored`: 出错

**状态转换路径**：

```
idle → preparing → streaming → finalizing → idle
                       ↓
                  tools-pending → finalizing → idle
```

**兜底转换（强制重置）**：

- `force-reset`: `preparing/streaming/tools-pending/finalizing/cancelled/errored → idle`

**主要 API**：

```typescript
class ChatRunStateMachine {
  // 获取当前状态
  getState(): ChatRunState;

  // 初始化上下文
  initContext(conversationId: string): void;

  // 获取当前上下文
  getContext(): ChatRunContext | null;

  // 清理上下文
  clearContext(): void;

  // 状态转换
  transition(event: ChatRunEvent): void;

  // 订阅状态变化
  subscribe(listener: (state, context) => void): () => void;
}
```

**上下文结构**：

```typescript
interface ChatRunContext {
  conversationId: string; // 目标会话 ID（替代 sendingSessionIdRef）
  lockAcquired: boolean; // 锁是否已获取
  abortController: AbortController | null;
  pendingToolCount: number;
  lastMessages: ChatUIMessage[];
}
```

**使用示例**：

```typescript
import { ChatRunStateMachine } from "@/lib/chat-run-state-machine";

const stateMachine = new ChatRunStateMachine();

// 初始化上下文
stateMachine.initContext(conversationId);
const ctx = stateMachine.getContext()!;
ctx.lockAcquired = true;

// 获取会话 ID（替代 sendingSessionIdRef.current）
const conversationId = ctx.conversationId;

// 状态转换
stateMachine.transition("submit");
stateMachine.transition("lock-acquired");

// 清理
stateMachine.clearContext();
```

**单元测试**：

- `app/lib/__tests__/chat-run-state-machine.test.ts`

**用途**：替代 ChatSidebar 中的 `sendingSessionIdRef`，统一管理会话 ID 和生命周期，消除多处清空 ref 导致的竞态问题。

### message-sync-state-machine.ts - 消息同步状态机

状态机管理消息同步状态（storage ↔ UI），避免使用 ref 导致的循环同步和竞态条件。

**状态定义**：

- `idle`: 无同步
- `storage-to-ui`: 存储 → UI
- `ui-to-storage`: UI → 存储
- `locked`: 流式时锁定同步

**状态转换路径**：

```
idle -[STORAGE_CHANGED]→ storage-to-ui -[SYNC_COMPLETE]→ idle
idle -[UI_CHANGED]→ ui-to-storage -[SYNC_COMPLETE]→ idle
* -[STREAM_START]→ locked -[STREAM_END]→ idle
```

**主要 API**：

```typescript
class MessageSyncStateMachine {
  // 获取当前状态
  getState(): MessageSyncState;

  // 状态转换
  transition(event: MessageSyncEvent): void;

  // 检查是否可以转换
  canTransition(event: MessageSyncEvent): boolean;

  // 订阅状态变化
  subscribe(
    listener: (
      state,
      context: {
        from: MessageSyncState;
        to: MessageSyncState;
        event: MessageSyncEvent;
      },
    ) => void,
  ): () => void;

  // 检查是否被锁定（流式中）
  isLocked(): boolean;

  // 检查是否正在同步
  isSyncing(): boolean;
}
```

**使用示例**：

```typescript
import { MessageSyncStateMachine } from "@/lib/message-sync-state-machine";

const syncStateMachine = new MessageSyncStateMachine();

// 流式开始，锁定同步
syncStateMachine.transition("stream-start");
console.log(syncStateMachine.isLocked()); // true

// 流式结束，解锁
syncStateMachine.transition("stream-end");

// 存储变更，同步到 UI
if (syncStateMachine.canTransition("storage-changed")) {
  syncStateMachine.transition("storage-changed");
  // ... 执行同步逻辑
  syncStateMachine.transition("sync-complete");
}

// UI 变更，同步到存储
if (
  !syncStateMachine.isLocked() &&
  syncStateMachine.canTransition("ui-changed")
) {
  syncStateMachine.transition("ui-changed");
  // ... 执行同步逻辑
  syncStateMachine.transition("sync-complete");
}
```

**单元测试**：

- `app/lib/__tests__/message-sync-state-machine.test.ts`

**用途**：替代 ChatSidebar 中的 `applyingFromStorageRef`，统一管理消息同步方向和状态，防止循环同步（storage → UI → storage）和流式时的干扰。

**核心优势**：

- **防止循环同步**: 明确同步方向，避免 storage 和 UI 之间的无限循环
- **流式保护**: 流式期间自动锁定同步，避免干扰正在进行的消息流
- **状态可见**: 通过状态机清晰展示当前同步状态，便于调试和监控
- **类型安全**: 所有状态转换都有类型检查，防止非法转换

## 工具链工作流

### 编辑流程

1. **前端编辑**: 用户在 DrawIO 编辑器修改图表
2. **自动保存**: 变更自动保存到 WIP 版本 (v0.0.0)
3. **版本创建**: 用户点击"创建版本"，从 WIP 复制并生成语义化版本号
4. **版本存储**:
   - 第一个版本存储为关键帧 (is_keyframe=true)
   - 后续版本与前一版本计算 Diff (is_keyframe=false)
   - 差异率 >70% 或链长 >10 时自动创建关键帧

### AI 工具调用流程

```
用户提示词
  ↓
LLM 决策调用工具
  ↓
drawio_read (查询 XML) 或 drawio_edit_batch (修改 XML)
  ↓
HTTP 流式响应将 tool-call 下发到前端
  ↓
前端 drawio-tools.ts 执行
  ↓
返回结果给 LLM
  ↓
LLM 继续对话或生成新的工具调用
```

### XML 处理流程

```
原始 XML (data: URI 或 Base64 或裸 XML)
  ↓
drawio-xml-utils.ts 归一化
  ↓
自动解压 <diagram> 内的 DrawIO 压缩内容
  ↓
验证 XML 格式
  ↓
存储或编辑
```

## 类型定义

所有公共类型位于 `../types/drawio-tools.ts` 和 `storage/types.ts`，包含：

- 前端桥接返回结果（`GetXMLResult` / `ReplaceXMLResult` / `XMLValidationResult`）
- `drawio_read` 查询结果结构
- `drawio_edit_batch` 支持的操作及返回值
- 存储层接口和表结构类型

## 常见使用模式

### 保存 XML 到存储

```typescript
import { saveDrawioXML } from "@/lib/drawio-tools";

// 自动处理 Base64 解码、XML 验证、元数据提取
await saveDrawioXML(xmlContent, { skipValidation: false });
```

### 恢复历史版本

```typescript
import { restoreXMLFromVersion } from "@/lib/storage/xml-version-engine";
import { getStorage } from "@/lib/storage";

const storage = await getStorage();
const xml = await restoreXMLFromVersion("version-id", storage);
// 可用于版本回滚、导出等功能
```

### 生成版本差异预览

```typescript
import { generateSmartDiffSvg } from "@/lib/svg-smart-diff";

const result = generateSmartDiffSvg(oldSvgString, newSvgString);
console.log(result.stats); // { matched, changed, onlyA, onlyB, coverage }
// 用于版本对比组件显示差异高亮
```

### AI 工具使用

```typescript
// 在 LLM 工具定义中使用
const tools = [
  {
    name: "drawio_read",
    description: "读取 DrawIO XML 内容或特定部分",
    inputSchema: {
      type: "object",
      properties: {
        xpath: { type: "string", description: "可选 XPath 表达式" }
      }
    }
  },
  {
    name: "drawio_edit_batch",
    description: "批量修改 DrawIO XML",
    inputSchema: {
      type: "object",
      properties: {
        operations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { enum: ["set_attribute", "remove_attribute", ...] },
              xpath: { type: "string" },
              ...
            }
          }
        }
      }
    }
  }
];
```

## 代码优化与清理历史

- **2025-11-23**: 新增 `storage/writers.ts` 统一 WIP/历史版本写入管线，新增 `format-utils.ts` 日期格式化工具
- **2025-11-24**: 新增 `dom-parser-cache.ts` 统一 DOM 缓存，统一工程 UUID 生成策略，新增 `logger.ts` 日志工厂

## 性能优化建议

### XML 处理优化

- **缓存 DOMParser**: 使用 `dom-parser-cache.ts` 避免重复创建实例
- **批量编辑**: 优先使用 `drawio_edit_batch` 而非多次单个操作
- **XPath 查询**: 避免过于复杂的 XPath 表达式，优先使用简单的路径定位
- **XML 归一化**: 仅在保存时执行，读取时跳过验证加快速度

### 版本管理优化

- **关键帧周期**: 配置自动创建关键帧的间隔（差异率 >70% 或链长 >10）
- **Diff 链清理**: 定期删除不再需要的中间版本（避免链过长）
- **版本导出**: 大文件导出前考虑分页处理

### 存储访问优化

- **批量查询**: 使用 `getAllProjects()` 而非循环调用 `getProject()`
- **事务操作**: 多个相关操作应放在事务中处理（SQLite）
- **索引利用**: 查询时使用索引字段（project_uuid, created_at 等）

## 常见问题与解决方案

### 版本恢复失败

**问题**: "Diff 链断裂" 错误
**原因**: 中间版本被删除，恢复链中断
**解决**:

- 检查版本列表确认是否有断层
- 从最近的可恢复版本重新分支
- 避免删除非 WIP 版本

### XML 保存失败

**问题**: "Invalid XML" 或 "Encoding error"
**原因**: XML 编码格式不规范（Base64、data:URI 等）
**解决**:

- 确保调用 `drawio-xml-utils.normalizeDiagramXml()`
- 检查是否包含 DrawIO 压缩内容（deflate + base64）
- 验证字符编码为 UTF-8

### 代理/跨域 HTTP 请求失败（v1.1）

**问题**: "Failed to fetch" / "NetworkError" / 502/504
**原因**: 代理目标不可用、CORS/证书问题、网络离线或 Next.js 服务未启动
**解决**:

- 确认 `/api/ai-proxy` 可访问（必要时先看 `/api/health`）
- 检查 Settings 中的 `apiUrl`/模型配置是否可达
- 查看浏览器 DevTools Network 与 Console 日志定位失败原因

### 大文件导出超时

**问题**: "Timeout" 错误
**原因**: 多页 SVG 导出耗时过长
**解决**:

- 增加超时时间（`withTimeout` 参数）
- 考虑分页导出
- 检查编辑器性能（大量图形元素）

## 开发建议

### 添加新工具函数

1. 在 `app/lib/` 中新建文件 (如 `new-tool.ts`)
2. 导出公共接口和类型定义
3. 在 `app/lib/index.ts` 统一导出
4. 更新本文档 (工具文件清单)
5. 编写使用示例和测试

### 修改存储层

1. **Schema 变更**：直接更新建表逻辑（`indexeddb-storage.ts` / `electron/storage/sqlite-manager.js`），保持 v1 内联
2. **版本号**：必要时递增 `DB_VERSION` / `pragma user_version`，当前阶段可接受清库
3. **兼容性**：暂不维护迁移脚本，若需保留数据需另行设计迁移方案
4. **测试**：验证 Web 与 Electron 均能正常初始化、读写

### 添加 AI 工具

1. 在 `frontend-tools.ts` 中定义新工具
2. 使用 Zod 定义参数 schema
3. 在 `ChatSidebar`（或其他前端 `useChat` 调用方）注册/暴露工具给聊天层（`onToolCall`）
4. 编写测试覆盖 success/error 路径（如有测试体系）

## 关键注意事项

1. **XML 规范化必须进行**: 保存前务必调用 `drawio-xml-utils.ts` 的规范化函数，处理各种编码格式
2. **Diff 链断裂会失败**: 版本恢复依赖完整的 Diff 链，删除中间版本会导致恢复失败
3. **WIP 版本特殊性**: WIP (v0.0.0) 不计历史，不能被恢复，用户操作前应告知此限制
4. **跨端行为一致性**: 存储层接口统一，Web/Electron 实现必须保证行为完全一致
5. **迁移脚本幂等性**: 数据库迁移脚本必须可重复执行，不能因重复运行而损坏数据
6. **工具顺序执行**: `drawio_edit_batch` 从上到下依次执行，遇到失败/阻塞立即停止并返回失败原因；此前已成功的操作会保留
7. **日志级别控制**: 生产环境应关闭 debug 级别日志，避免性能影响

## 代码腐化清理记录

### 2025-12-22 清理

**执行的操作**：

- 新增 `error-utils.ts` 与 `set-utils.ts`，合并重复工具函数并提供统一导出
- 调用方（hooks/components）改用 lib 统一能力，减少散落的错误/集合处理实现

**影响文件**：2 个文件（error-utils.ts、set-utils.ts）

**下次关注**：

- 继续收敛各模块中的“临时错误字符串”为结构化错误（码 + i18n）
- 检查 lib 层工具的命名与导出边界，避免循环依赖

### 2025-12-08 清理

**执行的操作**：

- 移除 `resetDomParserCache` 死代码，缓存管理保持内部自维护。
- UUID 生成、版本格式化、错误消息提取分别集中到 `utils.ts` / `version-utils.ts` / `error-handler.ts`，消除重复实现。
- 新增 `blob-utils.ts` 统一二进制/Blob 转换，便于版本 SVG 与存储层共享。
- 增补 `buildXmlError` / `buildToolError`，统一工具调用与存储错误结构。

**影响文件**：5 个（dom-parser-cache.ts、utils.ts、version-utils.ts、error-handler.ts、blob-utils.ts）

**下次关注**：

- 检查所有调用方是否已迁移到新错误构建器与 UUID/版本工具。
- 观察 blob-utils 在浏览器/Electron 的兼容性与性能表现。
