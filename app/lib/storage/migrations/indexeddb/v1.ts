import type { IDBPDatabase, IDBPObjectStore, IDBPTransaction } from "idb";

type VersionChangeStore = IDBPObjectStore<
  unknown,
  ArrayLike<string>,
  string,
  "versionchange"
>;

const INDEX_OPTIONS = { unique: false } as const;

function hasIndex(store: VersionChangeStore, name: string): boolean {
  const list = store.indexNames;
  if (!list) {
    return false;
  }
  if (typeof list.contains === "function") {
    return list.contains(name);
  }
  for (let i = 0; i < list.length; i += 1) {
    if (list[i] === name) {
      return true;
    }
  }
  return false;
}

function ensureIndex(
  store: VersionChangeStore,
  name: string,
  keyPath: string | string[],
) {
  if (!hasIndex(store, name)) {
    store.createIndex(name, keyPath, INDEX_OPTIONS);
  }
}

function ensureStore(
  db: IDBPDatabase<unknown>,
  tx: IDBPTransaction<unknown, string[], "versionchange">,
  name: string,
  options: IDBObjectStoreParameters,
): VersionChangeStore {
  if (!db.objectStoreNames.contains(name)) {
    return db.createObjectStore(name, options) as VersionChangeStore;
  }
  return tx.objectStore(name) as VersionChangeStore;
}

/**
 * IndexedDB v1 迁移
 *
 * 包含完整的表结构：
 * - settings: 应用设置
 * - projects: 项目信息
 * - xml_versions: XML 版本管理
 * - conversations: 聊天会话
 * - messages: 聊天消息（含 sequence_number 字段）
 * - conversation_sequences: 会话序列号追踪
 */
export function applyIndexedDbV1Migration(
  db: IDBPDatabase<unknown>,
  tx: IDBPTransaction<unknown, string[], "versionchange">,
) {
  ensureStore(db, tx, "settings", { keyPath: "key" });
  ensureStore(db, tx, "projects", { keyPath: "uuid" });

  const xmlStore = ensureStore(db, tx, "xml_versions", { keyPath: "id" });
  ensureIndex(xmlStore, "project_uuid", "project_uuid");
  ensureIndex(xmlStore, "source_version_id", "source_version_id");

  const convStore = ensureStore(db, tx, "conversations", { keyPath: "id" });
  ensureIndex(convStore, "project_uuid", "project_uuid");

  // messages: { id, conversation_id, role, parts_structure, model_name?, xml_version_id?, sequence_number?, created_at }
  const msgStore = ensureStore(db, tx, "messages", { keyPath: "id" });
  ensureIndex(msgStore, "conversation_id", "conversation_id");
  ensureIndex(msgStore, "xml_version_id", "xml_version_id");
  // 消息序列号复合索引（用于按序查询）
  ensureIndex(msgStore, "conversation_id_sequence_number", [
    "conversation_id",
    "sequence_number",
  ]);

  // 会话序列号追踪表
  ensureStore(db, tx, "conversation_sequences", {
    keyPath: "conversation_id",
  });
}
