# 里程碑 3：Web IndexedDB 实现

**状态**：⏳ 待开始
**预计耗时**：90 分钟
**依赖**：里程碑 1

## 目标

实现 Web 环境下的 IndexedDB 存储层，使用 idb 库提供 Promise 化的 API，确保与 SQLite 实现完全一致的接口。

## 任务清单

### 1. 安装依赖

- [x] 安装 IndexedDB 封装库：
  ```bash
  pnpm add idb
  ```

### 2. 创建 IndexedDB 存储实现

- [x] 创建 `app/lib/storage/indexeddb-storage.ts`：

```typescript
import { openDB, type IDBPDatabase } from "idb";
import type { StorageAdapter } from "./adapter";
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
import { DB_NAME, DB_VERSION, DEFAULT_PROJECT_UUID } from "./constants";

/**
 * IndexedDB 存储实现（Web 环境）
 * 使用 idb 库提供 Promise 化的 IndexedDB API
 */
export class IndexedDBStorage implements StorageAdapter {
  private db: IDBPDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * 初始化数据库
   */
  async initialize(): Promise<void> {
    // 避免重复初始化
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._doInitialize();
    return this.initPromise;
  }

  private async _doInitialize(): Promise<void> {
    try {
      this.db = await openDB(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion, newVersion, transaction) {
          console.log(
            `Upgrading IndexedDB from ${oldVersion} to ${newVersion}`,
          );

          // Settings store
          if (!db.objectStoreNames.contains("settings")) {
            db.createObjectStore("settings", { keyPath: "key" });
          }

          // Projects store
          if (!db.objectStoreNames.contains("projects")) {
            db.createObjectStore("projects", { keyPath: "uuid" });
          }

          // XMLVersions store
          if (!db.objectStoreNames.contains("xml_versions")) {
            const xmlStore = db.createObjectStore("xml_versions", {
              keyPath: "id",
              autoIncrement: true,
            });
            xmlStore.createIndex("project_uuid", "project_uuid", {
              unique: false,
            });
          }

          // Conversations store
          if (!db.objectStoreNames.contains("conversations")) {
            const convStore = db.createObjectStore("conversations", {
              keyPath: "id",
            });
            convStore.createIndex("project_uuid", "project_uuid", {
              unique: false,
            });
            convStore.createIndex("xml_version_id", "xml_version_id", {
              unique: false,
            });
          }

          // Messages store
          if (!db.objectStoreNames.contains("messages")) {
            const msgStore = db.createObjectStore("messages", {
              keyPath: "id",
            });
            msgStore.createIndex("conversation_id", "conversation_id", {
              unique: false,
            });
          }
        },
      });

      // 确保默认工程存在
      await this._ensureDefaultProject();

      console.log("IndexedDB initialized");
    } catch (error) {
      console.error("Failed to initialize IndexedDB:", error);
      throw error;
    }
  }

  /**
   * 确保数据库已初始化
   */
  private async ensureDB(): Promise<IDBPDatabase> {
    if (!this.db) {
      await this.initialize();
    }
    return this.db!;
  }

  /**
   * 确保默认工程存在
   */
  private async _ensureDefaultProject(): Promise<void> {
    const db = await this.ensureDB();
    const existing = await db.get("projects", DEFAULT_PROJECT_UUID);

    if (!existing) {
      const now = Date.now();
      const defaultProject: Project = {
        uuid: DEFAULT_PROJECT_UUID,
        name: "Default Project",
        description: "默认工程",
        created_at: now,
        updated_at: now,
      };

      await db.put("projects", defaultProject);
      console.log("Created default project");
    }
  }

  // ==================== Settings ====================

  async getSetting(key: string): Promise<string | null> {
    const db = await this.ensureDB();
    const setting = await db.get("settings", key);
    return setting ? setting.value : null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    const db = await this.ensureDB();
    const now = Date.now();
    await db.put("settings", { key, value, updated_at: now });
  }

  async deleteSetting(key: string): Promise<void> {
    const db = await this.ensureDB();
    await db.delete("settings", key);
  }

  async getAllSettings(): Promise<Setting[]> {
    const db = await this.ensureDB();
    return db.getAll("settings");
  }

  // ==================== Projects ====================

  async getProject(uuid: string): Promise<Project | null> {
    const db = await this.ensureDB();
    const project = await db.get("projects", uuid);
    return project || null;
  }

  async createProject(project: CreateProjectInput): Promise<Project> {
    const db = await this.ensureDB();
    const now = Date.now();
    const fullProject: Project = {
      ...project,
      created_at: now,
      updated_at: now,
    };

    await db.put("projects", fullProject);
    return fullProject;
  }

  async updateProject(
    uuid: string,
    updates: UpdateProjectInput,
  ): Promise<void> {
    const db = await this.ensureDB();
    const existing = await db.get("projects", uuid);

    if (!existing) {
      throw new Error(`Project not found: ${uuid}`);
    }

    const now = Date.now();
    const updated: Project = {
      ...existing,
      ...updates,
      updated_at: now,
    };

    await db.put("projects", updated);
  }

  async deleteProject(uuid: string): Promise<void> {
    const db = await this.ensureDB();

    // 级联删除相关数据
    const tx = db.transaction(
      ["projects", "xml_versions", "conversations", "messages"],
      "readwrite",
    );

    // 删除工程的 XML 版本
    const xmlVersions = await tx
      .objectStore("xml_versions")
      .index("project_uuid")
      .getAll(uuid);
    for (const version of xmlVersions) {
      await tx.objectStore("xml_versions").delete(version.id);
    }

    // 删除工程的对话
    const conversations = await tx
      .objectStore("conversations")
      .index("project_uuid")
      .getAll(uuid);
    for (const conv of conversations) {
      // 删除对话的消息
      const messages = await tx
        .objectStore("messages")
        .index("conversation_id")
        .getAll(conv.id);
      for (const msg of messages) {
        await tx.objectStore("messages").delete(msg.id);
      }
      await tx.objectStore("conversations").delete(conv.id);
    }

    // 删除工程
    await tx.objectStore("projects").delete(uuid);

    await tx.done;
  }

  async getAllProjects(): Promise<Project[]> {
    const db = await this.ensureDB();
    const projects = await db.getAll("projects");
    // 按创建时间倒序
    return projects.sort((a, b) => b.created_at - a.created_at);
  }

  // ==================== XMLVersions ====================

  async getXMLVersion(id: number): Promise<XMLVersion | null> {
    const db = await this.ensureDB();
    const version = await db.get("xml_versions", id);
    return version || null;
  }

  async createXMLVersion(version: CreateXMLVersionInput): Promise<XMLVersion> {
    const db = await this.ensureDB();
    const now = Date.now();
    const fullVersion = {
      ...version,
      created_at: now,
    };

    const id = await db.add("xml_versions", fullVersion);

    const created = await db.get("xml_versions", id);
    return created!;
  }

  async getXMLVersionsByProject(projectUuid: string): Promise<XMLVersion[]> {
    const db = await this.ensureDB();
    const versions = await db.getAllFromIndex(
      "xml_versions",
      "project_uuid",
      projectUuid,
    );
    // 按创建时间倒序
    return versions.sort((a, b) => b.created_at - a.created_at);
  }

  async deleteXMLVersion(id: number): Promise<void> {
    const db = await this.ensureDB();

    // 级联删除关联的对话和消息
    const tx = db.transaction(
      ["xml_versions", "conversations", "messages"],
      "readwrite",
    );

    const conversations = await tx
      .objectStore("conversations")
      .index("xml_version_id")
      .getAll(id);

    for (const conv of conversations) {
      // 删除对话的消息
      const messages = await tx
        .objectStore("messages")
        .index("conversation_id")
        .getAll(conv.id);
      for (const msg of messages) {
        await tx.objectStore("messages").delete(msg.id);
      }
      await tx.objectStore("conversations").delete(conv.id);
    }

    // 删除 XML 版本
    await tx.objectStore("xml_versions").delete(id);

    await tx.done;
  }

  // ==================== Conversations ====================

  async getConversation(id: string): Promise<Conversation | null> {
    const db = await this.ensureDB();
    const conversation = await db.get("conversations", id);
    return conversation || null;
  }

  async createConversation(
    conversation: CreateConversationInput,
  ): Promise<Conversation> {
    const db = await this.ensureDB();
    const now = Date.now();
    const fullConversation: Conversation = {
      ...conversation,
      created_at: now,
      updated_at: now,
    };

    await db.put("conversations", fullConversation);
    return fullConversation;
  }

  async updateConversation(
    id: string,
    updates: UpdateConversationInput,
  ): Promise<void> {
    const db = await this.ensureDB();
    const existing = await db.get("conversations", id);

    if (!existing) {
      throw new Error(`Conversation not found: ${id}`);
    }

    const now = Date.now();
    const updated: Conversation = {
      ...existing,
      ...updates,
      updated_at: now,
    };

    await db.put("conversations", updated);
  }

  async deleteConversation(id: string): Promise<void> {
    const db = await this.ensureDB();

    // 级联删除消息
    const tx = db.transaction(["conversations", "messages"], "readwrite");

    const messages = await tx
      .objectStore("messages")
      .index("conversation_id")
      .getAll(id);
    for (const msg of messages) {
      await tx.objectStore("messages").delete(msg.id);
    }

    await tx.objectStore("conversations").delete(id);

    await tx.done;
  }

  async getConversationsByProject(
    projectUuid: string,
  ): Promise<Conversation[]> {
    const db = await this.ensureDB();
    const conversations = await db.getAllFromIndex(
      "conversations",
      "project_uuid",
      projectUuid,
    );
    // 按更新时间倒序
    return conversations.sort((a, b) => b.updated_at - a.updated_at);
  }

  async getConversationsByXMLVersion(
    xmlVersionId: number,
  ): Promise<Conversation[]> {
    const db = await this.ensureDB();
    const conversations = await db.getAllFromIndex(
      "conversations",
      "xml_version_id",
      xmlVersionId,
    );
    // 按更新时间倒序
    return conversations.sort((a, b) => b.updated_at - a.updated_at);
  }

  // ==================== Messages ====================

  async getMessagesByConversation(conversationId: string): Promise<Message[]> {
    const db = await this.ensureDB();
    const messages = await db.getAllFromIndex(
      "messages",
      "conversation_id",
      conversationId,
    );
    // 按创建时间正序
    return messages.sort((a, b) => a.created_at - b.created_at);
  }

  async createMessage(message: CreateMessageInput): Promise<Message> {
    const db = await this.ensureDB();
    const now = Date.now();
    const fullMessage: Message = {
      ...message,
      created_at: now,
    };

    await db.put("messages", fullMessage);
    return fullMessage;
  }

  async deleteMessage(id: string): Promise<void> {
    const db = await this.ensureDB();
    await db.delete("messages", id);
  }

  async createMessages(messages: CreateMessageInput[]): Promise<Message[]> {
    const db = await this.ensureDB();
    const now = Date.now();
    const tx = db.transaction("messages", "readwrite");

    const fullMessages: Message[] = messages.map((msg) => ({
      ...msg,
      created_at: now,
    }));

    for (const msg of fullMessages) {
      await tx.store.put(msg);
    }

    await tx.done;

    return fullMessages;
  }
}
```

## 验收标准

- [x] `app/lib/storage/indexeddb-storage.ts` 创建成功
- [x] IndexedDBStorage 实现所有 StorageAdapter 方法（约 25+ 个）
- [x] 数据库结构正确（5 个 Object Stores + 索引）
- [x] 默认工程自动创建
- [x] 级联删除正确实现（deleteProject, deleteXMLVersion, deleteConversation）
- [x] 图片数据使用 Blob 存储
- [x] 编译无 TypeScript 错误
- [x] 在浏览器中测试通过

## 测试步骤

1. 安装依赖：`pnpm add idb`
2. 运行 `pnpm lint` 检查语法
3. 启动 Web 开发服务器：`pnpm run dev`
4. 打开浏览器开发者工具
5. 检查 IndexedDB：
   - Application → IndexedDB → drawio2go
   - 查看 5 个 Object Stores
6. 测试存储功能：
   ```javascript
   // 在控制台测试
   import { IndexedDBStorage } from "@/lib/storage/indexeddb-storage";
   const storage = new IndexedDBStorage();
   await storage.initialize();
   await storage.setSetting("test", "value");
   await storage.getSetting("test"); // 'value'
   ```
7. 检查默认工程：
   - 查看 projects store
   - 应该包含 uuid="default" 的工程

## 设计要点

### IndexedDB vs SQLite 对比

| 特性 | IndexedDB               | SQLite                      |
| ---- | ----------------------- | --------------------------- |
| 主键 | keyPath / autoIncrement | PRIMARY KEY / AUTOINCREMENT |
| 索引 | createIndex()           | CREATE INDEX                |
| 事务 | transaction()           | BEGIN/COMMIT                |
| 外键 | 手动实现                | FOREIGN KEY                 |
| 查询 | getAll() / cursor       | SELECT                      |

### 级联删除实现

IndexedDB 没有原生外键支持，需要手动实现：

```typescript
// 删除工程时：
// 1. 查找所有关联的 XML 版本
// 2. 查找所有关联的对话
// 3. 查找对话的所有消息
// 4. 依次删除：消息 → 对话 → XML 版本 → 工程
```

### 事务管理

```typescript
// 使用事务确保数据一致性
const tx = db.transaction(["store1", "store2"], "readwrite");
await tx.objectStore("store1").put(data1);
await tx.objectStore("store2").put(data2);
await tx.done; // 提交事务
```

### 图片数据处理

```typescript
// IndexedDB 直接支持 Blob 对象
const xmlVersion = {
  ...data,
  preview_image: new Blob([imageData], { type: "image/png" }),
};
await db.put("xml_versions", xmlVersion);
```

### 排序实现

```typescript
// IndexedDB 不支持 ORDER BY，需要手动排序
const items = await db.getAll("conversations");
return items.sort((a, b) => b.updated_at - a.updated_at);
```

## 注意事项

### IndexedDB 限制

- **配额限制**：通常 50MB+，可通过 `navigator.storage.estimate()` 查询
- **同源策略**：只能在 HTTPS 或 localhost 使用
- **异步 API**：所有操作都是异步的
- **没有 JOIN**：不支持复杂的关联查询

### 浏览器兼容性

- ✅ Chrome/Edge: 完全支持
- ✅ Firefox: 完全支持
- ✅ Safari: 支持（部分版本有 bug）
- ❌ IE 11: 部分支持（本项目不考虑）

### 性能优化

- 使用索引加速查询
- 批量操作使用事务
- 避免大对象存储（图片限制在 1-2MB）
- 合理使用 cursor（大数据集）

### 错误处理

```typescript
try {
  await db.put("store", data);
} catch (error) {
  if (error.name === "QuotaExceededError") {
    // 存储空间不足
  } else if (error.name === "ConstraintError") {
    // 约束错误（如重复主键）
  }
  throw error;
}
```

## 可扩展性

### 未来可添加的功能

```typescript
// 存储配额查询
async getStorageEstimate() {
  const estimate = await navigator.storage.estimate();
  return {
    usage: estimate.usage,
    quota: estimate.quota,
    percentage: (estimate.usage! / estimate.quota!) * 100
  };
}

// 清空数据库
async clearAll() {
  const db = await this.ensureDB();
  const tx = db.transaction(['settings', 'projects', ...], 'readwrite');
  await Promise.all([
    tx.objectStore('settings').clear(),
    tx.objectStore('projects').clear(),
    // ...
  ]);
  await tx.done;
}

// 导出数据
async exportAll() {
  const db = await this.ensureDB();
  return {
    settings: await db.getAll('settings'),
    projects: await db.getAll('projects'),
    // ...
  };
}
```

### 数据迁移支持

```typescript
// 在 upgrade 回调中处理版本迁移
upgrade(db, oldVersion, newVersion) {
  if (oldVersion < 2) {
    // 从 v1 升级到 v2
    const store = db.objectStore('projects');
    store.createIndex('name', 'name');
  }
  if (oldVersion < 3) {
    // 从 v2 升级到 v3
    // ...
  }
}
```

## 调试技巧

### Chrome DevTools

1. Application → IndexedDB → drawio2go
2. 查看 Object Stores 和数据
3. 手动编辑/删除数据

### 查询示例

```javascript
// 在控制台直接操作 IndexedDB
const db = await indexedDB.open("drawio2go", 1);
const tx = db.transaction("projects", "readonly");
const store = tx.objectStore("projects");
const projects = await store.getAll();
console.log(projects);
```

### 清空数据

```javascript
// 删除整个数据库（重新开始）
indexedDB.deleteDatabase("drawio2go");
```

## 破坏性变更

- 🆕 新增 IndexedDBStorage 类
- 🆕 新增 drawio2go IndexedDB 数据库

## 下一步

完成后可继续（与里程碑 2 并行）：

- [里程碑 4：存储工厂与路由](./milestone-4.md)

---

**提示**：此里程碑实现 Web 环境的完整存储功能，与里程碑 2 可并行开发。
