# 工具库

## 概述

汇总应用层工具函数与前端工具执行能力，负责 DrawIO XML 的读取、写入与前端侧工具执行。

## 工具文件清单

| 文件                               | 功能                                                                |
| ---------------------------------- | ------------------------------------------------------------------- |
| **constants/tool-names.ts**        | 工具名称常量与类型定义                                              |
| **constants/tool-config.ts**       | 工具默认超时配置                                                    |
| **drawio-tools.ts**                | 浏览器端 XML 存储桥接（统一存储抽象层 + 事件通知）                  |
| **frontend-tools.ts**              | 前端 AI 工具定义与执行（`drawio_read` / `drawio_edit_batch`）       |
| **schemas/drawio-tool-schemas.ts** | DrawIO AI 工具参数的统一 Zod Schema                                 |
| **svg-export-utils.ts**            | DrawIO 多页面 SVG 导出工具                                          |
| **compression-utils.ts**           | Web/Node 共享的 deflate-raw 压缩工具                                |
| **drawio-xml-utils.ts**            | XML 归一化工具，自动解压 `<diagram>` 内的 DrawIO 压缩内容           |
| **storage/writers.ts**             | 统一 WIP/历史版本写入管线（归一化 + 页面元数据 + 关键帧/Diff 计算） |
| **svg-smart-diff.ts**              | SVG 智能差异对比引擎（基于 data-cell-id + 几何语义）                |
| **config-utils.ts**                | LLM 配置规范化工具（默认值、类型校验、URL 规范化）                  |
| **prompt-template.ts**             | 系统提示词模板变量替换                                              |
| **prompt-history.ts**              | 历史系统提示词版本记录与匹配（用于升级提醒）                        |
| **model-factory.ts**               | 服务器侧模型工厂（供 `/api/ai-proxy` 使用）                         |
| **error-classifier.ts**            | 服务器侧错误分类与归一化                                            |
| **model-capabilities.ts**          | 模型能力白名单与查找辅助函数                                        |
| **model-icons.ts**                 | 模型与供应商图标映射工具                                            |
| **version-utils.ts**               | 语义化版本号工具                                                    |
| **format-utils.ts**                | 统一日期格式化工具                                                  |
| **select-utils.ts**                | HeroUI Select 选择值提取与标准化工具                                |
| **image-utils.ts**                 | 图片工具层（校验/尺寸获取/Base64/压缩解压）                         |
| **image-message-utils.ts**         | 图片消息发送工具（File→Data URL、附件持久化）                       |
| **utils.ts**                       | 通用工具函数（debounce、runStorageTask、withTimeout）               |
| **logger.ts**                      | 轻量日志工厂（自动加组件前缀）                                      |
| **error-handler.ts**               | 通用错误处理工具（AppError + i18n 翻译）                            |
| **error-utils.ts**                 | 轻量错误提取与归一化                                                |
| **drainable-tool-queue.ts**        | 可等待清空的工具执行队列                                            |
| **chat-run-state-machine.ts**      | 聊天运行状态机                                                      |
| **message-sync-state-machine.ts**  | 消息同步状态机                                                      |
| **set-utils.ts**                   | Set 相关通用工具函数                                                |

## 核心工具模块

### svg-export-utils.ts

**核心 API**：

- `parsePages(xml)`: 解析 `<diagram>` 列表，返回页面元数据
- `createSinglePageXml(diagram)`: 生成单页 mxfile，保持元数据
- `exportAllPagesSVG(editor, fullXml)`: 顺序导出多页 SVG，自动恢复原始 XML
- `serializeSVGsToBlob` / `deserializeSVGsFromBlob`: 压缩/解压 SVG 数据

### compression-utils.ts

统一入口：使用原生 `CompressionStream/DecompressionStream` 实现 deflate-raw 压缩，支持 Node.js v17+ 和现代浏览器。

### svg-smart-diff.ts

**SVG 智能差异对比引擎** - 基于 `data-cell-id` + 几何语义的元素级匹配与视觉高亮

**核心功能**：

- **多阶段匹配**: data-cell-id 精确匹配 → 剩余元素按几何尺寸/位置/文本打分
- **差异分类**: matched / changed / onlyA / onlyB 四个类别
- **视觉高亮**: 自动缩放对齐，使用混合模式和滤镜显示差异
- **自动 ID 补充**: 未标记元素自动生成 `auto-x` 确保定位稳定

**主要函数**：

```typescript
export function generateSmartDiffSvg(
  leftSvg?: string,
  rightSvg?: string,
): SmartDiffResult; // 返回: { svg, stats, warnings }
```

**返回统计**：`{ matched, changed, onlyA, onlyB, coverage }`

### storage/

统一存储抽象层（适配器模式），详见 `app/lib/storage/AGENTS.md`

**核心设计**：

- **适配器模式**: 定义统一接口，支持 SQLite (Electron) 和 IndexedDB (Web)
- **环境自适应**: 运行时检测环境，自动选择实现
- **类型安全**: 完整 TypeScript 类型定义

**主要文件**：

- **adapter.ts**: 抽象基类 `StorageAdapter`
- **sqlite-storage.ts**: SQLite 实现（Electron）
- **indexeddb-storage.ts**: IndexedDB 实现（Web）
- **storage-factory.ts**: 工厂函数，运行时创建实例
- **types.ts**: 共享类型定义
- **constants.ts**: 常量（表名、WIP_VERSION 等）
- **current-project.ts**: 当前工程 ID 持久化
- **xml-version-engine.ts**: XML 版本恢复引擎（Diff 重放）

**表结构概览**：

| 表名              | 主要字段                                                       | 说明                 |
| ----------------- | -------------------------------------------------------------- | -------------------- |
| **Projects**      | uuid, name, created_at, updated_at                             | 项目元数据           |
| **XMLVersions**   | id, project_uuid, semantic_version, is_keyframe, xml_content   | XML 版本与关键帧管理 |
| **Conversations** | id, project_uuid, title, created_at, updated_at                | 聊天会话             |
| **Messages**      | id, conversation_id, role, content, model_name, xml_version_id | 消息明细             |
| **Settings**      | key, value, updated_at                                         | 应用全局设置         |

**版本管理架构**：

- **WIP 工作区** (v0.0.0): 实时自动保存，不计历史
- **关键帧** (is_keyframe=true): 存储完整 XML
- **Diff 链** (is_keyframe=false): 存储与父版本的差异

**恢复流程**：关键帧直接返回完整 XML；非关键帧向上追溯关键帧，从关键帧依次应用 Diff 补丁。

**Schema 初始化** (2025-12-07 破坏性更新):

- 迁移脚本已移除，v1 即当前完整 Schema
- IndexedDB / SQLite 在初始化阶段直接建表，`DB_VERSION` / `pragma user_version` 固定为 1
- 目前允许破坏性变更，必要时可提升版本并清库，无需编写迁移脚本

## DrawIO 工具执行（v1.1）

- 后端不再执行任何 DrawIO 工具；工具执行全部迁移到前端（见 `frontend-tools.ts` 与 `components/ChatSidebar.tsx`）
- `/api/ai-proxy` 仅负责转发到 AI Provider（纯 HTTP/BFF 代理），不注入/不执行 DrawIO 工具

## 浏览器端存储工具（`drawio-tools.ts`）

**核心 API**：

- `getDrawioXML()`: 查询 XML
- `replaceDrawioXML()`: 替换 XML（支持 `skipExportValidation`）
- `saveDrawioXML()`: 保存 XML
- `waitForMergeValidation()`: 等待 merge 结果（返回含 `requestId/context/rawError` 的结果）

**特性**：

- 使用统一存储抽象层（Electron: SQLite, Web: IndexedDB）
- 通过 `drawio-xml-updated` 自定义事件通知编辑器更新
- export 校验仅比较关键语义（mxCell 数量与 id 集合），避免误报
- XML 归一化在 `storage/writers.prepareXmlContext` 统一处理
- **WIP 工作区**: 实时自动保存到 v0.0.0，不计入历史版本

## 配置规范化工具（`config-utils.ts`）

**功能更新（基于最新代码）**：

- **默认常量**: `DEFAULT_SYSTEM_PROMPT`, `DEFAULT_API_URL`（默认为 OpenAI）
- **供应商默认 URL**: `DEFAULT_OPENAI_API_URL`, `DEFAULT_DEEPSEEK_API_URL`, `DEFAULT_ANTHROPIC_API_URL`, `DEFAULT_GEMINI_API_URL`
- **LLM 存储键**: `settings.llm.providers`, `settings.llm.models`, `settings.llm.agent`, `settings.llm.activeModel`
- **默认数据**: `DEFAULT_PROVIDERS` / `DEFAULT_MODELS`（默认空数组）/ `DEFAULT_AGENT_SETTINGS` / `DEFAULT_ACTIVE_MODEL`（默认 null）
- **技能配置**: `DEFAULT_SKILL_SETTINGS`（主题、知识库选择、自定义主题提示词）

**核心函数**：

- `isProviderType()`: 验证 provider 合法性（支持：openai-reasoning, openai-compatible, deepseek-native, anthropic, gemini）
- `normalizeApiUrl()`: 规范化 API URL（移除尾斜杠 + 自动补 /v1）
- `normalizeAnthropicApiUrl()`: Anthropic 专用规范化（不自动补 /v1，处理官方 URL 特殊情况）
- `normalizeGeminiApiUrl()`: Gemini 专用规范化（保持用户配置）
- `normalizeProviderApiUrl()`: 按供应商类型选择规范化策略
- `getDefaultApiUrlForProvider()`: 获取指定供应商的默认 API URL
- `normalizeLLMConfig()`: 规范化运行时 LLM 配置（合并默认值、类型校验、能力回退、技能配置）
- `initializeDefaultLLMConfig()`: 兼容性工具（仅清理旧键，不再写入默认 provider/model）

**通用设置**：

- `GeneralSettings`: 通用应用设置（侧边栏展开、默认文件路径）
- `DEFAULT_GENERAL_SETTINGS`: 默认值
- `STORAGE_KEY_GENERAL_SETTINGS`: 存储键

## 关键工具详解

### version-utils.ts - 语义化版本管理

```typescript
parseVersion(version: string): { major, minor, patch };
formatVersion({ major, minor, patch }): string;
recommendNextVersion(versions: string[], type): string;
sortVersions(versions: string[]): string[];
```

### format-utils.ts - 日期格式化

```typescript
formatVersionTimestamp(timestamp: number): string;
formatConversationDate(timestamp: number): string;
```

### utils.ts - 通用工具

```typescript
// 防抖函数（支持 flush/cancel）
debounce<T>(fn: T, delay: number): DebouncedFunction<T>;

// 异步工具
runStorageTask<T>(fn: () => Promise<T>, timeout?: number): Promise<T>;
withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T>;

// 项目 UUID 生成
generateProjectUUID(): string;
```

### dom-parser-cache.ts - DOM 缓存

```typescript
ensureParser(): { parser: DOMParser; serializer: XMLSerializer };
```

统一 DOMParser/XMLSerializer 缓存，避免重复创建实例。

### logger.ts - 日志工厂

```typescript
import { createLogger } from "@/lib/logger";

const logger = createLogger("VersionSidebar");
logger.info("init", { projectId });
logger.warn("save:debounced", { pending: queue.length });
logger.error("save:failed", err);
```

**设计**：轻量级工厂，自动附加组件名前缀，暴露 `debug` / `info` / `warn` / `error` 四个级别。

**最佳实践**：

- 在文件顶部创建单例 `logger`，避免在渲染中重复创建
- 日志 key 采用 `模块:动作` 命名，便于过滤
- 传递结构化对象而非拼接字符串
- 生产环境关闭 `debug`，保留 `info` 以上

### drainable-tool-queue.ts - 可等待工具队列

可等待清空的工具执行队列，确保 onFinish 等待所有工具完成后再保存消息和释放锁。

**核心功能**：

- 串行执行工具任务，保持执行顺序
- `drain()` 方法等待队列清空（**快照语义**：只等待调用时已入队的任务）
- 支持多个调用者同时等待队列清空
- 单个任务失败不影响队列继续执行
- 带超时保护（默认 60 秒），防止永久阻塞
- `cancel()` 丢弃未开始的任务

**主要 API**：

```typescript
class DrainableToolQueue {
  enqueue(task: () => Promise<void>): void;
  async drain(timeout?: number): Promise<void>;
  cancel(): number;
  getPendingCount(): number;
}
```

**单元测试**：`app/lib/__tests__/drainable-tool-queue.test.ts`

### chat-run-state-machine.ts - 聊天状态机

状态机管理聊天会话生命周期，避免使用 ref 导致的竞态条件。

**状态定义**：

- `idle`: 空闲
- `preparing`: 准备中（获取锁、验证输入）
- `streaming`: 流式响应中
- `tools-pending`: 工具执行中
- `finalizing`: 最终化（保存消息、释放锁）
- `cancelled`: 已取消
- `errored`: 出错

**状态转换路径**：

```
idle → preparing → streaming → finalizing → idle
                       ↓
                  tools-pending → finalizing → idle
```

**主要 API**：

```typescript
class ChatRunStateMachine {
  getState(): ChatRunState;
  initContext(conversationId: string): void;
  getContext(): ChatRunContext | null;
  clearContext(): void;
  transition(event: ChatRunEvent): void;
  subscribe(listener: (state, context) => void): () => void;
}
```

**上下文结构**：`{ conversationId, lockAcquired, abortController, pendingToolCount, lastMessages }`

**单元测试**：`app/lib/__tests__/chat-run-state-machine.test.ts`

### message-sync-state-machine.ts - 消息同步状态机

状态机管理消息同步状态（storage ↔ UI），避免循环同步和竞态条件。

**状态定义**：

- `idle`: 无同步
- `storage-to-ui`: 存储 → UI
- `ui-to-storage`: UI → 存储
- `locked`: 流式时锁定同步

**主要 API**：

```typescript
class MessageSyncStateMachine {
  getState(): MessageSyncState;
  transition(event: MessageSyncEvent): void;
  canTransition(event: MessageSyncEvent): boolean;
  subscribe(listener): () => void;
  isLocked(): boolean;
  isSyncing(): boolean;
}
```

**单元测试**：`app/lib/__tests__/message-sync-state-machine.test.ts`

**核心优势**：

- **防止循环同步**: 明确同步方向，避免无限循环
- **流式保护**: 流式期间自动锁定同步
- **状态可见**: 清晰展示当前同步状态
- **类型安全**: 所有状态转换都有类型检查

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
用户提示词 → LLM 决策调用工具 → drawio_read / drawio_edit_batch
  → HTTP 流式响应将 tool-call 下发到前端
  → 前端 drawio-tools.ts 执行 → 返回结果给 LLM
  → LLM 继续对话或生成新的工具调用
```

### XML 处理流程

```
原始 XML (data: URI 或 Base64 或裸 XML)
  → drawio-xml-utils.ts 归一化
  → 自动解压 <diagram> 内的 DrawIO 压缩内容
  → 验证 XML 格式 → 存储或编辑
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
await saveDrawioXML(xmlContent, { skipValidation: false });
```

### 恢复历史版本

```typescript
import { restoreXMLFromVersion } from "@/lib/storage/xml-version-engine";
import { getStorage } from "@/lib/storage";

const storage = await getStorage();
const xml = await restoreXMLFromVersion("version-id", storage);
```

### 生成版本差异预览

```typescript
import { generateSmartDiffSvg } from "@/lib/svg-smart-diff";

const result = generateSmartDiffSvg(oldSvgString, newSvgString);
console.log(result.stats); // { matched, changed, onlyA, onlyB, coverage }
```

## 性能优化建议

### XML 处理优化

- **缓存 DOMParser**: 使用 `dom-parser-cache.ts`
- **批量编辑**: 优先使用 `drawio_edit_batch`
- **XPath 查询**: 避免过于复杂的 XPath 表达式
- **XML 归一化**: 仅在保存时执行

### 版本管理优化

- **关键帧周期**: 配置自动创建关键帧的间隔（差异率 >70% 或链长 >10）
- **Diff 链清理**: 定期删除不再需要的中间版本
- **版本导出**: 大文件导出前考虑分页处理

### 存储访问优化

- **批量查询**: 使用 `getAllProjects()` 而非循环调用 `getProject()`
- **事务操作**: 多个相关操作应放在事务中处理（SQLite）
- **索引利用**: 查询时使用索引字段（project_uuid, created_at 等）

## 关键注意事项

1. **XML 规范化必须进行**: 保存前务必调用 `drawio-xml-utils.ts` 的规范化函数
2. **Diff 链断裂会失败**: 版本恢复依赖完整的 Diff 链，删除中间版本会导致恢复失败
3. **WIP 版本特殊性**: WIP (v0.0.0) 不计历史，不能被恢复，用户操作前应告知此限制
4. **跨端行为一致性**: 存储层接口统一，Web/Electron 实现必须保证行为完全一致
5. **工具顺序执行**: `drawio_edit_batch` 从上到下依次执行，遇到失败/阻塞立即停止并返回失败原因
6. **日志级别控制**: 生产环境应关闭 debug 级别日志，避免性能影响

## 开发建议

### 添加新工具函数

1. 在 `app/lib/` 中新建文件
2. 导出公共接口和类型定义
3. 在 `app/lib/index.ts` 统一导出
4. 更新本文档
5. 编写使用示例和测试

### 修改存储层

1. **Schema 变更**：直接更新建表逻辑，保持 v1 内联
2. **版本号**：必要时递增 `DB_VERSION` / `pragma user_version`，当前阶段可接受清库
3. **兼容性**：暂不维护迁移脚本
4. **测试**：验证 Web 与 Electron 均能正常初始化、读写

### 添加 AI 工具

1. 在 `frontend-tools.ts` 中定义新工具
2. 使用 Zod 定义参数 schema
3. 在 `ChatSidebar` 注册/暴露工具给聊天层（`onToolCall`）
4. 编写测试覆盖 success/error 路径

## 代码腐化清理记录

### 2025-12-31

**XML 解析优化：智能 xml_string 显示策略 + 子元素解析**

- **value 属性的 HTML 实体处理**: 移除了 `decodeHtmlEntities` 函数，改为依赖 DOM API 的标准行为
  - **读取时**: DOM API (`attribute.value`) 自动解码 HTML 实体（`&lt;div&gt;` → `<div>`），对 AI 更友好
  - **写回时**: `XMLSerializer` 自动编码回去（`<div>` → `&lt;div&gt;`），保持 XML 合法性
  - **注意**: 这是 XML DOM 标准行为，无法也无需修改
- **子元素解析**: 新增 `children` 字段，提取子元素的标签名和属性信息
  - 例如：`mxCell` 的 `mxGeometry` 子元素会被完整解析到 `children` 数组
  - 子元素结构：`{ tag_name: string, attributes: Record<string, string> }`
- **智能 xml_string 策略**:
  - 无子元素 → xml_string 为空
  - 有子元素，且所有子元素都是简单元素（只有属性，无嵌套）→ xml_string 为空
  - 子元素有嵌套（深度 > 1）→ 保留 xml_string
- **Token 优化效果**:
  - 对于简单结构（如 `mxCell` + `mxGeometry`），避免双倍输出，减少约 60% 的 token 消耗
  - 复杂嵌套结构仍保留 xml_string 以防信息丢失
- **影响文件**:
  - `app/lib/frontend-tools.ts`（collectAttributes + convertNodeToResult）
  - `app/types/drawio-tools.ts`（DrawioElementResult 类型定义）

### 2025-12-22

- 新增 `error-utils.ts` 与 `set-utils.ts`，合并重复工具函数
- 调用方改用 lib 统一能力，减少散落的错误/集合处理实现
- **影响文件**: 2 个

### 2025-12-08

- 移除 `resetDomParserCache` 死代码
- UUID 生成、版本格式化、错误消息提取分别集中到 `utils.ts` / `version-utils.ts` / `error-handler.ts`
- 新增 `blob-utils.ts` 统一二进制/Blob 转换
- 增补 `buildXmlError` / `buildToolError`，统一工具调用与存储错误结构
- **影响文件**: 5 个
