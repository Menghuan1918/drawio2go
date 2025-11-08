# 里程碑 2：Electron SQLite 实现

**状态**：⏳ 待开始
**预计耗时**：90 分钟
**依赖**：里程碑 1

## 目标

实现 Electron 环境下的 SQLite 存储层，包括主进程的数据库管理器、IPC 通道处理器和渲染进程的客户端。

## 任务清单

### 1. 安装依赖

- [x] 安装 SQLite 相关依赖：
  ```bash
  pnpm add better-sqlite3
  pnpm add -D @types/better-sqlite3
  ```

### 2. 创建 SQLite 管理器（主进程）

- [x] 创建 `electron/storage/sqlite-manager.js`：

#### 初始化数据库

```javascript
const Database = require("better-sqlite3");
const { app } = require("electron");
const path = require("path");
const fs = require("fs");

const SQLITE_DB_FILE = "drawio2go.db";
const DEFAULT_PROJECT_UUID = "default";
const DEFAULT_XML_VERSION = "1.0.0";

class SQLiteManager {
  constructor() {
    this.db = null;
  }

  /**
   * 初始化数据库
   */
  initialize() {
    try {
      // 数据库文件路径
      const userDataPath = app.getPath("userData");
      const dbPath = path.join(userDataPath, SQLITE_DB_FILE);

      // 确保目录存在
      fs.mkdirSync(userDataPath, { recursive: true });

      // 打开数据库
      this.db = new Database(dbPath, { verbose: console.log });

      // 启用外键约束
      this.db.pragma("foreign_keys = ON");

      // 创建表
      this._createTables();

      // 创建默认工程
      this._ensureDefaultProject();

      console.log("SQLite database initialized at:", dbPath);
    } catch (error) {
      console.error("Failed to initialize SQLite:", error);
      throw error;
    }
  }

  /**
   * 创建所有表
   */
  _createTables() {
    // Settings 表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Projects 表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        uuid TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        active_xml_version_id INTEGER,
        active_conversation_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // XMLVersions 表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS xml_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_uuid TEXT NOT NULL,
        semantic_version TEXT NOT NULL,
        name TEXT,
        description TEXT,
        source_version_id INTEGER DEFAULT 0,
        xml_content TEXT NOT NULL,
        preview_image BLOB,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (project_uuid) REFERENCES projects(uuid) ON DELETE CASCADE
      )
    `);

    // 创建索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_xml_versions_project
      ON xml_versions(project_uuid)
    `);

    // Conversations 表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        project_uuid TEXT NOT NULL,
        xml_version_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (project_uuid) REFERENCES projects(uuid) ON DELETE CASCADE,
        FOREIGN KEY (xml_version_id) REFERENCES xml_versions(id) ON DELETE CASCADE
      )
    `);

    // 创建索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_conversations_project
      ON conversations(project_uuid)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_conversations_xml_version
      ON conversations(xml_version_id)
    `);

    // Messages 表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tool_invocations TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      )
    `);

    // 创建索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages(conversation_id)
    `);
  }

  /**
   * 确保默认工程存在
   */
  _ensureDefaultProject() {
    const existing = this.db
      .prepare("SELECT uuid FROM projects WHERE uuid = ?")
      .get(DEFAULT_PROJECT_UUID);

    if (!existing) {
      const now = Date.now();
      this.db
        .prepare(
          `
          INSERT INTO projects (uuid, name, description, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `,
        )
        .run(DEFAULT_PROJECT_UUID, "Default Project", "默认工程", now, now);

      console.log("Created default project");
    }
  }

  // ==================== Settings ====================

  getSetting(key) {
    const row = this.db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(key);
    return row ? row.value : null;
  }

  setSetting(key, value) {
    const now = Date.now();
    this.db
      .prepare(
        `
        INSERT INTO settings (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?
      `,
      )
      .run(key, value, now, value, now);
  }

  deleteSetting(key) {
    this.db.prepare("DELETE FROM settings WHERE key = ?").run(key);
  }

  getAllSettings() {
    return this.db.prepare("SELECT * FROM settings ORDER BY key").all();
  }

  // ==================== Projects ====================

  getProject(uuid) {
    return (
      this.db.prepare("SELECT * FROM projects WHERE uuid = ?").get(uuid) || null
    );
  }

  createProject(project) {
    const now = Date.now();
    this.db
      .prepare(
        `
        INSERT INTO projects (uuid, name, description, active_xml_version_id, active_conversation_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        project.uuid,
        project.name,
        project.description || null,
        project.active_xml_version_id || null,
        project.active_conversation_id || null,
        now,
        now,
      );

    return this.getProject(project.uuid);
  }

  updateProject(uuid, updates) {
    const now = Date.now();
    const fields = [];
    const values = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (key !== "uuid" && key !== "created_at" && key !== "updated_at") {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    });

    if (fields.length === 0) return;

    fields.push("updated_at = ?");
    values.push(now, uuid);

    this.db
      .prepare(`UPDATE projects SET ${fields.join(", ")} WHERE uuid = ?`)
      .run(...values);
  }

  deleteProject(uuid) {
    this.db.prepare("DELETE FROM projects WHERE uuid = ?").run(uuid);
  }

  getAllProjects() {
    return this.db
      .prepare("SELECT * FROM projects ORDER BY created_at DESC")
      .all();
  }

  // ==================== XMLVersions ====================

  getXMLVersion(id) {
    return (
      this.db.prepare("SELECT * FROM xml_versions WHERE id = ?").get(id) || null
    );
  }

  createXMLVersion(version) {
    const now = Date.now();
    const result = this.db
      .prepare(
        `
        INSERT INTO xml_versions
        (project_uuid, semantic_version, name, description, source_version_id, xml_content, preview_image, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        version.project_uuid,
        version.semantic_version,
        version.name || null,
        version.description || null,
        version.source_version_id || 0,
        version.xml_content,
        version.preview_image || null, // Buffer for BLOB
        now,
      );

    return this.getXMLVersion(result.lastInsertRowid);
  }

  getXMLVersionsByProject(projectUuid) {
    return this.db
      .prepare(
        "SELECT * FROM xml_versions WHERE project_uuid = ? ORDER BY created_at DESC",
      )
      .all(projectUuid);
  }

  deleteXMLVersion(id) {
    this.db.prepare("DELETE FROM xml_versions WHERE id = ?").run(id);
  }

  // ==================== Conversations ====================

  getConversation(id) {
    return (
      this.db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) ||
      null
    );
  }

  createConversation(conversation) {
    const now = Date.now();
    this.db
      .prepare(
        `
        INSERT INTO conversations (id, project_uuid, xml_version_id, title, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        conversation.id,
        conversation.project_uuid,
        conversation.xml_version_id,
        conversation.title,
        now,
        now,
      );

    return this.getConversation(conversation.id);
  }

  updateConversation(id, updates) {
    const now = Date.now();
    const fields = [];
    const values = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (key !== "id" && key !== "created_at" && key !== "updated_at") {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    });

    if (fields.length === 0) return;

    fields.push("updated_at = ?");
    values.push(now, id);

    this.db
      .prepare(`UPDATE conversations SET ${fields.join(", ")} WHERE id = ?`)
      .run(...values);
  }

  deleteConversation(id) {
    this.db.prepare("DELETE FROM conversations WHERE id = ?").run(id);
  }

  getConversationsByProject(projectUuid) {
    return this.db
      .prepare(
        "SELECT * FROM conversations WHERE project_uuid = ? ORDER BY updated_at DESC",
      )
      .all(projectUuid);
  }

  getConversationsByXMLVersion(xmlVersionId) {
    return this.db
      .prepare(
        "SELECT * FROM conversations WHERE xml_version_id = ? ORDER BY updated_at DESC",
      )
      .all(xmlVersionId);
  }

  // ==================== Messages ====================

  getMessagesByConversation(conversationId) {
    return this.db
      .prepare(
        "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
      )
      .all(conversationId);
  }

  createMessage(message) {
    const now = Date.now();
    this.db
      .prepare(
        `
        INSERT INTO messages (id, conversation_id, role, content, tool_invocations, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        message.id,
        message.conversation_id,
        message.role,
        message.content,
        message.tool_invocations || null,
        now,
      );

    return this.db
      .prepare("SELECT * FROM messages WHERE id = ?")
      .get(message.id);
  }

  deleteMessage(id) {
    this.db.prepare("DELETE FROM messages WHERE id = ?").run(id);
  }

  createMessages(messages) {
    const now = Date.now();
    const insertStmt = this.db.prepare(`
      INSERT INTO messages (id, conversation_id, role, content, tool_invocations, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((msgs) => {
      for (const msg of msgs) {
        insertStmt.run(
          msg.id,
          msg.conversation_id,
          msg.role,
          msg.content,
          msg.tool_invocations || null,
          now,
        );
      }
    });

    transaction(messages);

    // 返回创建的消息
    return messages.map((msg) =>
      this.db.prepare("SELECT * FROM messages WHERE id = ?").get(msg.id),
    );
  }

  /**
   * 关闭数据库连接
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

module.exports = SQLiteManager;
```

### 3. 添加 IPC 处理器（electron/main.js）

- [x] 在 `electron/main.js` 中导入 SQLiteManager：

  ```javascript
  const SQLiteManager = require("./storage/sqlite-manager");
  let storageManager = null;
  ```

- [x] 在 `app.whenReady()` 中初始化：

  ```javascript
  app.whenReady().then(() => {
    // 初始化存储
    storageManager = new SQLiteManager();
    storageManager.initialize();

    // ... 现有代码
  });
  ```

- [x] 添加所有 IPC 通道处理器（在 `app.whenReady()` 后）：

```javascript
// ==================== Storage IPC Handlers ====================

// 初始化
ipcMain.handle("storage:initialize", async () => {
  // 已在 app.whenReady() 中初始化
  return;
});

// Settings
ipcMain.handle("storage:getSetting", async (event, key) => {
  return storageManager.getSetting(key);
});

ipcMain.handle("storage:setSetting", async (event, key, value) => {
  return storageManager.setSetting(key, value);
});

ipcMain.handle("storage:deleteSetting", async (event, key) => {
  return storageManager.deleteSetting(key);
});

ipcMain.handle("storage:getAllSettings", async () => {
  return storageManager.getAllSettings();
});

// Projects
ipcMain.handle("storage:getProject", async (event, uuid) => {
  return storageManager.getProject(uuid);
});

ipcMain.handle("storage:createProject", async (event, project) => {
  return storageManager.createProject(project);
});

ipcMain.handle("storage:updateProject", async (event, uuid, updates) => {
  return storageManager.updateProject(uuid, updates);
});

ipcMain.handle("storage:deleteProject", async (event, uuid) => {
  return storageManager.deleteProject(uuid);
});

ipcMain.handle("storage:getAllProjects", async () => {
  return storageManager.getAllProjects();
});

// XMLVersions
ipcMain.handle("storage:getXMLVersion", async (event, id) => {
  return storageManager.getXMLVersion(id);
});

ipcMain.handle("storage:createXMLVersion", async (event, version) => {
  // 处理 preview_image: ArrayBuffer → Buffer
  if (version.preview_image) {
    version.preview_image = Buffer.from(version.preview_image);
  }
  return storageManager.createXMLVersion(version);
});

ipcMain.handle(
  "storage:getXMLVersionsByProject",
  async (event, projectUuid) => {
    return storageManager.getXMLVersionsByProject(projectUuid);
  },
);

ipcMain.handle("storage:deleteXMLVersion", async (event, id) => {
  return storageManager.deleteXMLVersion(id);
});

// Conversations
ipcMain.handle("storage:getConversation", async (event, id) => {
  return storageManager.getConversation(id);
});

ipcMain.handle("storage:createConversation", async (event, conversation) => {
  return storageManager.createConversation(conversation);
});

ipcMain.handle("storage:updateConversation", async (event, id, updates) => {
  return storageManager.updateConversation(id, updates);
});

ipcMain.handle("storage:deleteConversation", async (event, id) => {
  return storageManager.deleteConversation(id);
});

ipcMain.handle(
  "storage:getConversationsByProject",
  async (event, projectUuid) => {
    return storageManager.getConversationsByProject(projectUuid);
  },
);

ipcMain.handle(
  "storage:getConversationsByXMLVersion",
  async (event, xmlVersionId) => {
    return storageManager.getConversationsByXMLVersion(xmlVersionId);
  },
);

// Messages
ipcMain.handle(
  "storage:getMessagesByConversation",
  async (event, conversationId) => {
    return storageManager.getMessagesByConversation(conversationId);
  },
);

ipcMain.handle("storage:createMessage", async (event, message) => {
  return storageManager.createMessage(message);
});

ipcMain.handle("storage:deleteMessage", async (event, id) => {
  return storageManager.deleteMessage(id);
});

ipcMain.handle("storage:createMessages", async (event, messages) => {
  return storageManager.createMessages(messages);
});
```

- [x] 在 `app.on('window-all-closed')` 中关闭数据库：
  ```javascript
  app.on("window-all-closed", () => {
    if (storageManager) {
      storageManager.close();
    }
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
  ```

### 4. 暴露 IPC 接口（electron/preload.js）

- [x] 在 `electron/preload.js` 中添加存储接口：

```javascript
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronStorage", {
  // 初始化
  initialize: () => ipcRenderer.invoke("storage:initialize"),

  // Settings
  getSetting: (key) => ipcRenderer.invoke("storage:getSetting", key),
  setSetting: (key, value) =>
    ipcRenderer.invoke("storage:setSetting", key, value),
  deleteSetting: (key) => ipcRenderer.invoke("storage:deleteSetting", key),
  getAllSettings: () => ipcRenderer.invoke("storage:getAllSettings"),

  // Projects
  getProject: (uuid) => ipcRenderer.invoke("storage:getProject", uuid),
  createProject: (project) =>
    ipcRenderer.invoke("storage:createProject", project),
  updateProject: (uuid, updates) =>
    ipcRenderer.invoke("storage:updateProject", uuid, updates),
  deleteProject: (uuid) => ipcRenderer.invoke("storage:deleteProject", uuid),
  getAllProjects: () => ipcRenderer.invoke("storage:getAllProjects"),

  // XMLVersions
  getXMLVersion: (id) => ipcRenderer.invoke("storage:getXMLVersion", id),
  createXMLVersion: (version) =>
    ipcRenderer.invoke("storage:createXMLVersion", version),
  getXMLVersionsByProject: (projectUuid) =>
    ipcRenderer.invoke("storage:getXMLVersionsByProject", projectUuid),
  deleteXMLVersion: (id) => ipcRenderer.invoke("storage:deleteXMLVersion", id),

  // Conversations
  getConversation: (id) => ipcRenderer.invoke("storage:getConversation", id),
  createConversation: (conversation) =>
    ipcRenderer.invoke("storage:createConversation", conversation),
  updateConversation: (id, updates) =>
    ipcRenderer.invoke("storage:updateConversation", id, updates),
  deleteConversation: (id) =>
    ipcRenderer.invoke("storage:deleteConversation", id),
  getConversationsByProject: (projectUuid) =>
    ipcRenderer.invoke("storage:getConversationsByProject", projectUuid),
  getConversationsByXMLVersion: (xmlVersionId) =>
    ipcRenderer.invoke("storage:getConversationsByXMLVersion", xmlVersionId),

  // Messages
  getMessagesByConversation: (conversationId) =>
    ipcRenderer.invoke("storage:getMessagesByConversation", conversationId),
  createMessage: (message) =>
    ipcRenderer.invoke("storage:createMessage", message),
  deleteMessage: (id) => ipcRenderer.invoke("storage:deleteMessage", id),
  createMessages: (messages) =>
    ipcRenderer.invoke("storage:createMessages", messages),
});
```

### 5. 创建 SQLite 客户端（渲染进程）

- [x] 创建 `app/lib/storage/sqlite-storage.ts`：

```typescript
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

/**
 * SQLite 存储实现（Electron 环境）
 * 通过 IPC 调用主进程的 SQLiteManager
 */
export class SQLiteStorage implements StorageAdapter {
  private async ensureElectron() {
    if (!window.electronStorage) {
      throw new Error(
        "electronStorage is not available. Not in Electron environment.",
      );
    }
  }

  async initialize(): Promise<void> {
    await this.ensureElectron();
    await window.electronStorage!.initialize();
  }

  // ==================== Settings ====================

  async getSetting(key: string): Promise<string | null> {
    await this.ensureElectron();
    return window.electronStorage!.getSetting(key);
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.ensureElectron();
    await window.electronStorage!.setSetting(key, value);
  }

  async deleteSetting(key: string): Promise<void> {
    await this.ensureElectron();
    await window.electronStorage!.deleteSetting(key);
  }

  async getAllSettings(): Promise<Setting[]> {
    await this.ensureElectron();
    return window.electronStorage!.getAllSettings();
  }

  // ==================== Projects ====================

  async getProject(uuid: string): Promise<Project | null> {
    await this.ensureElectron();
    return window.electronStorage!.getProject(uuid);
  }

  async createProject(project: CreateProjectInput): Promise<Project> {
    await this.ensureElectron();
    return window.electronStorage!.createProject(project);
  }

  async updateProject(
    uuid: string,
    updates: UpdateProjectInput,
  ): Promise<void> {
    await this.ensureElectron();
    await window.electronStorage!.updateProject(uuid, updates);
  }

  async deleteProject(uuid: string): Promise<void> {
    await this.ensureElectron();
    await window.electronStorage!.deleteProject(uuid);
  }

  async getAllProjects(): Promise<Project[]> {
    await this.ensureElectron();
    return window.electronStorage!.getAllProjects();
  }

  // ==================== XMLVersions ====================

  async getXMLVersion(id: number): Promise<XMLVersion | null> {
    await this.ensureElectron();
    const result = await window.electronStorage!.getXMLVersion(id);
    if (result && result.preview_image) {
      // Buffer → Blob 转换
      result.preview_image = new Blob([result.preview_image]);
    }
    return result;
  }

  async createXMLVersion(version: CreateXMLVersionInput): Promise<XMLVersion> {
    await this.ensureElectron();
    // Blob → ArrayBuffer 转换
    if (version.preview_image instanceof Blob) {
      version.preview_image =
        (await version.preview_image.arrayBuffer()) as any;
    }
    const result = await window.electronStorage!.createXMLVersion(version);
    if (result.preview_image) {
      result.preview_image = new Blob([result.preview_image]);
    }
    return result;
  }

  async getXMLVersionsByProject(projectUuid: string): Promise<XMLVersion[]> {
    await this.ensureElectron();
    const results =
      await window.electronStorage!.getXMLVersionsByProject(projectUuid);
    return results.map((r) => {
      if (r.preview_image) {
        r.preview_image = new Blob([r.preview_image]);
      }
      return r;
    });
  }

  async deleteXMLVersion(id: number): Promise<void> {
    await this.ensureElectron();
    await window.electronStorage!.deleteXMLVersion(id);
  }

  // ==================== Conversations ====================

  async getConversation(id: string): Promise<Conversation | null> {
    await this.ensureElectron();
    return window.electronStorage!.getConversation(id);
  }

  async createConversation(
    conversation: CreateConversationInput,
  ): Promise<Conversation> {
    await this.ensureElectron();
    return window.electronStorage!.createConversation(conversation);
  }

  async updateConversation(
    id: string,
    updates: UpdateConversationInput,
  ): Promise<void> {
    await this.ensureElectron();
    await window.electronStorage!.updateConversation(id, updates);
  }

  async deleteConversation(id: string): Promise<void> {
    await this.ensureElectron();
    await window.electronStorage!.deleteConversation(id);
  }

  async getConversationsByProject(
    projectUuid: string,
  ): Promise<Conversation[]> {
    await this.ensureElectron();
    return window.electronStorage!.getConversationsByProject(projectUuid);
  }

  async getConversationsByXMLVersion(
    xmlVersionId: number,
  ): Promise<Conversation[]> {
    await this.ensureElectron();
    return window.electronStorage!.getConversationsByXMLVersion(xmlVersionId);
  }

  // ==================== Messages ====================

  async getMessagesByConversation(conversationId: string): Promise<Message[]> {
    await this.ensureElectron();
    return window.electronStorage!.getMessagesByConversation(conversationId);
  }

  async createMessage(message: CreateMessageInput): Promise<Message> {
    await this.ensureElectron();
    return window.electronStorage!.createMessage(message);
  }

  async deleteMessage(id: string): Promise<void> {
    await this.ensureElectron();
    await window.electronStorage!.deleteMessage(id);
  }

  async createMessages(messages: CreateMessageInput[]): Promise<Message[]> {
    await this.ensureElectron();
    return window.electronStorage!.createMessages(messages);
  }
}
```

## 验收标准

- [x] `electron/storage/sqlite-manager.js` 创建成功
- [x] SQLiteManager 实现所有 CRUD 方法（约 25+ 个）
- [x] 数据库表结构正确（5 张表 + 索引）
- [x] 外键约束正确配置
- [x] 默认工程自动创建
- [x] `electron/main.js` 添加所有 IPC 处理器（约 25+ 个）
- [x] `electron/preload.js` 暴露所有存储接口
- [x] `app/lib/storage/sqlite-storage.ts` 实现 StorageAdapter
- [x] 图片数据正确处理（Buffer ↔ Blob ↔ ArrayBuffer）
- [x] 编译无错误

## 测试步骤

1. 安装依赖：`pnpm add better-sqlite3 @types/better-sqlite3 -D`
2. 运行 `pnpm lint` 检查语法
3. 启动 Electron：`pnpm run electron:dev`
4. 打开开发者工具，检查数据库初始化日志
5. 测试存储功能：
   ```javascript
   // 在控制台测试
   await window.electronStorage.setSetting("test", "value");
   await window.electronStorage.getSetting("test"); // 'value'
   ```
6. 检查数据库文件：
   - 位置：`~/.config/drawio2go/drawio2go.db`（Linux）或对应的用户数据目录
   - 使用 SQLite 客户端查看表结构

## 设计要点

### IPC 架构优势

- **安全性**：主进程管理数据库，避免权限问题
- **一致性**：统一的错误处理和事务管理
- **扩展性**：便于添加备份、迁移功能

### 图片数据处理流程

```
渲染进程 (Blob)
  → arrayBuffer()
  → IPC 传输 (ArrayBuffer)
  → 主进程 (Buffer.from)
  → SQLite (BLOB)

SQLite (BLOB)
  → 主进程 (Buffer)
  → IPC 传输 (Buffer → 自动序列化)
  → 渲染进程 (new Blob)
```

### 事务处理

- `createMessages` 使用事务批量插入
- 未来可扩展更多事务操作

### 索引优化

- `project_uuid` 索引（加速按工程查询）
- `conversation_id` 索引（加速按对话查询）
- `xml_version_id` 索引（加速按版本查询）

## 注意事项

### better-sqlite3 编译

- 需要本地 C++ 编译环境（gcc/clang）
- Electron 版本需与 Node.js ABI 匹配
- 如遇编译问题，运行：
  ```bash
  pnpm rebuild better-sqlite3
  # 或
  ./node_modules/.bin/electron-rebuild
  ```

### 数据库文件位置

- macOS: `~/Library/Application Support/drawio2go/drawio2go.db`
- Windows: `%APPDATA%/drawio2go/drawio2go.db`
- Linux: `~/.config/drawio2go/drawio2go.db`

### IPC 性能

- 避免频繁的小数据传输
- 使用 `createMessages` 批量插入
- 大图片（>1MB）可能较慢

### 错误处理

- IPC 错误会自动传递到渲染进程
- 使用 try-catch 捕获错误
- 数据库错误会打印到控制台

## 可扩展性

### 未来可添加的功能

```javascript
// 数据库备份
backupDatabase(destPath) {
  const srcPath = path.join(app.getPath('userData'), SQLITE_DB_FILE);
  fs.copyFileSync(srcPath, destPath);
}

// 数据库优化
optimizeDatabase() {
  this.db.pragma('optimize');
  this.db.pragma('vacuum');
}

// 事务封装
transaction(callback) {
  const txn = this.db.transaction(callback);
  return txn();
}
```

## 破坏性变更

- 🆕 新增 SQLiteManager 类
- 🆕 新增约 25+ 个 IPC 通道
- 🆕 新增 window.electronStorage 接口

## 下一步

完成后可继续（与里程碑 3 并行）：

- [里程碑 4：存储工厂与路由](./milestone-4.md)

---

**提示**：此里程碑实现 Electron 环境的完整存储功能。
