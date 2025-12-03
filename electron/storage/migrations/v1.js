/**
 * SQLite v1 迁移
 *
 * 包含完整的表结构：
 * - settings: 应用设置
 * - projects: 项目信息
 * - xml_versions: XML 版本管理
 * - conversations: 聊天会话
 * - messages: 聊天消息（含 sequence_number 字段）
 * - conversation_sequences: 会话序列号追踪
 */
function applySQLiteV1Migration(db) {
  // Settings
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Projects
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      uuid TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      active_xml_version_id TEXT,
      active_conversation_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // XML Versions
  db.exec(`
    CREATE TABLE IF NOT EXISTS xml_versions (
      id TEXT PRIMARY KEY,
      project_uuid TEXT NOT NULL,
      semantic_version TEXT NOT NULL,
      name TEXT,
      description TEXT,
      source_version_id TEXT NOT NULL,
      is_keyframe INTEGER NOT NULL DEFAULT 1,
      diff_chain_depth INTEGER NOT NULL DEFAULT 0,
      xml_content TEXT NOT NULL,
      metadata TEXT,
      page_count INTEGER NOT NULL DEFAULT 1,
      page_names TEXT,
      preview_svg BLOB,
      pages_svg BLOB,
      preview_image BLOB,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (project_uuid) REFERENCES projects(uuid) ON DELETE CASCADE
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_xml_versions_project
    ON xml_versions(project_uuid)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_xml_versions_source
    ON xml_versions(source_version_id)
  `);

  // Conversations
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      project_uuid TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (project_uuid) REFERENCES projects(uuid) ON DELETE CASCADE
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_conversations_project
    ON conversations(project_uuid)
  `);

  // Messages
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      parts_structure TEXT NOT NULL,
      model_name TEXT,
      xml_version_id TEXT,
      sequence_number INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (xml_version_id) REFERENCES xml_versions(id) ON DELETE SET NULL
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_conversation
    ON messages(conversation_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_xml_version
    ON messages(xml_version_id)
  `);
  // 消息序列号复合索引（用于按序查询）
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_sequence
    ON messages(conversation_id, sequence_number)
  `);

  // 会话序列号追踪表
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_sequences (
      conversation_id TEXT PRIMARY KEY,
      last_sequence INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    )
  `);
}

module.exports = { applySQLiteV1Migration };
