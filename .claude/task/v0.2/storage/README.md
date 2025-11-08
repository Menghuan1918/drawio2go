# 抽象存储层实现任务规划 v0.2

## 项目目标

构建统一的抽象存储层，自动路由 Electron 环境使用 SQLite，Web 环境使用 IndexedDB，支持设置、工程、XML 版本、对话的完整生命周期管理。

## 设计理念

- **平台无关**：统一的 API 接口，屏蔽底层差异
- **可扩展性**：预留多工程、多版本支持（当前暂不实现）
- **类型安全**：完整的 TypeScript 类型定义
- **IPC 架构**：Electron 使用主进程管理数据库，确保安全性
- **数据完整性**：完整的关系型数据结构，支持外键约束

## 技术要求

1. ✅ Electron 环境使用 better-sqlite3（主进程管理）
2. ✅ Web 环境使用 idb（IndexedDB 封装）
3. ✅ 统一的 StorageAdapter 接口
4. ✅ 完整的 TypeScript 类型定义
5. 🚀 **新增**：XMLVersions 表支持预览图（BLOB/Blob）
6. 🚀 **新增**：Conversations 表关联 XML 版本
7. 🚀 **临时实现**：固定使用默认工程（uuid="default"）
8. 🚀 **临时实现**：固定使用默认版本（semantic_version="1.0.0"）

## 里程碑总览

| 里程碑                  | 文件                               | 预计耗时 | 状态      | 依赖 | 核心内容                  |
| ----------------------- | ---------------------------------- | -------- | --------- | ---- | ------------------------- |
| 1. 类型定义与接口设计   | [milestone-1.md](./milestone-1.md) | 30 分钟  | ⏳ 待开始 | 无   | TypeScript 类型和抽象接口 |
| 2. Electron SQLite 实现 | [milestone-2.md](./milestone-2.md) | 90 分钟  | ⏳ 待开始 | 1    | SQLite 管理器 + IPC 通道  |
| 3. Web IndexedDB 实现   | [milestone-3.md](./milestone-3.md) | 90 分钟  | ⏳ 待开始 | 1    | IndexedDB 存储实现        |
| 4. 存储工厂与路由       | [milestone-4.md](./milestone-4.md) | 30 分钟  | ⏳ 待开始 | 2, 3 | 环境检测与工厂函数        |
| 5. React Hooks 封装     | [milestone-5.md](./milestone-5.md) | 60 分钟  | ⏳ 待开始 | 4    | 新的存储 Hooks            |
| 6. 集成测试与文档       | [milestone-6.md](./milestone-6.md) | 30 分钟  | ⏳ 待开始 | 1-5  | 测试验证与文档更新        |

**总预计耗时**：约 5.5 小时

## 推荐执行顺序

```
里程碑 1 → 里程碑 2 ↘
                      → 里程碑 4 → 里程碑 5 → 里程碑 6
         → 里程碑 3 ↗
```

说明：里程碑 2 和 3 可以并行开发

## 环境要求

- ✅ better-sqlite3 需要安装
- ✅ @types/better-sqlite3 需要安装
- ✅ idb 需要安装
- ✅ Electron 38.x 已安装
- ✅ TypeScript 支持
- 🚀 **新增**：需要 Electron IPC 通道支持

## 核心架构特性

### 🗂️ 数据库表设计（5 张表）

#### 1. Settings 表

```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

- 存储所有设置信息（LLM 配置、默认路径等）
- Key-Value 结构，灵活可扩展

#### 2. Projects 表

```sql
CREATE TABLE projects (
  uuid TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  active_xml_version_id INTEGER,
  active_conversation_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

- 管理多个工程（**临时固定使用 uuid="default"**）
- 记录当前活动的 XML 版本和对话

#### 3. XMLVersions 表

```sql
CREATE TABLE xml_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_uuid TEXT NOT NULL,
  semantic_version TEXT NOT NULL,
  name TEXT,
  description TEXT,
  source_version_id INTEGER DEFAULT 0,
  xml_content TEXT NOT NULL,
  preview_image BLOB,              -- 🆕 PNG/JPEG 预览图
  created_at INTEGER NOT NULL,
  FOREIGN KEY (project_uuid) REFERENCES projects(uuid)
);
```

- 支持多版本 XML（**临时固定使用 semantic_version="1.0.0"**）
- 🆕 新增预览图字段（SQLite: BLOB, IndexedDB: Blob）
- 版本溯源（source_version_id）

#### 4. Conversations 表

```sql
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  project_uuid TEXT NOT NULL,
  xml_version_id INTEGER NOT NULL,    -- 🆕 关联 XML 版本
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_uuid) REFERENCES projects(uuid),
  FOREIGN KEY (xml_version_id) REFERENCES xml_versions(id)
);
```

- 管理对话历史
- 🆕 每个对话关联特定的 XML 版本

#### 5. Messages 表

```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_invocations TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);
```

- 存储对话消息
- 支持工具调用记录（JSON 序列化）

### 🏗️ 三层架构

```
┌─────────────────────────────────────┐
│   React Hooks 层                     │
│   (useStorageSettings, etc.)        │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│   抽象存储层 (StorageAdapter)        │
│   - 统一接口定义                     │
│   - 类型安全保证                     │
└──────┬──────────────────────┬───────┘
       │                      │
┌──────▼──────────┐  ┌────────▼────────┐
│ SQLiteStorage   │  │ IndexedDBStorage│
│ (Electron)      │  │ (Web)           │
│ ↓ IPC 调用      │  │ ↓ idb 直接操作  │
│ SQLiteManager   │  │ Browser API     │
│ (主进程)        │  │                 │
└─────────────────┘  └─────────────────┘
```

### 🔄 Electron IPC 通信架构

```
渲染进程 (SQLiteStorage)
    ↓ ipcRenderer.invoke('storage:xxx')
主进程 (main.js → IPC Handler)
    ↓ 调用
SQLite 管理器 (sqlite-manager.js)
    ↓ better-sqlite3
数据库文件 (drawio2go.db)
```

**优势**：

- ✅ 主进程管理数据库，避免权限问题
- ✅ 统一错误处理和事务管理
- ✅ 便于后续添加数据库备份、迁移功能

### 🎯 临时实现策略

当前版本暂不实现多工程、多版本功能，使用固定值：

```typescript
// 常量定义
const DEFAULT_PROJECT_UUID = 'default';
const DEFAULT_XML_VERSION = '1.0.0';

// 所有 API 内部自动注入
saveXML(xml) → 内部调用 createXMLVersion({
  project_uuid: DEFAULT_PROJECT_UUID,
  semantic_version: DEFAULT_XML_VERSION,
  xml_content: xml
})
```

**未来扩展路径**：

- 第一阶段（当前）：单工程 + 单版本
- 第二阶段（v0.3）：单工程 + 多版本（版本管理功能）
- 第三阶段（v0.4）：多工程 + 多版本（完整工作区）

## 文件结构

```
app/lib/storage/
├── index.ts                      # 统一导出
├── types.ts                      # TypeScript 类型定义
├── adapter.ts                    # StorageAdapter 抽象接口
├── sqlite-storage.ts             # SQLite 客户端（IPC 调用）
├── indexeddb-storage.ts          # IndexedDB 实现（idb）
├── storage-factory.ts            # 工厂函数（环境检测）
└── constants.ts                  # 常量定义

app/hooks/
├── useStorageSettings.ts         # 设置管理 Hook
├── useStorageProjects.ts         # 工程管理 Hook（暂时仅查询）
├── useStorageXMLVersions.ts      # XML 版本管理 Hook
└── useStorageConversations.ts    # 对话管理 Hook

electron/
├── main.js                       # 🆕 IPC 处理器（约 15+ 通道）
├── preload.js                    # 🆕 暴露存储 IPC 接口
└── storage/
    └── sqlite-manager.js         # 🆕 SQLite 数据库管理器

app/types/
└── global.d.ts                   # 🆕 Window.electronStorage 类型声明
```

## 技术亮点

### 1. 类型安全的抽象层

```typescript
// 所有实现必须满足接口约束
interface StorageAdapter {
  initialize(): Promise<void>;
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
  // ... 约 20+ 个方法
}
```

### 2. 图片数据处理

```typescript
// SQLite: Buffer (BLOB)
preview_image: Buffer | null;

// IndexedDB: Blob
preview_image: Blob | undefined;

// IPC 传输: ArrayBuffer
ipcRenderer.invoke("storage:createXMLVersion", {
  ...data,
  preview_image: blob.arrayBuffer(),
});
```

### 3. 环境自动检测

```typescript
export async function getStorage(): Promise<StorageAdapter> {
  if (typeof window !== "undefined" && window.electronStorage) {
    return new SQLiteStorage(); // Electron
  } else if (typeof window !== "undefined") {
    return new IndexedDBStorage(); // Web
  } else {
    throw new Error("Unsupported environment");
  }
}
```

### 4. React Hooks 封装

```typescript
// 自动初始化和状态管理
export function useStorageSettings() {
  const [config, setConfig] = useState<LLMConfig | null>(null);

  useEffect(() => {
    getStorage().then(async (storage) => {
      const value = await storage.getSetting("llmConfig");
      if (value) setConfig(JSON.parse(value));
    });
  }, []);

  return { config, saveConfig, loading, error };
}
```

## 设计决策

### ✅ 选择 better-sqlite3 的原因

- 同步 API，避免 async/await 开销
- 性能最佳（原生 C++ 绑定）
- 广泛用于 Electron 应用

### ✅ 选择 idb 的原因

- Promise 化的 IndexedDB API
- 体积小巧（约 2KB gzipped）
- TypeScript 友好

### ✅ 选择 IPC 架构的原因

- 主进程管理数据库更安全
- 避免渲染进程直接访问文件系统
- 便于后续添加权限控制

### ✅ 临时实现策略的原因

- 降低初期复杂度
- 预留扩展接口
- 快速验证架构可行性

## 破坏性更改说明

### ❌ 不兼容 localStorage

- 旧的 `llmConfig`、`currentDiagram`、`chatSessions` 数据将无法访问
- 用户需要重新配置所有设置

### ⚠️ 数据迁移策略（未实现）

本版本不提供数据迁移功能，原因：

1. 允许任意破坏性更改（需求明确）
2. 新架构与旧数据结构差异较大
3. 后续可通过导入/导出功能迁移

### ✅ 未来可添加的迁移方案

```typescript
// 检测旧数据
if (localStorage.getItem("llmConfig")) {
  showMigrationDialog(); // 提示用户导出旧数据
}
```

## 测试策略

### 单元测试覆盖

- [ ] StorageAdapter 接口所有方法
- [ ] SQLite CRUD 操作
- [ ] IndexedDB CRUD 操作
- [ ] IPC 通道正确性
- [ ] 工厂函数环境检测

### 集成测试覆盖

- [ ] Electron 环境完整流程
- [ ] Web 环境完整流程
- [ ] 图片数据存储和读取
- [ ] 外键约束正确性
- [ ] 事务回滚测试

### 用户测试场景

1. 首次启动 → 自动创建默认工程
2. 配置 LLM → 保存和读取
3. 保存 XML → 创建版本记录
4. 开始对话 → 关联 XML 版本
5. 刷新页面 → 数据持久化

## 性能考量

### SQLite 优化

- 使用索引加速查询（project_uuid, conversation_id）
- 批量操作使用事务
- 预留 WAL 模式支持

### IndexedDB 优化

- 使用合理的 keyPath 和 autoIncrement
- 避免大对象存储（图片独立字段）
- 合理使用游标查询

### IPC 优化

- 避免频繁的小数据传输
- 批量操作合并为单个 IPC 调用
- 图片数据使用 ArrayBuffer 传输

## 可扩展性设计

### 未来扩展点

1. **多工程支持**（v0.3）
   - 移除 DEFAULT_PROJECT_UUID 限制
   - 添加工程切换 UI

2. **多版本支持**（v0.3）
   - 移除 DEFAULT_XML_VERSION 限制
   - 添加版本管理 UI

3. **数据同步**（v0.4）
   - 添加远程同步接口
   - 支持多设备协作

4. **数据导出**（v0.3）
   - 导出为 JSON/ZIP
   - 支持选择性导出

5. **数据备份**（v0.3）
   - 自动备份机制
   - 增量备份支持

## 开发命令

```bash
# 安装依赖
pnpm add better-sqlite3 idb
pnpm add -D @types/better-sqlite3

# 开发测试
pnpm run dev              # Web 环境测试
pnpm run electron:dev     # Electron 环境测试

# 语法检查
pnpm lint

# 构建
pnpm run build            # Next.js 构建
pnpm run electron:build   # Electron 构建
```

## 注意事项

### ⚠️ better-sqlite3 编译问题

- 需要本地 C++ 编译环境
- Electron 版本需与 Node.js ABI 匹配
- 可能需要 `electron-rebuild`

### ⚠️ IndexedDB 限制

- 仅支持 HTTPS 或 localhost
- 有存储配额限制（通常 50MB+）
- 不支持跨域访问

### ⚠️ IPC 性能

- 大数据传输（>100MB）可能较慢
- 避免同步 IPC（ipcRenderer.sendSync）
- 考虑使用 SharedArrayBuffer（复杂度高）

### ⚠️ TypeScript 类型

- Blob 和 Buffer 类型需要正确转换
- IPC 参数需要可序列化
- 避免循环引用

## 快速开始

### 开发流程

```bash
# 1. 按顺序完成里程碑 1-6
# 2. 每完成一个里程碑，运行 pnpm lint
# 3. 在 Electron 和 Web 环境测试
# 4. 更新 AGENTS.md 文档
```

### 验收检查点

```bash
# 里程碑 1: 类型编译通过
✓ pnpm run build 无类型错误

# 里程碑 2-3: 存储层功能
✓ 数据库表正确创建
✓ CRUD 操作正常
✓ 外键约束生效

# 里程碑 4: 环境路由
✓ Electron 使用 SQLite
✓ Web 使用 IndexedDB

# 里程碑 5: Hooks 集成
✓ 设置保存和读取
✓ XML 版本创建
✓ 对话和消息管理

# 里程碑 6: 完整测试
✓ 所有功能正常
✓ 无控制台错误
✓ 文档更新完成
```

---

## 项目状态

**⏳ 抽象存储层实现 v0.2 待开始**

**目标成果**：

- 🗂️ 统一的存储抽象层
- 🏗️ Electron SQLite + Web IndexedDB 双实现
- 🔄 完整的 IPC 通信架构
- 📸 XML 预览图支持
- 🎯 可扩展的数据模型

**预留扩展**：

- 多工程支持（v0.3）
- 多版本管理（v0.3）
- 数据同步（v0.4）

---

_创建时间: 2025-11-06_
_版本: v0.2_
_状态: ⏳ 待开始_
