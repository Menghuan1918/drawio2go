const Database = require("better-sqlite3");
const { app } = require("electron");
const path = require("path");
const fs = require("fs");
const { runSQLiteMigrations } = require("./migrations");
const { v4: uuidv4 } = require("uuid");
const {
  createDefaultDiagramXml,
} = require("../../app/lib/storage/default-diagram-xml");
const {
  DEFAULT_PROJECT_UUID,
  WIP_VERSION,
  ZERO_SOURCE_VERSION_ID,
} = require("../../app/lib/storage/constants-shared");

const SQLITE_DB_FILE = "drawio2go.db";

class SQLiteManager {
  constructor() {
    this.db = null;
    this.incrementSequenceStmt = null;
    this.ensureSequenceFloorStmt = null;
  }

  _getIncrementSequenceStmt() {
    if (!this.incrementSequenceStmt) {
      this.incrementSequenceStmt = this.db.prepare(`
        INSERT INTO conversation_sequences (conversation_id, last_sequence)
        VALUES (?, 1)
        ON CONFLICT(conversation_id) DO UPDATE SET last_sequence = last_sequence + 1
        RETURNING last_sequence
      `);
    }
    return this.incrementSequenceStmt;
  }

  _getEnsureSequenceFloorStmt() {
    if (!this.ensureSequenceFloorStmt) {
      this.ensureSequenceFloorStmt = this.db.prepare(`
        INSERT INTO conversation_sequences (conversation_id, last_sequence)
        VALUES (?, ?)
        ON CONFLICT(conversation_id) DO UPDATE SET last_sequence = MAX(last_sequence, excluded.last_sequence)
      `);
    }
    return this.ensureSequenceFloorStmt;
  }

  _getNextSequenceNumber(conversationId) {
    const row = this._getIncrementSequenceStmt().get(conversationId);
    return row?.last_sequence || 1;
  }

  _ensureSequenceFloor(conversationId, sequenceNumber) {
    this._getEnsureSequenceFloorStmt().run(conversationId, sequenceNumber);
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

      // 创建/迁移表结构
      runSQLiteMigrations(this.db);

      // 创建默认工程
      this._ensureDefaultProject();
      this._ensureDefaultWipVersion();

      console.log("SQLite database initialized at:", dbPath);
    } catch (error) {
      console.error("Failed to initialize SQLite:", error);
      throw error;
    }
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

  /**
   * 确保默认 WIP 版本存在，避免首次连接时 AI 工具无可用版本
   */
  _ensureDefaultWipVersion() {
    const countRow = this.db
      .prepare("SELECT COUNT(1) as count FROM xml_versions")
      .get();

    if (countRow?.count > 0) {
      return;
    }

    const defaultXml = createDefaultDiagramXml();
    const now = Date.now();
    const pageNamesJson = JSON.stringify(["Page-1"]);

    this.db
      .prepare(
        `
        INSERT INTO xml_versions
        (id, project_uuid, semantic_version, name, description, source_version_id, is_keyframe, diff_chain_depth, xml_content, metadata, page_count, page_names, preview_svg, pages_svg, preview_image, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        uuidv4(),
        DEFAULT_PROJECT_UUID,
        WIP_VERSION,
        null,
        "默认工作版本",
        ZERO_SOURCE_VERSION_ID,
        1,
        0,
        defaultXml,
        null,
        1,
        pageNamesJson,
        null,
        null,
        null,
        now,
      );

    console.log("Created default WIP XML version");
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

  getXMLVersion(id, projectUuid) {
    const stmt = projectUuid
      ? this.db.prepare(
          "SELECT * FROM xml_versions WHERE id = ? AND project_uuid = ?",
        )
      : this.db.prepare("SELECT * FROM xml_versions WHERE id = ?");

    const version = projectUuid
      ? stmt.get(id, projectUuid) || null
      : stmt.get(id) || null;

    if (!version && projectUuid) {
      const existing = this.db
        .prepare("SELECT project_uuid FROM xml_versions WHERE id = ?")
        .get(id);
      if (existing && existing.project_uuid !== projectUuid) {
        const message =
          `安全错误：版本 ${id} 不属于项目 ${projectUuid}，` +
          `实际归属 ${existing.project_uuid}。`;
        console.error("[SQLiteManager] 拒绝跨项目访问", {
          versionId: id,
          requestedProject: projectUuid,
          versionProject: existing.project_uuid,
        });
        throw new Error(message);
      }
    }

    return version || null;
  }

  createXMLVersion(version) {
    const now = Date.now();
    const metadataString =
      typeof version.metadata === "string"
        ? version.metadata
        : version.metadata
          ? JSON.stringify(version.metadata)
          : null;

    this.db
      .prepare(
        `
        INSERT INTO xml_versions
        (id, project_uuid, semantic_version, name, description, source_version_id, is_keyframe, diff_chain_depth, xml_content, metadata, page_count, page_names, preview_svg, pages_svg, preview_image, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        version.id,
        version.project_uuid,
        version.semantic_version,
        version.name || null,
        version.description || null,
        version.source_version_id,
        version.is_keyframe ? 1 : 0,
        version.diff_chain_depth || 0,
        version.xml_content,
        metadataString,
        typeof version.page_count === "number" && version.page_count > 0
          ? version.page_count
          : 1,
        version.page_names || null,
        version.preview_svg || null,
        version.pages_svg || null,
        version.preview_image || null, // Buffer for BLOB
        now,
      );

    return this.getXMLVersion(version.id);
  }

  getXMLVersionsByProject(projectUuid) {
    return this.db
      .prepare(
        `
        SELECT
          id,
          project_uuid,
          semantic_version,
          name,
          description,
          source_version_id,
          is_keyframe,
          diff_chain_depth,
          xml_content,
          metadata,
          page_count,
          page_names,
          preview_image,
          created_at
        FROM xml_versions
        WHERE project_uuid = ?
        ORDER BY created_at DESC
      `,
      )
      .all(projectUuid);
  }

  getXMLVersionSVGData(id, projectUuid) {
    const stmt = projectUuid
      ? this.db.prepare(
          `SELECT id, project_uuid, preview_svg, pages_svg FROM xml_versions WHERE id = ? AND project_uuid = ?`,
        )
      : this.db.prepare(
          `SELECT id, project_uuid, preview_svg, pages_svg FROM xml_versions WHERE id = ?`,
        );

    const result = projectUuid
      ? stmt.get(id, projectUuid) || null
      : stmt.get(id) || null;

    if (!result && projectUuid) {
      const existing = this.db
        .prepare("SELECT project_uuid FROM xml_versions WHERE id = ?")
        .get(id);
      if (existing && existing.project_uuid !== projectUuid) {
        const message =
          `安全错误：版本 ${id} 的 SVG 数据属于项目 ${existing.project_uuid}，` +
          `请求项目为 ${projectUuid}。`;
        console.error("[SQLiteManager] 拒绝跨项目 SVG 访问", {
          versionId: id,
          requestedProject: projectUuid,
          versionProject: existing.project_uuid,
        });
        throw new Error(message);
      }
    }

    return result || null;
  }

  updateXMLVersion(id, updates = {}) {
    const entries = Object.entries(updates).filter(
      ([key, value]) => key !== "id" && value !== undefined,
    );

    if (entries.length === 0) {
      return;
    }

    const fields = [];
    const values = [];

    for (const [key, value] of entries) {
      switch (key) {
        case "metadata": {
          const serialized =
            value == null
              ? null
              : typeof value === "string"
                ? value
                : JSON.stringify(value);
          fields.push("metadata = ?");
          values.push(serialized);
          break;
        }
        case "preview_image": {
          fields.push("preview_image = ?");
          values.push(value || null);
          break;
        }
        case "preview_svg": {
          fields.push("preview_svg = ?");
          values.push(value || null);
          break;
        }
        case "pages_svg": {
          fields.push("pages_svg = ?");
          values.push(value || null);
          break;
        }
        case "page_count": {
          const nextValue =
            typeof value === "number" && value >= 1 ? Math.floor(value) : 1;
          fields.push("page_count = ?");
          values.push(nextValue);
          break;
        }
        case "page_names": {
          fields.push("page_names = ?");
          values.push(value || null);
          break;
        }
        case "is_keyframe": {
          fields.push("is_keyframe = ?");
          values.push(value ? 1 : 0);
          break;
        }
        case "diff_chain_depth": {
          fields.push("diff_chain_depth = ?");
          values.push(typeof value === "number" ? value : 0);
          break;
        }
        case "created_at": {
          fields.push("created_at = ?");
          values.push(typeof value === "number" ? value : Date.now());
          break;
        }
        case "project_uuid":
        case "semantic_version":
        case "name":
        case "description":
        case "source_version_id":
        case "xml_content": {
          fields.push(`${key} = ?`);
          values.push(value);
          break;
        }
        default:
          break;
      }
    }

    if (fields.length === 0) {
      return;
    }

    this.db
      .prepare(`UPDATE xml_versions SET ${fields.join(", ")} WHERE id = ?`)
      .run(...values, id);
  }

  deleteXMLVersion(id, projectUuid) {
    const version = this.getXMLVersion(id);
    if (!version) return;

    if (projectUuid && version.project_uuid !== projectUuid) {
      const message = `安全错误：删除版本 ${id} 被拒绝，目标项目 ${projectUuid} 与版本归属 ${version.project_uuid} 不一致。`;
      console.error("[SQLiteManager] 拒绝跨项目删除", {
        versionId: id,
        requestedProject: projectUuid,
        versionProject: version.project_uuid,
      });
      throw new Error(message);
    }

    const stmt = projectUuid
      ? this.db.prepare(
          "DELETE FROM xml_versions WHERE id = ? AND project_uuid = ?",
        )
      : this.db.prepare("DELETE FROM xml_versions WHERE id = ?");

    if (projectUuid) {
      stmt.run(id, projectUuid);
    } else {
      stmt.run(id);
    }
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
        INSERT INTO conversations (id, project_uuid, title, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `,
      )
      .run(
        conversation.id,
        conversation.project_uuid,
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

  batchDeleteConversations(ids = []) {
    if (!Array.isArray(ids) || ids.length === 0) return;
    const placeholders = ids.map(() => "?").join(",");
    const tx = this.db.transaction((conversationIds) => {
      this.db
        .prepare(
          `DELETE FROM messages WHERE conversation_id IN (${placeholders})`,
        )
        .run(...conversationIds);
      this.db
        .prepare(`DELETE FROM conversations WHERE id IN (${placeholders})`)
        .run(...conversationIds);
    });

    try {
      tx(ids);
    } catch (error) {
      console.error("[SQLiteManager] 批量删除对话失败，已回滚", {
        ids,
        error,
      });
      throw error;
    }
  }

  exportConversations(ids = []) {
    if (!Array.isArray(ids) || ids.length === 0) {
      return JSON.stringify({
        version: "1.1",
        exportedAt: new Date().toISOString(),
        conversations: [],
      });
    }

    const placeholders = ids.map(() => "?").join(",");
    const conversations = this.db
      .prepare(
        `SELECT * FROM conversations WHERE id IN (${placeholders}) ORDER BY updated_at DESC`,
      )
      .all(...ids);

    const messageStmt = this.db.prepare(
      `SELECT * FROM messages
       WHERE conversation_id = ?
       ORDER BY COALESCE(sequence_number, created_at) ASC, created_at ASC`,
    );

    const exportItems = conversations.map((conv) => ({
      ...conv,
      messages: messageStmt.all(conv.id),
    }));

    return JSON.stringify(
      {
        version: "1.1",
        exportedAt: new Date().toISOString(),
        conversations: exportItems,
      },
      null,
      2,
    );
  }

  getConversationsByProject(projectUuid) {
    return this.db
      .prepare(
        "SELECT * FROM conversations WHERE project_uuid = ? ORDER BY updated_at DESC",
      )
      .all(projectUuid);
  }

  // ==================== Messages ====================

  getMessagesByConversation(conversationId) {
    return this.db
      .prepare(
        `SELECT * FROM messages
         WHERE conversation_id = ?
         ORDER BY COALESCE(sequence_number, created_at) ASC, created_at ASC`,
      )
      .all(conversationId);
  }

  createMessage(message) {
    const createdAt =
      typeof message.created_at === "number"
        ? message.created_at
        : typeof message.createdAt === "number"
          ? message.createdAt
          : Date.now();

    const upsertStmt = this.db.prepare(
      `
        INSERT INTO messages (id, conversation_id, role, parts_structure, model_name, xml_version_id, sequence_number, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          conversation_id = excluded.conversation_id,
          role = excluded.role,
          parts_structure = excluded.parts_structure,
          model_name = excluded.model_name,
          xml_version_id = excluded.xml_version_id,
          sequence_number = excluded.sequence_number,
          created_at = excluded.created_at
      `,
    );

    try {
      // 单条写入仍使用事务，确保与批量行为一致
      const runInTx = this.db.transaction((msg) => {
        const sequenceNumber =
          typeof msg.sequence_number === "number"
            ? msg.sequence_number
            : this._getNextSequenceNumber(msg.conversation_id);

        if (typeof msg.sequence_number === "number") {
          this._ensureSequenceFloor(msg.conversation_id, sequenceNumber);
        }

        upsertStmt.run(
          msg.id,
          msg.conversation_id,
          msg.role,
          msg.parts_structure,
          msg.model_name || null,
          msg.xml_version_id || null,
          sequenceNumber,
          createdAt,
        );
      });

      runInTx(message);
    } catch (error) {
      console.error("[SQLiteManager] 创建/更新消息失败，已回滚", {
        id: message?.id,
        error,
      });
      throw error;
    }

    return this.db
      .prepare("SELECT * FROM messages WHERE id = ?")
      .get(message.id);
  }

  deleteMessage(id) {
    this.db.prepare("DELETE FROM messages WHERE id = ?").run(id);
  }

  createMessages(messages) {
    const upsertStmt = this.db.prepare(`
      INSERT INTO messages (id, conversation_id, role, parts_structure, model_name, xml_version_id, sequence_number, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        conversation_id = excluded.conversation_id,
        role = excluded.role,
        parts_structure = excluded.parts_structure,
        model_name = excluded.model_name,
        xml_version_id = excluded.xml_version_id,
        sequence_number = excluded.sequence_number,
        created_at = excluded.created_at
    `);

    const selectByIdStmt = this.db.prepare(
      "SELECT * FROM messages WHERE id = ?",
    );

    const transaction = this.db.transaction((msgs) => {
      const defaultTimestamp = Date.now();

      for (const msg of msgs) {
        const createdAt =
          typeof msg.created_at === "number"
            ? msg.created_at
            : typeof msg.createdAt === "number"
              ? msg.createdAt
              : defaultTimestamp;

        const providedSequence =
          typeof msg.sequence_number === "number" ? msg.sequence_number : null;

        const sequenceNumber =
          providedSequence !== null
            ? providedSequence
            : this._getNextSequenceNumber(msg.conversation_id);

        if (providedSequence !== null) {
          this._ensureSequenceFloor(msg.conversation_id, sequenceNumber);
        }

        upsertStmt.run(
          msg.id,
          msg.conversation_id,
          msg.role,
          msg.parts_structure,
          msg.model_name || null,
          msg.xml_version_id || null,
          sequenceNumber,
          createdAt,
        );
      }
    });

    try {
      transaction(messages);
    } catch (error) {
      console.error("[SQLiteManager] 批量创建/更新消息失败，已回滚", {
        ids: messages?.map((m) => m.id),
        error,
      });
      throw error;
    }

    return messages.map((msg) => selectByIdStmt.get(msg.id));
  }

  /**
   * 关闭数据库连接
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.incrementSequenceStmt = null;
      this.ensureSequenceFloorStmt = null;
    }
  }
}

module.exports = SQLiteManager;
