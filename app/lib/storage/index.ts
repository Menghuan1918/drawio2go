/**
 * DrawIO2Go 抽象存储层
 *
 * 提供跨平台的统一存储接口：
 * - Electron 环境：使用 SQLite (better-sqlite3)
 * - Web 环境：使用 IndexedDB (idb)
 *
 * 使用方式：
 * ```typescript
 * import { getStorage } from '@/lib/storage';
 *
 * const storage = await getStorage();
 * await storage.setSetting('key', 'value');
 * const value = await storage.getSetting('key');
 * ```
 *
 * @module storage
 */

// ==================== 核心 API ====================

export {
  getStorage,
  resetStorage,
  detectStorageType,
  isStorageInitialized,
} from "./storage-factory";
export { buildPageMetadataFromXml } from "./page-metadata";

// ==================== 类型定义 ====================

export type { StorageAdapter } from "./adapter";

export type {
  Setting,
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  XMLVersion,
  XMLVersionSVGData,
  CreateXMLVersionInput,
  Conversation,
  CreateConversationInput,
  UpdateConversationInput,
  Message,
  MessageRole,
  CreateMessageInput,
  PreviewImageData,
  ConversationExportItem,
} from "./types";

// ==================== 常量 ====================

export {
  DEFAULT_PROJECT_UUID,
  DEFAULT_XML_VERSION,
  WIP_VERSION,
  DEFAULT_FIRST_VERSION,
  DB_NAME,
  DB_VERSION,
  SQLITE_DB_FILE,
  MAX_SVG_BLOB_BYTES,
  ZERO_SOURCE_VERSION_ID,
  DIFF_KEYFRAME_THRESHOLD,
  MAX_DIFF_CHAIN_LENGTH,
} from "./constants";

// ==================== 当前工程工具 ====================
export {
  CURRENT_PROJECT_SETTING_KEY,
  getStoredCurrentProjectId,
  persistCurrentProjectId,
  resolveCurrentProjectUuid,
} from "./current-project";
export {
  persistWipVersion,
  persistHistoricalVersion,
  prepareXmlContext,
} from "./writers";

// ==================== 内部实现（仅用于测试） ====================

/**
 * ⚠️ 警告：以下导出仅用于测试和调试，
 * 不应在生产代码中直接使用
 */
export { SQLiteStorage } from "./sqlite-storage";
export { IndexedDBStorage } from "./indexeddb-storage";
