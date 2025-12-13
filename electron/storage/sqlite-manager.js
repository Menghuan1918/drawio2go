const Database = require("better-sqlite3");
const { app } = require("electron");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const {
  createDefaultDiagramXml,
} = require("../../app/lib/storage/default-diagram-xml");
const {
  DEFAULT_PROJECT_UUID,
  WIP_VERSION,
  ZERO_SOURCE_VERSION_ID,
} = require("../../app/lib/storage/constants-shared");
const { runSQLiteMigrations } = require("./migrations");

const SQLITE_DB_FILE = "drawio2go.db";

const MIME_TO_EXT = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

const ALLOWED_MIMES = Object.keys(MIME_TO_EXT);

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB

class SQLiteManager {
  constructor() {
    this.db = null;
    this.incrementSequenceStmt = null;
    this.ensureSequenceFloorStmt = null;
    this.userDataPath = null;
  }

  /**
   * 生成形如 "?, ?, ?" 的占位符字符串
   * @param {number} count 占位符数量
   */
  _generatePlaceholders(count) {
    if (!Number.isInteger(count) || count <= 0) return "";
    return Array.from({ length: count }, () => "?").join(",");
  }

  _ensureAttachmentsDir() {
    if (!this.userDataPath) {
      throw new Error("SQLiteManager not initialized: userDataPath is missing");
    }
    const dir = path.join(this.userDataPath, "attachments");
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  _safeUnlinkSync(targetPath) {
    try {
      fs.unlinkSync(targetPath);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        return;
      }
      throw error;
    }
  }

  _toBuffer(data, label = "binary") {
    if (data == null) return null;
    if (Buffer.isBuffer(data)) return data;
    if (data instanceof ArrayBuffer) {
      return Buffer.from(data);
    }
    if (ArrayBuffer.isView(data)) {
      return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    }
    if (
      typeof data === "object" &&
      data &&
      data.type === "Buffer" &&
      Array.isArray(data.data)
    ) {
      return Buffer.from(data.data);
    }
    throw new TypeError(`Unsupported ${label} type for SQLite BLOB`);
  }

  _getAttachmentExt(mimeType) {
    const ext = MIME_TO_EXT[mimeType];
    if (!ext) {
      throw new Error(`Unsupported MIME type: ${mimeType}`);
    }
    return ext;
  }

  _getAttachmentRelativePath(id, mimeType) {
    const ext = this._getAttachmentExt(mimeType);
    return path.join("attachments", `${id}${ext}`);
  }

  _getAttachmentAbsolutePath(filePath) {
    if (!this.userDataPath) {
      throw new Error("SQLiteManager not initialized: userDataPath is missing");
    }
    return path.join(this.userDataPath, filePath);
  }

  _validateAttachmentMeta(attachment, blobByteLength) {
    if (!attachment || typeof attachment !== "object") {
      throw new Error("Invalid attachment payload");
    }

    if (attachment.type !== "image") {
      throw new Error(`Unsupported attachment type: ${attachment.type}`);
    }

    if (!ALLOWED_MIMES.includes(attachment.mime_type)) {
      throw new Error(`Unsupported MIME type: ${attachment.mime_type}`);
    }

    if (typeof attachment.file_size !== "number" || attachment.file_size < 0) {
      throw new Error(`Invalid file_size: ${attachment.file_size}`);
    }

    if (attachment.file_size > MAX_ATTACHMENT_BYTES) {
      throw new Error(`File size exceeds 10MB: ${attachment.file_size} bytes`);
    }

    if (
      typeof blobByteLength === "number" &&
      blobByteLength > MAX_ATTACHMENT_BYTES
    ) {
      throw new Error(`File size exceeds 10MB: ${blobByteLength} bytes`);
    }
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
      this.userDataPath = app.getPath("userData");
      const dbPath = path.join(this.userDataPath, SQLITE_DB_FILE);

      // 确保目录存在
      fs.mkdirSync(this.userDataPath, { recursive: true });

      // 打开数据库
      this.db = new Database(dbPath, { verbose: console.log });

      // 启用外键 & WAL
      this.db.pragma("foreign_keys = ON");
      this.db.pragma("journal_mode = WAL");
      const finalVersion = runSQLiteMigrations(this.db);

      // 创建默认工程
      this._ensureDefaultProject();
      this._ensureDefaultWipVersion();

      console.log(
        "SQLite database initialized at:",
        dbPath,
        "version",
        finalVersion,
      );
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
    const rows = this.db
      .prepare(
        `
        SELECT a.file_path AS file_path
        FROM attachments a
        JOIN conversations c ON a.conversation_id = c.id
        WHERE c.project_uuid = ?
      `,
      )
      .all(uuid);
    const filePaths = rows.map((row) => row.file_path).filter(Boolean);

    const tx = this.db.transaction((projectUuid, paths) => {
      this.db.prepare("DELETE FROM projects WHERE uuid = ?").run(projectUuid);
      for (const filePath of paths) {
        const absPath = this._getAttachmentAbsolutePath(filePath);
        if (fs.existsSync(absPath)) {
          this._safeUnlinkSync(absPath);
        }
      }
    });

    try {
      tx(uuid, filePaths);
    } catch (error) {
      console.error("[SQLiteManager] 删除工程失败，已回滚", { uuid, error });
      throw error;
    }
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
        this._toBuffer(version.preview_svg, "preview_svg"),
        this._toBuffer(version.pages_svg, "pages_svg"),
        this._toBuffer(version.preview_image, "preview_image"),
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
          values.push(this._toBuffer(value, "preview_image"));
          break;
        }
        case "preview_svg": {
          fields.push("preview_svg = ?");
          values.push(this._toBuffer(value, "preview_svg"));
          break;
        }
        case "pages_svg": {
          fields.push("pages_svg = ?");
          values.push(this._toBuffer(value, "pages_svg"));
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
        INSERT INTO conversations (id, project_uuid, title, is_streaming, streaming_since, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        conversation.id,
        conversation.project_uuid,
        conversation.title,
        conversation.is_streaming ? 1 : 0,
        typeof conversation.streaming_since === "number"
          ? conversation.streaming_since
          : null,
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
      if (key === "id" || key === "created_at" || key === "updated_at") {
        return;
      }
      if (key === "is_streaming") {
        fields.push("is_streaming = ?");
        values.push(value ? 1 : 0);
        return;
      }
      if (key === "streaming_since") {
        fields.push("streaming_since = ?");
        values.push(typeof value === "number" ? Math.floor(value) : null);
        return;
      }
      fields.push(`${key} = ?`);
      values.push(value);
    });

    if (fields.length === 0) return;

    fields.push("updated_at = ?");
    values.push(now, id);

    this.db
      .prepare(`UPDATE conversations SET ${fields.join(", ")} WHERE id = ?`)
      .run(...values);
  }

  setConversationStreaming(id, isStreaming) {
    const now = Date.now();
    this.db
      .prepare(
        `
        UPDATE conversations
        SET is_streaming = ?, streaming_since = ?, updated_at = ?
        WHERE id = ?
      `,
      )
      .run(isStreaming ? 1 : 0, isStreaming ? now : null, now, id);
  }

  deleteConversation(id) {
    const rows = this.db
      .prepare("SELECT file_path FROM attachments WHERE conversation_id = ?")
      .all(id);
    const filePaths = rows.map((row) => row.file_path).filter(Boolean);

    const tx = this.db.transaction((conversationId, paths) => {
      this.db
        .prepare("DELETE FROM conversations WHERE id = ?")
        .run(conversationId);
      for (const filePath of paths) {
        const absPath = this._getAttachmentAbsolutePath(filePath);
        if (fs.existsSync(absPath)) {
          this._safeUnlinkSync(absPath);
        }
      }
    });

    try {
      tx(id, filePaths);
    } catch (error) {
      console.error("[SQLiteManager] 删除对话失败，已回滚", { id, error });
      throw error;
    }
  }

  batchDeleteConversations(ids = []) {
    if (!Array.isArray(ids) || ids.length === 0) return;
    const placeholders = this._generatePlaceholders(ids.length);
    const rows = this.db
      .prepare(
        `SELECT file_path FROM attachments WHERE conversation_id IN (${placeholders})`,
      )
      .all(...ids);
    const filePaths = rows.map((row) => row.file_path).filter(Boolean);

    const tx = this.db.transaction((conversationIds, paths) => {
      this.db
        .prepare(
          `DELETE FROM messages WHERE conversation_id IN (${placeholders})`,
        )
        .run(...conversationIds);
      this.db
        .prepare(`DELETE FROM conversations WHERE id IN (${placeholders})`)
        .run(...conversationIds);

      for (const filePath of paths) {
        const absPath = this._getAttachmentAbsolutePath(filePath);
        if (fs.existsSync(absPath)) {
          this._safeUnlinkSync(absPath);
        }
      }
    });

    try {
      tx(ids, filePaths);
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

    const placeholders = this._generatePlaceholders(ids.length);
    const conversations = this.db
      .prepare(
        `SELECT * FROM conversations WHERE id IN (${placeholders}) ORDER BY updated_at DESC`,
      )
      .all(...ids);

    const exportItems = conversations.map((conv) => ({
      ...conv,
      messages: this.getMessagesByConversation(conv.id),
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
    const rows = this.db
      .prepare("SELECT file_path FROM attachments WHERE message_id = ?")
      .all(id);
    const filePaths = rows.map((row) => row.file_path).filter(Boolean);

    const tx = this.db.transaction((messageId, paths) => {
      this.db.prepare("DELETE FROM messages WHERE id = ?").run(messageId);
      for (const filePath of paths) {
        const absPath = this._getAttachmentAbsolutePath(filePath);
        if (fs.existsSync(absPath)) {
          this._safeUnlinkSync(absPath);
        }
      }
    });

    try {
      tx(id, filePaths);
    } catch (error) {
      console.error("[SQLiteManager] 删除消息失败，已回滚", { id, error });
      throw error;
    }
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

  // ==================== Attachments ====================

  getAttachment(id) {
    return (
      this.db.prepare("SELECT * FROM attachments WHERE id = ?").get(id) || null
    );
  }

  getAttachmentsByMessage(messageId) {
    return this.db
      .prepare(
        "SELECT * FROM attachments WHERE message_id = ? ORDER BY created_at ASC",
      )
      .all(messageId);
  }

  getAttachmentsByConversation(conversationId) {
    return this.db
      .prepare(
        "SELECT * FROM attachments WHERE conversation_id = ? ORDER BY created_at ASC",
      )
      .all(conversationId);
  }

  createAttachment(attachment) {
    const dataBuffer = this._toBuffer(
      attachment.blob_data,
      "attachment.blob_data",
    );
    this._validateAttachmentMeta(attachment, dataBuffer?.byteLength);

    if (!dataBuffer) {
      throw new Error("blob_data is required for Electron attachments");
    }

    this._ensureAttachmentsDir();

    const relativePath = this._getAttachmentRelativePath(
      attachment.id,
      attachment.mime_type,
    );
    const absPath = this._getAttachmentAbsolutePath(relativePath);

    // 先落盘，再写数据库；数据库失败则回滚文件
    try {
      fs.writeFileSync(absPath, dataBuffer);
    } catch (fsError) {
      console.error("[SQLiteManager] 文件写入失败", {
        id: attachment.id,
        fsError,
      });
      throw new Error(`Failed to write attachment file: ${fsError.message}`);
    }

    const now = Date.now();
    const insertStmt = this.db.prepare(
      `
      INSERT INTO attachments
      (id, message_id, conversation_id, type, mime_type, file_name, file_size, width, height, file_path, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    );

    const tx = this.db.transaction((payload) => {
      insertStmt.run(
        payload.id,
        payload.message_id,
        payload.conversation_id,
        payload.type || "image",
        payload.mime_type,
        payload.file_name,
        payload.file_size,
        typeof payload.width === "number" ? payload.width : null,
        typeof payload.height === "number" ? payload.height : null,
        payload.file_path,
        payload.created_at,
      );
    });

    try {
      tx({
        ...attachment,
        file_path: relativePath,
        created_at: now,
      });
    } catch (error) {
      if (fs.existsSync(absPath)) {
        this._safeUnlinkSync(absPath);
      }
      console.error("[SQLiteManager] 创建附件失败，已回滚", {
        id: attachment?.id,
        error,
      });
      throw error;
    }

    return this.getAttachment(attachment.id);
  }

  deleteAttachment(id) {
    const existing = this.getAttachment(id);
    if (!existing) return;

    const absPath =
      existing.file_path && this.userDataPath
        ? this._getAttachmentAbsolutePath(existing.file_path)
        : null;

    const deleteStmt = this.db.prepare("DELETE FROM attachments WHERE id = ?");
    const tx = this.db.transaction((attachmentId, filePathAbs) => {
      deleteStmt.run(attachmentId);
      if (filePathAbs && fs.existsSync(filePathAbs)) {
        this._safeUnlinkSync(filePathAbs);
      }
    });

    try {
      tx(id, absPath);
    } catch (error) {
      console.error("[SQLiteManager] 删除附件失败，已回滚", { id, error });
      throw error;
    }
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
