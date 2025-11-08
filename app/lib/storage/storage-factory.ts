/**
 * 存储工厂模块
 *
 * 使用示例：
 *
 * @example 基本使用
 * ```typescript
 * import { getStorage } from '@/lib/storage';
 *
 * async function saveConfig() {
 *   const storage = await getStorage();
 *   await storage.setSetting('llmConfig', JSON.stringify(config));
 * }
 * ```
 *
 * @example 检测存储类型
 * ```typescript
 * import { detectStorageType } from '@/lib/storage';
 *
 * const type = detectStorageType();
 * console.log(`Using ${type} storage`);
 * ```
 *
 * @example 错误处理
 * ```typescript
 * import { getStorage } from '@/lib/storage';
 *
 * try {
 *   const storage = await getStorage();
 *   await storage.createXMLVersion({
 *     project_uuid: 'default',
 *     semantic_version: '1.0.0',
 *     xml_content: '<diagram>...</diagram>',
 *     source_version_id: 0
 *   });
 * } catch (error) {
 *   console.error('Failed to save XML:', error);
 * }
 * ```
 *
 * @module storage-factory
 */

import type { StorageAdapter } from "./adapter";
import { SQLiteStorage } from "./sqlite-storage";
import { IndexedDBStorage } from "./indexeddb-storage";

/**
 * 存储实例缓存
 * 确保全局只有一个存储实例
 */
let storageInstance: StorageAdapter | null = null;

/**
 * 存储初始化状态
 */
let initializationPromise: Promise<StorageAdapter> | null = null;

/**
 * 获取存储实例（单例模式）
 *
 * 自动检测运行环境：
 * - Electron 环境：返回 SQLiteStorage
 * - Web 环境：返回 IndexedDBStorage
 *
 * @returns 已初始化的存储实例
 * @throws 如果不在支持的环境中
 */
export async function getStorage(): Promise<StorageAdapter> {
  // 如果已经初始化，直接返回
  if (storageInstance) {
    return storageInstance;
  }

  // 如果正在初始化，等待完成
  if (initializationPromise) {
    return initializationPromise;
  }

  // 开始初始化
  initializationPromise = _initializeStorage();

  try {
    storageInstance = await initializationPromise;
    return storageInstance;
  } catch (error) {
    // 初始化失败，清除缓存
    initializationPromise = null;
    throw error;
  }
}

/**
 * 内部初始化函数
 */
async function _initializeStorage(): Promise<StorageAdapter> {
  console.log("[Storage] Initializing storage...");
  console.log("[Storage] Environment check:", {
    hasWindow: typeof window !== "undefined",
    hasElectronStorage:
      typeof window !== "undefined" && !!window.electronStorage,
    hasIndexedDB:
      typeof window !== "undefined" && typeof indexedDB !== "undefined",
  });

  let storage: StorageAdapter;

  // 检测 Electron 环境
  if (typeof window !== "undefined" && window.electronStorage) {
    console.log("[Storage] Detected Electron environment, using SQLite");
    storage = new SQLiteStorage();
  }
  // 检测 Web 环境
  else if (typeof window !== "undefined" && typeof indexedDB !== "undefined") {
    console.log("[Storage] Detected Web environment, using IndexedDB");
    storage = new IndexedDBStorage();
  }
  // 不支持的环境
  else {
    throw new Error(
      "Unsupported environment: Neither Electron nor Web environment detected",
    );
  }

  // 初始化存储
  await storage.initialize();

  return storage;
}

/**
 * 重置存储实例（用于测试或重新初始化）
 *
 * ⚠️ 警告：此函数会清除存储实例缓存，
 * 下次调用 getStorage() 将创建新实例
 */
export function resetStorage(): void {
  storageInstance = null;
  initializationPromise = null;
  console.log("[Storage] Storage instance reset");
}

/**
 * 检测当前存储类型
 *
 * @returns 'sqlite' | 'indexeddb' | 'unknown'
 */
export function detectStorageType(): "sqlite" | "indexeddb" | "unknown" {
  if (typeof window !== "undefined" && window.electronStorage) {
    return "sqlite";
  } else if (
    typeof window !== "undefined" &&
    typeof indexedDB !== "undefined"
  ) {
    return "indexeddb";
  } else {
    return "unknown";
  }
}

/**
 * 检查存储是否已初始化
 *
 * @returns true 如果已初始化
 */
export function isStorageInitialized(): boolean {
  return storageInstance !== null;
}
