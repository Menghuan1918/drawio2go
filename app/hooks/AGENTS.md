# React Hooks

## 概述

封装统一存储层访问与 Socket.IO 通讯的 React Hooks，提供类型安全的状态管理接口。

## Hooks 清单

### 1. useStorageSettings

**应用设置持久化 Hook** - 管理 LLM 配置、默认路径等应用级设置

#### 核心方法

- `getSetting(key)` / `setSetting(key, value)` / `deleteSetting(key)` / `getAllSettings()`
- `getLLMConfig()` / `saveLLMConfig(config)`: 获取/保存 LLM 配置（自动规范化）
- `getDefaultPath()` / `saveDefaultPath(path)`: 获取/保存默认路径

**特性**: TypeScript 类型安全，自动规范化配置（补全默认值、验证 provider、规范化 URL）

### 2. useStorageProjects

**项目管理 Hook** - 管理 DrawIO 项目元数据

**核心方法**: `projects` / `createProject` / `updateProject` / `deleteProject`
**项目结构**: `uuid`, `name`, `description`, `created_at`, `updated_at`

### 3. useCurrentProject

**当前工程 Hook** - 管理当前激活工程的加载、切换与持久化

#### 核心特性

- **统一持久化**: `currentProjectId` 保存在 `settings` 表
- **自动兜底**: 无工程时自动创建 "New Project" + 空白 XML (v0.0.0 WIP)
- **超时保护**: 异步操作 3-10秒超时，防止无限等待
- **React 严格模式兼容**: 使用 ref 防止双重挂载

#### API

- `currentProject` / `loading` / `error`: 状态
- `loadCurrentProject()`: 重新拉取最新工程
- `switchProject(projectId)`: 切换工程并同步存储
- `refreshCurrentProject()`: 刷新当前工程元数据

#### 工作流程

1. 从存储读取 `currentProjectId`
2. 工程不存在 → 创建默认工程 + WIP 版本
3. 工程存在 → 加载并设置为当前
4. 切换 → 更新存储 + 刷新状态

### 4. useStorageConversations

**聊天会话管理 Hook** - 管理 AI 聊天会话的持久化

**核心方法**: `sessions` / `currentSession` / `createSession` / `updateSession` / `deleteSession` / `clearAllSessions`
**会话结构**: `id`, `title`, `messages` (AI SDK 格式), `createdAt`, `updatedAt`

### 5. useStorageXMLVersions

**XML 版本管理 Hook** - 管理 DrawIO XML/WIP 草稿、历史版本与 SVG 资源

#### 核心方法

- `saveXML(xml, projectUuid, previewImage?)`: 写入 WIP (0.0.0) 关键帧，同步页面计数/名称
- `createHistoricalVersion(projectUuid, semanticVersion, description?, editorRef?, options?)`: 从 WIP 生成历史版本
  - 传入 `editorRef` 可实时导出 XML + SVG，否则仅存储 WIP XML
  - `options.onExportProgress(progress)` 回调显示导出进度
  - 返回 `{ versionId, pageCount, svgAttached }`
- `rollbackToVersion(projectUuid, versionId)`: 回滚历史版本为 WIP
- `getSubVersions(projectUuid, parentVersion)`: 获取父版本下所有子版本 (x.y.z.h)
- `getRecommendedVersion(projectUuid, parentVersion?)`: 获取推荐版本号
- `validateVersion(projectUuid, version)`: 验证版本号格式 (x.y.z 或 x.y.z.h)
- `isVersionExists(projectUuid, version)`: 检查版本是否已存在

**其他方法**: `getCurrentXML`, `getAllXMLVersions`, `getXMLVersion`

### 6. useVersionCompare

**版本对比管理 Hook** - 管理版本对比模式和选择状态

#### 核心特性

- 对比模式切换、多选版本（默认最多 2 个）
- 管理对比弹层显示状态
- FIFO 替换：超过最大数量时替换最早版本

**API**: `isCompareMode`, `selectedIds`, `toggleCompareMode`, `resetSelection`, `toggleSelection`, `isDialogOpen`, `openDialogWithPair`, `closeDialog`, `activePair`

### 7. useDrawioEditor

**DrawIO 编辑器管理 Hook** - 封装编辑器操作逻辑，集成存储层

#### API

- `editorRef`: DrawioEditorNative 的 ref
- `loadProjectXml()`: 从存储加载 XML 到编辑器
- `saveEditorXml()`: 导出 XML 并保存到存储层
- `replaceWithXml(xml, forceLoad)`:
  - `forceLoad=true`: `loadDiagram`（完全重载，清空历史）
  - `forceLoad=false`: `mergeDiagram`（合并模式，保留历史）

### 8. useDrawioSocket

**Socket.IO 通讯 Hook** - 管理前端与后端的 Socket.IO 双向通讯

#### 核心特性

- 监听后端工具执行请求，自动调用 `drawio-tools.ts`
- 通过 Socket.IO 回传执行结果/错误
- **AI 自动版本**: AI 触发 `drawio_overwrite` 时，在设置 `autoVersionOnAIEdit=true` 情况下，阻塞式创建子版本快照后再写入 XML

#### 工作流程

1. 后端 AI 调用工具 → `tool-executor.ts` 发送 Socket.IO 请求
2. 前端接收 → 调用 `drawio-tools.ts` 方法
3. 返回结果 → 后端 Promise resolve

**配置**: `autoVersionOnAIEdit` (默认 true) 控制 AI 编辑时是否自动快照

## 统一导出

所有 Hooks 通过 `app/hooks/index.ts` 统一导出：

```typescript
export { useDrawioSocket } from "./useDrawioSocket";
export { useStorageSettings } from "./useStorageSettings";
export { useStorageProjects } from "./useStorageProjects";
export { useCurrentProject } from "./useCurrentProject";
export { useStorageConversations } from "./useStorageConversations";
export { useStorageXMLVersions } from "./useStorageXMLVersions";
export { useVersionCompare } from "./useVersionCompare";
export { useDrawioEditor } from "./useDrawioEditor";
```

## 设计原则

1. **类型安全**: 完整 TypeScript 类型定义（基于 `app/types/`）
2. **自动适配**: 自动适配 Electron (SQLite) 和 Web (IndexedDB)
3. **错误处理**: 异步操作均有错误处理，返回 `error` 状态
4. **加载状态**: 提供 `isLoading` 状态用于 UI 指示

## 最佳实践

1. **顶层使用**: 在页面/容器组件顶层调用，避免子组件重复调用
2. **错误处理**: 始终处理 `error` 状态并展示给用户
3. **加载状态**: 使用 `isLoading` 提供加载反馈
4. **依赖管理**: useEffect 中正确设置依赖项

## 相关文档

- **存储层架构**: 详见 `app/lib/AGENTS.md` 中的存储层说明
- **类型定义**: 详见 `app/types/AGENTS.md`
- **Socket.IO 协议**: 详见 `app/types/socket-protocol.ts`

## 代码腐化清理记录

### 2025-11-23 清理（存储订阅落地）

**执行的操作**：
- `useStorageXMLVersions.ts` 新增 `subscribeVersions()`，统一版本缓存与事件监听
- 所有 useStorage* Hooks 改用 `runStorageTask()` 处理加载/错误状态
- `withTimeout` 提取到 `lib/utils.ts`，Hooks 引用统一
- 抽取重复的版本缓存更新逻辑为 `updateVersionsCache()` 辅助函数

**影响文件**：5 个文件

**下次关注**：
- 订阅回调的节流与取消机制
- `runStorageTask` 的错误上报是否需要分级（警告/致命）

### 2025-11-23 清理（第二批）

**执行的操作**：

- 统一 WIP/历史版本写入：新增 `storage/writers.ts`，`saveXML`/`createHistoricalVersion`/`saveDrawioXMLInternal` 均走同一管线（归一化 + 元数据 + 事件派发）
- 版本缓存集中化：`useStorageXMLVersions` 提供 `subscribeVersions`，内部监听 version/wip 事件刷新缓存，`VersionSidebar` 取消本地重复加载
- 提取公共工具：`runStorageTask`/`withTimeout`/`formatVersionTimestamp`/`formatConversationDate`，所有 useStorage* Hooks 统一错误与加载处理
- XML 验证与 DOMParser 缓存统一：`validateXMLFormat`、drawio-xml-service 缓存解析器

**影响文件**：`app/hooks/useStorageXMLVersions.ts`、`app/components/VersionSidebar.tsx`、`app/lib/storage/writers.ts`、`app/lib/drawio-tools.ts`、`app/lib/drawio-ai-tools.ts`、`app/lib/drawio-xml-service.ts`、`app/lib/drawio-xml-utils.ts`、`app/lib/utils.ts`、`app/lib/format-utils.ts`、`app/hooks/useStorageSettings.ts`、`app/hooks/useStorageProjects.ts`、`app/hooks/useStorageConversations.ts`、`app/components/version/*`、`app/components/chat/*`

**下次关注**：

- 版本订阅机制已上线，后续组件（如版本时间线的派生视图）可逐步迁移到订阅数据源，避免并行状态
