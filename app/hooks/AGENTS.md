# React Hooks

## 概述

封装统一存储层访问与 Socket.IO 通讯的 React Hooks，提供类型安全的状态管理接口。

## Lint 约束（SonarJS）

- `sonarjs/no-nested-functions`: 避免深层回调嵌套（例如 `forEach/map` 内再嵌套 `setState`/回调），优先使用 `for..of` 或提取为模块级辅助函数。
- 若确实无法提取（如 `setState` 函数式更新必须传回调且局部闭包强依赖），允许使用 `// eslint-disable-next-line sonarjs/no-nested-functions`，并在同一行写明原因。
- 避免用 `void` 忽略 Promise（`sonarjs/void-use` 会报错），改为显式 `await` 或使用 `.catch(...)` 链式处理。

## Hooks 清单

### 1. useStorageSettings

**应用设置持久化 Hook** - 管理 LLM 配置、默认路径等应用级设置

#### 核心方法

- `getSetting(key)` / `setSetting(key, value)` / `getAllSettings()`
- `getLLMConfig()` / `saveLLMConfig(config)`: **已废弃**，内部自动映射到 provider/model/agent 级配置，并清理旧的 `llmConfig` 键；请优先使用 `getRuntimeConfig` 与对应的 provider/model/agent 更新接口
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
**新增流式辅助**: `markConversationAsStreaming(id)` / `markConversationAsCompleted(id)` / `loadConversationWithStatus(id)`（自动检测 `is_streaming` 超时并返回 `hasAbnormalExit` 标记）

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
- **取消保护**: 工具请求携带 `chatRunId`，前端仅处理当前活跃 run；收到 `/api/chat/cancel` 或用户取消后会拒绝执行并回传取消结果（同时监听 `tool:cancel` best-effort 取消事件）
- **AI 自动版本**: AI 触发 `drawio_overwrite` 时，在设置 `autoVersionOnAIEdit=true` 情况下，串行创建子版本快照后再写入 XML；内部使用 `isCreatingSnapshotRef` 防抖 + `latestMainVersionRef/latestSubVersionRef` 增量计算下一个子版本，避免每次全量拉取版本列表

#### 工作流程

1. 后端 AI 调用工具 → `tool-executor.ts` 发送 Socket.IO 请求
2. 前端接收 → 调用 `drawio-tools.ts` 方法
3. 返回结果 → 后端 Promise resolve

**配置**: `autoVersionOnAIEdit` (默认 true) 控制 AI 编辑时是否自动快照

### 9. useChatLock

**项目级聊天锁 Hook** - 基于 BroadcastChannel + localStorage 的跨标签页互斥

**API**: `useChatLock(projectUuid)` → `{ canChat, lockHolder, acquireLock, releaseLock }`

**特性**:

- BroadcastChannel(`drawio2go-chat-lock`) 广播获取/释放/心跳事件
- localStorage(`chat-lock-${projectUuid}`) 持久化持有者，崩溃后 30s 超时自动释放
- 心跳：持锁端每 10s 更新时间戳；5s 轮询清理过期锁
- 兼容性兜底：BroadcastChannel 不可用时回退 storage 监听
- beforeunload 清理：组件卸载或页面关闭时自动释放锁

### 10. useNetworkStatus

**网络状态监听 Hook** - 结合浏览器 online 事件 + `/api/health` 心跳检测的真实连通性判断。

- **返回值**: `{ isOnline, offlineReason, lastCheckedAt, isChecking, checkNow }`
  - `offlineReason`: `browser-offline` | `ping-fail` | `socket-disconnect`
  - `checkNow()`: 手动触发一次 3s 超时的健康检查（Promise.race）
- **机制**: 60s 心跳节流，失败指数退避（最多 5 分钟）；恢复或 `online` 事件时立即重试
- **默认值**: SSR 环境或缺少 navigator 时视为在线
- **用途**: 聊天流式中断保护、UI 禁用发送按钮、提示更准确的离线原因

### 11. useVersionPages

**版本页面加载 Hook** - 解压并解析 `pages_svg`，合并 `page_names`，提供标准化页面数据。

- **输入**: `version`（含 pages_svg/page_names），`enabled` 控制懒加载
- **输出**: `pages`（{id,name,index,svg}[]）、`pageNames`、`resolvedVersion`、`hasPagesData`、`isLoading`、`error`
- **特性**: 自动处理 Blob/Buffer，兜底页面名 ("Page 1...")，缺失/损坏数据返回友好错误

### 12. usePanZoomStage

**缩放/拖拽复用 Hook** - 统一舞台缩放、平移、滚轮/指针事件。

- **状态**: `scale`、`offset`、`isPanning`、`canPan`
- **方法**: `zoomIn/zoomOut/resetView`、`handleWheel`、`handlePointerDown/Move/Up`
- **配置**: `wheelZoomStrategy` (`ctrl-only` / `always`)、`minScale`/`maxScale`、`zoomStep`、`scaleOffsetStrategy`
- **场景**: PageSVGViewer（Ctrl+滚轮缩放）、VersionCompare（自由滚轮缩放、智能对比同步）

### 13. useChatSessionsController _(新增，2025-12-08)_

**聊天会话控制 Hook** - 把 ChatSidebar 内的会话订阅、消息缓存、默认 XML 初始化和异常退出处理集中管理。

- **返回**: `conversations`、`activeConversationId`、`conversationMessages`、`chatService`
- **操作**: `createConversation`、`startTempConversation`、`ensureMessagesForConversation`、`resolveConversationId`
- **状态与清理**: `handleAbnormalExitIfNeeded`、`removeConversationsFromState`、`markConversationAsStreaming/Completed`
- **行为**: 内部自动创建默认对话、默认 XML 版本，订阅会话/消息并维护缓存

### 14. useLLMConfig _(新增，2025-12-08)_

**LLM 配置聚合 Hook** - 统一加载/切换模型与 Provider，封装重复的配置加载逻辑。

- **返回**: `llmConfig`、`providers`、`models`、`selectedModelId/Label`、`configLoading`、`selectorLoading`
- **操作**: `loadModelSelector()`、`handleModelChange(modelId)`
- **特性**: 自动订阅设置变更（provider/model/activeModel）；未配置 provider/model 时返回 `llmConfig=null`，由上层 UI 提示并引导用户先完成模型配置

### 15. useOperationToast _(新增，2025-12-08)_

**操作提示 Hook** - 统一成功/警告/失败提示与错误消息提取。

- `pushErrorToast(message, title?)`
- `showNotice(message, status)` — status: success/warning/danger
- `extractErrorMessage(error)` — 从 Error/字符串/对象中抽取 message

### 16. useAttachmentObjectUrl _(新增，2025-12-13)_

**附件 Object URL 生命周期 Hook** - 用于 Milestone 5 图片展示的懒加载与缓存管理。

- **输入**: `attachmentId`（可为空），`options.enabled` 控制是否加载
- **输出**: `objectUrl` / `isLoading` / `error` / `retry`
- **特性**:
  - Promise 去重：同一 `attachmentId` 并发请求共享同一个读取 Promise
  - 引用计数：多个组件引用同一图片时复用 Object URL，最后一个卸载后延迟 30 秒 `revoke`
  - LRU 缓存：最多缓存 50 张图片，超出时淘汰最久未使用且未被引用的条目
  - 跨端读取：Web 端从 IndexedDB Blob 生成 URL；Electron 端通过 `file_path` + `window.electronFS.readFile()` 读取二进制生成 URL

### 17. useIntersection _(新增，2025-12-13)_

**视口交叉观察 Hook** - 为图片/重资源组件提供轻量懒加载触发器（不引入第三方依赖）。

- **输入**: `options`（`root`/`rootMargin`/`threshold`/`disabled`）
- **输出**: `{ ref, isInView, hasEverBeenInView }`
  - `ref`: 绑定到需要观察的 DOM 元素
  - `isInView`: 当前是否在视口（或 root 容器）中
  - `hasEverBeenInView`: 一旦进入过视口即永久为 `true`，便于“首次进入触发加载”的场景
- **特性**:
  - `disabled=true` 时视为始终可见（用于测试或强制加载）
  - 缺少 `IntersectionObserver` 的环境自动回退为可见
  - 清理阶段 `disconnect` observer，避免泄漏

## 统一导出

所有 Hooks 通过 `app/hooks/index.ts` 统一导出：

```typescript
export { useDrawioSocket } from "./useDrawioSocket";
export { useChatLock } from "./useChatLock";
export { useStorageSettings } from "./useStorageSettings";
export { useStorageProjects } from "./useStorageProjects";
export { useCurrentProject } from "./useCurrentProject";
export { useStorageConversations } from "./useStorageConversations";
export { useStorageXMLVersions } from "./useStorageXMLVersions";
export { useVersionCompare } from "./useVersionCompare";
export { useNetworkStatus } from "./useNetworkStatus";
export { useDrawioEditor } from "./useDrawioEditor";
export { useVersionPages } from "./useVersionPages";
export { usePanZoomStage } from "./usePanZoomStage";
export { useAttachmentObjectUrl } from "./useAttachmentObjectUrl";
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

### 2025-12-08 清理

- 新增 `usePanZoomStage`、`useVersionPages`，抽离缩放/分页与多页解压逻辑供版本组件复用。
- `useChatLock` 将 `clientIdRef` 初始化移入 `useEffect`，避免 SSR 与多标签页场景的引用泄漏。
- `useStorageSettings` 超时提示补齐国际化，复用存储层的 `timeout-utils` 常量。
- 统一 `withTimeout` 调用到新超时常量，去除重复的魔法数字。

**影响文件**：4 个（usePanZoomStage.ts、useVersionPages.ts、useChatLock.ts、useStorageSettings.ts）

**下次关注**：

- 大图多页场景下的新 hooks 是否需要节流/防抖配置。
- 聊天锁在异常关闭时的释放逻辑是否还需 telemetry 支撑。

### 2025-11-24 清理（超时与提示统一）

- `useStorageConversations` / `useStorageXMLVersions` 统一通过 `withTimeout` 添加 8 秒超时保护，订阅刷新失败会回填到 `error` 状态
- 聊天侧边栏的存储操作提示改用 HeroUI `Alert`，移除阻塞式 `alert()`

### 2025-11-24 清理（会话订阅落地）

- 存储层新增会话/消息事件派发：`conversation-created` / `conversation-updated` / `conversation-deleted` / `messages-updated`（IndexedDB + SQLite 双端）
- `useStorageConversations` 提供 `subscribeToConversations`、`subscribeToMessages`，内部缓存随事件自动刷新
- `ChatSidebar` 改为订阅驱动会话列表与消息加载，保留去抖自动保存；导出前懒加载缺失消息

### 2025-11-23 清理（存储订阅落地）

**执行的操作**：

- `useStorageXMLVersions.ts` 新增 `subscribeVersions()`，统一版本缓存与事件监听
- 所有 useStorage\* Hooks 改用 `runStorageTask()` 处理加载/错误状态
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
- 提取公共工具：`runStorageTask`/`withTimeout`/`formatVersionTimestamp`/`formatConversationDate`，所有 useStorage\* Hooks 统一错误与加载处理
- XML 验证与 DOMParser 缓存统一：`validateXMLFormat`、drawio-xml-service 缓存解析器

**影响文件**：`app/hooks/useStorageXMLVersions.ts`、`app/components/VersionSidebar.tsx`、`app/lib/storage/writers.ts`、`app/lib/drawio-tools.ts`、`app/lib/drawio-ai-tools.ts`、`app/lib/drawio-xml-service.ts`、`app/lib/drawio-xml-utils.ts`、`app/lib/utils.ts`、`app/lib/format-utils.ts`、`app/hooks/useStorageSettings.ts`、`app/hooks/useStorageProjects.ts`、`app/hooks/useStorageConversations.ts`、`app/components/version/*`、`app/components/chat/*`

**下次关注**：

- 版本订阅机制已上线，后续组件（如版本时间线的派生视图）可逐步迁移到订阅数据源，避免并行状态
