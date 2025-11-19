# React Hooks

## 概述

封装统一存储层访问与 Socket.IO 通讯的 React Hooks，提供类型安全的状态管理接口。

## Hooks 清单

### 1. useStorageSettings

**应用设置持久化 Hook** - 管理 LLM 配置、默认路径等应用级设置

#### 特性

- **类型安全**: 完整 TypeScript 类型支持
- **自动规范化**: 获取和保存 LLM 配置时自动规范化（使用 `config-utils.ts`）
- **核心方法**:
  - `getSetting(key)`: 获取单个设置值
  - `setSetting(key, value)`: 保存单个设置值
  - `deleteSetting(key)`: 删除设置
  - `getAllSettings()`: 获取所有设置
  - `getLLMConfig()`: 获取 LLM 配置（已规范化）
  - `saveLLMConfig(config)`: 保存 LLM 配置（自动规范化）
  - `getDefaultPath()`: 获取默认路径
  - `saveDefaultPath(path)`: 保存默认路径
- **配置规范化**:
  - 保存时自动补全默认值
  - 验证 provider 类型
  - 规范化 API URL 格式
  - 确保配置格式一致性

#### 使用示例

```typescript
import { useStorageSettings } from "@/hooks";

function SettingsComponent() {
  const { getLLMConfig, saveLLMConfig, getDefaultPath, saveDefaultPath } =
    useStorageSettings();

  const handleSaveConfig = async () => {
    // 自动规范化配置
    await saveLLMConfig({
      apiUrl: "https://api.example.com",
      apiKey: "sk-xxx",
      modelName: "gpt-4",
      providerType: "openai-compatible",
      temperature: 0.7,
    });
  };

  const handleLoadConfig = async () => {
    const config = await getLLMConfig(); // 返回规范化后的配置
    console.log(config);
  };

  return <div>{/* UI */}</div>;
}
```

### 2. useStorageProjects

**项目管理 Hook** - 管理 DrawIO 项目元数据

#### 特性

- **项目列表**: 获取所有项目
- **CRUD 操作**: 创建、读取、更新、删除项目
- **项目结构**:
  - `uuid`: 唯一标识符
  - `name`: 项目名称
  - `description`: 项目描述
  - `created_at`: 创建时间
  - `updated_at`: 更新时间

#### 使用示例

```typescript
import { useStorageProjects } from "@/hooks";

function ProjectManager() {
  const { projects, createProject, updateProject, deleteProject } =
    useStorageProjects();

  const handleCreate = async () => {
    await createProject({
      uuid: "project-1",
      name: "My Diagram",
      description: "Project description",
    });
  };

  return <div>{/* UI */}</div>;
}
```

### 3. useCurrentProject

**当前工程 Hook** - 管理当前激活工程的加载、切换与持久化

#### 特性

- **统一持久化**: `currentProjectId` 保存在统一存储层的 `settings` 表，由 `current-project.ts` 管理
- **自动兜底**: 如不存在任何工程，自动创建 "New Project" + 空白 XML 版本（v0.0.0 WIP）
- **超时保护**: 所有异步操作添加超时保护（3-10秒），避免无限等待
- **React 严格模式兼容**: 使用 ref 防止双重挂载导致的重复加载
- **自动激活版本**: 创建默认工程时自动设置 `active_xml_version_id` 指向 WIP 版本
- **状态接口**:
  - `currentProject` / `loading` / `error`
  - `loadCurrentProject()`: 重新拉取并返回最新工程
  - `switchProject(projectId)`: 切换工程并同步存储
  - `refreshCurrentProject()`: 仅刷新当前工程的元数据

#### 工作流程

1. **初始化**: 从统一存储层读取 `currentProjectId`
2. **工程不存在**: 创建默认工程 "New Project" + 空白 XML 版本
3. **工程存在**: 加载工程信息并设置为当前工程
4. **切换工程**: 更新存储层中的 `currentProjectId` 并刷新状态

#### 默认工程创建流程

```typescript
// 1. 创建工程记录
const newProject = {
  uuid: `project-${Date.now()}-${random}`,
  name: "New Project",
  description: "默认工程",
};

// 2. 创建空白 XML 版本（v0.0.0 WIP）
const xmlVersion = {
  id: uuidv4(),
  project_uuid: newProject.uuid,
  semantic_version: "0.0.0", // WIP 版本
  name: "初始版本",
  source_version_id: ZERO_SOURCE_VERSION_ID,
  xml_content: emptyXML, // 空白画布
  is_keyframe: true,
  diff_chain_depth: 0,
};

// 3. 更新工程的激活版本
await storage.updateProject(uuid, {
  active_xml_version_id: xmlVersion.id,
});
```

#### 使用示例

```typescript
import { useCurrentProject } from "@/app/hooks/useCurrentProject";

function ProjectAwareSidebar() {
  const { currentProject, loading, error, switchProject } =
    useCurrentProject();

  if (loading) return <Skeleton />;
  if (error) return <ErrorBanner message={error.message} />;

  return (
    <ProjectSelector
      currentProjectId={currentProject?.uuid ?? null}
      onSelect={(uuid) => switchProject(uuid)}
    />
  );
}
```

#### 错误处理

- 所有异步操作都有超时保护
- 加载失败时自动创建默认工程
- 提供详细的控制台日志便于调试

### 4. useStorageConversations

**聊天会话管理 Hook** - 管理 AI 聊天会话的持久化

#### 特性

- **会话列表**: 获取所有会话及其消息
- **会话操作**:
  - `createSession`: 创建新会话
  - `updateSession`: 更新会话（标题、消息）
  - `deleteSession`: 删除会话
  - `clearAllSessions`: 清空所有会话
- **会话结构**:
  - `id`: 会话 ID
  - `title`: 会话标题
  - `messages`: 消息数组（AI SDK 格式）
  - `createdAt`: 创建时间
  - `updatedAt`: 更新时间

#### 使用示例

```typescript
import { useStorageConversations } from "@/hooks";

function ChatManager() {
  const {
    sessions,
    currentSession,
    createSession,
    updateSession,
    deleteSession,
  } = useStorageConversations();

  const handleNewChat = async () => {
    const newSession = await createSession({
      title: "New Chat",
      messages: [],
    });
  };

  return <div>{/* UI */}</div>;
}
```

### 5. useStorageXMLVersions

**XML 版本管理 Hook** - 管理 DrawIO XML/WIP 草稿、历史版本与 SVG 资源

#### 可用方法

```typescript
const {
  loading,
  error,
  saveXML, // 保存或更新 WIP (0.0.0)
  getCurrentXML,
  getAllXMLVersions,
  getSubVersions,
  getXMLVersion,
  createHistoricalVersion,
  rollbackToVersion,
  getRecommendedVersion,
  validateVersion,
  isVersionExists,
} = useStorageXMLVersions();
```

- `saveXML(xml, projectUuid, previewImage?)`: 将最新编辑内容写入 WIP 关键帧，并同步页面计数/名称。
- `createHistoricalVersion(projectUuid, semanticVersion, description?, editorRef?, options?)`: 从 WIP 生成历史版本。
  - `editorRef`: 建议传入 `DrawioEditorNative` 的 ref，以实时导出 XML + 全页 SVG；缺失时自动退回到存储中的 WIP XML，仅不写入 SVG 字段。
  - `options.onExportProgress(progress)`: 回调 `index/total/name`，便于 UI 显示“第 X/Y 页”进度。
  - 返回 `Promise<CreateHistoricalVersionResult>`，包含 `versionId`、`pageCount`、`svgAttached`。
- `rollbackToVersion(projectUuid, versionId)`: 将指定历史版本回写为 WIP。
- `getSubVersions(projectUuid, parentVersion)`: 基于最近一次加载的版本列表过滤对应父版本（`x.y.z`）下的所有子版本；若缓存与项目不匹配则返回空数组，避免串号。
- `getRecommendedVersion(projectUuid, parentVersion?)`: 不传父版本时保持旧策略（主版本 minor +1），传入父版本时调用 `getNextSubVersion` 返回 `x.y.z.h` 建议。
- `validateVersion(projectUuid, version)`: 允许 `x.y.z` / `x.y.z.h`，排除 `0.0.0`，输入子版本时会校验父版本在当前项目缓存中是否存在；缓存失效时会提示刷新版本列表。
- `isVersionExists(projectUuid, version)`: 防止重复版本号。

#### 使用示例

```typescript
import { useStorageXMLVersions } from "@/hooks";
import type { DrawioEditorRef } from "@/app/components/DrawioEditorNative";

function SnapshotDialog({ projectUuid, editorRef }: {
  projectUuid: string;
  editorRef: React.RefObject<DrawioEditorRef | null>;
}) {
  const { createHistoricalVersion } = useStorageXMLVersions();

  const handleSubmit = async () => {
    const result = await createHistoricalVersion(
      projectUuid,
      "1.2.0",
      "迭代 UI",
      editorRef,
      {
        onExportProgress: (progress) => {
          console.log(`正在导出第 ${progress.index + 1}/${progress.total} 页`);
        },
      },
    );

    console.log(
      `版本 ${result.versionId} 已创建，共 ${result.pageCount} 页，SVG 写入：${result.svgAttached}`,
    );
  };

  return <button onClick={handleSubmit}>保存版本</button>;
}
```

### 6. useVersionCompare

**版本对比管理 Hook** - 管理版本对比模式和选择状态

#### 特性

- **对比模式切换**: 开启/关闭版本对比模式
- **版本选择**: 支持多选版本（默认最多 2 个）
- **对比弹层**: 管理 VersionCompare 弹层的显示状态
- **FIFO 替换**: 超过最大选择数量时自动替换最早选择的版本

#### 使用示例

```typescript
import { useVersionCompare } from "@/hooks";

function VersionSidebar() {
  const {
    isCompareMode,
    selectedIds,
    toggleCompareMode,
    resetSelection,
    toggleSelection,
    isDialogOpen,
    openDialogWithPair,
    closeDialog,
    activePair,
  } = useVersionCompare({ maxSelection: 2 });

  return (
    <>
      <Button onPress={toggleCompareMode}>
        {isCompareMode ? "退出对比" : "对比版本"}
      </Button>

      {isCompareMode && (
        <div>
          <p>已选择: {selectedIds.length} 个版本</p>
          <Button onPress={resetSelection}>清空选择</Button>
        </div>
      )}

      {/* 版本卡片列表 */}
      {versions.map((v) => (
        <VersionCard
          key={v.id}
          version={v}
          isSelected={selectedIds.includes(v.id)}
          onToggleSelection={() => toggleSelection(v.id)}
        />
      ))}

      {/* 对比弹层 */}
      {activePair && (
        <VersionCompare
          isOpen={isDialogOpen}
          onClose={closeDialog}
          versionA={activePair.versionA}
          versionB={activePair.versionB}
        />
      )}
    </>
  );
}
```

### 7. useDrawioEditor

**DrawIO 编辑器管理 Hook** - 封装编辑器操作逻辑，集成存储层

#### 特性

- **编辑器引用管理**: 提供 `editorRef` 用于访问 DrawioEditorNative API
- **加载工程**: 从存储层加载当前工程的 XML 到编辑器
- **保存编辑**: 从编辑器导出 XML 并保存到存储层
- **替换内容**: 替换编辑器内容并保存（支持 load/merge 模式）

#### 使用示例

```typescript
import { useDrawioEditor } from "@/hooks";

function EditorPage({ projectId }: { projectId: string }) {
  const { editorRef, loadProjectXml, saveEditorXml, replaceWithXml } =
    useDrawioEditor(projectId);

  // 组件挂载时加载工程
  useEffect(() => {
    loadProjectXml();
  }, [loadProjectXml]);

  // 版本回滚
  const handleRollback = async (xml: string) => {
    await replaceWithXml(xml, true); // 强制 load 模式
  };

  return (
    <>
      <DrawioEditorNative ref={editorRef} onSave={saveEditorXml} />
      <Button onPress={saveEditorXml}>手动保存</Button>
    </>
  );
}
```

#### API 说明

- `editorRef`: DrawioEditorNative 的 ref，用于调用编辑器 API
- `loadProjectXml()`: 从存储加载 XML 并更新编辑器，返回加载的 XML 内容
- `saveEditorXml()`: 从编辑器导出 XML 并保存到存储层
- `replaceWithXml(xml, forceLoad)`:
  - `forceLoad=true`: 使用 `loadDiagram`（完全重载，清空撤销历史）
  - `forceLoad=false`: 使用 `mergeDiagram`（尝试合并，保留撤销历史）

### 8. useDrawioSocket

**Socket.IO 通讯 Hook** - 管理前端与后端的 Socket.IO 双向通讯

#### 特性

- **工具请求监听**: 监听后端发来的工具执行请求
- **自动执行**: 收到请求后自动调用 `drawio-tools.ts` 执行操作
- **结果回传**: 通过 Socket.IO 返回执行结果给后端
- **错误处理**: 捕获并返回详细错误信息

#### 实现原理

1. 后端 AI 调用工具 → `tool-executor.ts` 通过 Socket.IO 发送请求
2. 前端 `useDrawioSocket` 接收请求
3. 调用 `drawio-tools.ts` 中的方法（如 `getDrawioXML`、`replaceDrawioXML`）
4. 返回结果通过 Socket.IO 发送回后端
5. 后端 Promise resolve，AI 获得结果

#### 使用示例

```typescript
import { useDrawioSocket } from "@/hooks";

function EditorPage() {
  // Hook 会自动监听 Socket.IO 请求并处理
  useDrawioSocket();

  return <div>{/* DrawIO 编辑器 */}</div>;
}
```

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

### 1. 类型安全

- 所有 Hooks 提供完整的 TypeScript 类型定义
- 使用 `app/types/` 中的类型确保一致性

### 2. 自动适配

- Hooks 自动适配 Electron（SQLite）和 Web（IndexedDB）环境
- 开发者无需关心底层存储实现

### 3. 错误处理

- 所有异步操作都有错误处理
- 返回 `error` 状态供组件显示错误信息

### 4. 加载状态

- 提供 `isLoading` 状态用于 UI 加载指示
- 异步操作完成后自动更新状态

## 最佳实践

### 1. 在顶层使用

建议在页面或容器组件顶层使用 Hooks，避免在子组件中重复调用：

```typescript
// ✅ 推荐
function Page() {
  const { settings } = useStorageSettings();
  return <ChildComponent settings={settings} />;
}

// ❌ 不推荐
function ChildComponent() {
  const { settings } = useStorageSettings(); // 每个子组件都调用
}
```

### 2. 错误提示

始终处理 `error` 状态并向用户展示：

```typescript
const { settings, error } = useStorageSettings();

if (error) {
  return <ErrorBanner message={error} />;
}
```

### 3. 加载状态

使用 `isLoading` 提供良好的用户体验：

```typescript
const { settings, isLoading } = useStorageSettings();

if (isLoading) {
  return <Spinner />;
}
```

### 4. 依赖管理

使用 useEffect 监听数据变化时，正确设置依赖项：

```typescript
useEffect(() => {
  // 处理 settings 变化
}, [settings]);
```

## 相关文档

- **存储层架构**: 详见 `app/lib/AGENTS.md` 中的存储层说明
- **类型定义**: 详见 `app/types/AGENTS.md`
- **Socket.IO 协议**: 详见 `app/types/socket-protocol.ts`
