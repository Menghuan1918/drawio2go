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
- **logger.ts**: 轻量日志工厂（`createLogger(componentName)`），自动加组件前缀并支持 debug/info/warn/error 级别过滤
- **error-handler.ts**: 通用错误处理工具（AppError + i18n 翻译 + API/Toast 友好消息）

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

**迁移机制** (2025-11-17):

- IndexedDB: `migrations/indexeddb/v*.ts` 负责初始化和升级
- SQLite: 主进程 `migrations/v*.js` 根据 `pragma user_version` 依次执行
- 升级逻辑必须幂等，禁止强制清库

## DrawIO Socket.IO 调用流程

1. 后端工具通过 `executeToolOnClient()` 获取当前 XML 或请求前端写入
2. 前端（`useDrawioSocket` + `drawio-tools.ts`）访问统一存储层并响应请求
3. 服务端使用 `drawio-xml-service.ts` 对 XML 进行 XPath 查询或批量操作
4. 编辑完成后再次通过 Socket.IO 将新 XML 写回前端

## DrawIO XML 转接层（`drawio-xml-service.ts`）

- **XPath 驱动**: 所有查询与编辑通过 XPath 定位节点
- **原子性**: 批量操作全部成功后才写回，失败时无副作用
- **无推断**: 仅处理 XPath 与原始字符串，不做领域特化解析
- **支持操作**: `set_attribute`, `remove_attribute`, `insert_element`, `remove_element`, `replace_element`, `set_text_content`
- **主要函数**: `executeDrawioRead()` 查询，`executeDrawioEditBatch()` 批量编辑

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
- 提供 `getDrawioXML()`、`replaceDrawioXML()`、`saveDrawioXML()` 三个接口
- 通过 `drawio-xml-updated` 自定义事件通知编辑器更新
- XML 归一化在 `storage/writers.prepareXmlContext` 统一处理
- **WIP 工作区**: 实时自动保存到 v0.0.0，不计入历史版本，每次写入刷新时间戳

## 配置规范化工具（`config-utils.ts`）

- **默认常量**: `DEFAULT_SYSTEM_PROMPT`, `DEFAULT_API_URL`, `DEFAULT_LLM_CONFIG`
- **核心函数**: `isProviderType()` / `normalizeApiUrl()` / `normalizeLLMConfig()`
- **用途**: 验证 provider 合法性，规范化 API URL，设置默认值

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
export function createLogger(componentName: string): Logger;
```

支持 debug/info/warn/error 级别，自动加组件前缀

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
Socket.IO 传递到前端
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

### 跨域 Socket.IO 连接失败

**问题**: "Socket connection failed"
**原因**: CORS 配置或服务器离线
**解决**:

- 检查 Socket.IO 服务器配置
- 确认前后端域名/端口一致
- 查看浏览器网络标签页日志

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

1. **Schema 变更**: 新增迁移文件 `migrations/indexeddb/vN.ts` 和 `migrations/vN.js`
2. **递增版本号**: 更新迁移脚本中的版本检查
3. **向后兼容**: 迁移脚本必须处理旧版本数据
4. **测试**: 验证 Web 和 Electron 端均能正确升级

### 添加 AI 工具

1. 在 `drawio-ai-tools.ts` 中定义新工具
2. 使用 Zod 定义参数 schema
3. 在 `tool-executor.ts` 中注册路由
4. 更新服务端工具处理逻辑
5. 编写测试覆盖 success/error 路径

## 关键注意事项

1. **XML 规范化必须进行**: 保存前务必调用 `drawio-xml-utils.ts` 的规范化函数，处理各种编码格式
2. **Diff 链断裂会失败**: 版本恢复依赖完整的 Diff 链，删除中间版本会导致恢复失败
3. **WIP 版本特殊性**: WIP (v0.0.0) 不计历史，不能被恢复，用户操作前应告知此限制
4. **跨端行为一致性**: 存储层接口统一，Web/Electron 实现必须保证行为完全一致
5. **迁移脚本幂等性**: 数据库迁移脚本必须可重复执行，不能因重复运行而损坏数据
6. **Socket.IO 原子性**: `drawio_edit_batch` 操作必须全部成功或全部失败，不允许部分修改
7. **日志级别控制**: 生产环境应关闭 debug 级别日志，避免性能影响
