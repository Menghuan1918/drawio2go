/**
 * 存储层常量定义
 *
 * @module storage/constants
 */

// ==================== 默认常量（临时实现） ====================

/**
 * 默认工程 UUID
 * 临时实现：所有数据都存储在固定的 "default" 工程中
 * 未来扩展：支持多工程时移除此常量
 */
export const DEFAULT_PROJECT_UUID = 'default';

/**
 * 默认 XML 语义化版本号
 * 临时实现：所有 XML 版本都固定为 "1.0.0"
 * 未来扩展：支持真实版本管理时移除此常量
 */
export const DEFAULT_XML_VERSION = '1.0.0';

// ==================== 数据库配置 ====================

/**
 * IndexedDB 数据库名称
 * 用于 Web 环境的客户端存储
 */
export const DB_NAME = 'drawio2go';

/**
 * IndexedDB 数据库版本号
 * 变更数据库结构时需要递增此版本号
 */
export const DB_VERSION = 1;

/**
 * Electron SQLite 数据库文件名
 * 存储在用户数据目录（app.getPath('userData')）
 */
export const SQLITE_DB_FILE = 'drawio2go.db';
