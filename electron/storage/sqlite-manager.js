const Database = require("better-sqlite3");
const { app } = require("electron");
const path = require("path");
const fs = require("fs");

const SQLITE_DB_FILE = "drawio2go.db";
const DEFAULT_PROJECT_UUID = "default";
const _DEFAULT_XML_VERSION = "1.0.0"; // 预留常量，暂未使用

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
        model_name TEXT,
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
        INSERT INTO messages (id, conversation_id, role, content, tool_invocations, model_name, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        message.id,
        message.conversation_id,
        message.role,
        message.content,
        message.tool_invocations || null,
        message.model_name || null,
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
      INSERT INTO messages (id, conversation_id, role, content, tool_invocations, model_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((msgs) => {
      for (const msg of msgs) {
        insertStmt.run(
          msg.id,
          msg.conversation_id,
          msg.role,
          msg.content,
          msg.tool_invocations || null,
          msg.model_name || null,
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
