# 里程碑 4：存储工厂与路由

**状态**：✅ 已完成
**预计耗时**：30 分钟
**依赖**：里程碑 2, 3

## 目标
创建存储工厂函数，实现环境自动检测和路由，统一导出存储层 API，为上层应用提供简洁的接口。

## 任务清单

### 1. 创建存储工厂函数
- [ ] 创建 `app/lib/storage/storage-factory.ts`：

```typescript
import type { StorageAdapter } from './adapter';
import { SQLiteStorage } from './sqlite-storage';
import { IndexedDBStorage } from './indexeddb-storage';

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
  let storage: StorageAdapter;

  // 检测 Electron 环境
  if (typeof window !== 'undefined' && window.electronStorage) {
    console.log('[Storage] Detected Electron environment, using SQLite');
    storage = new SQLiteStorage();
  }
  // 检测 Web 环境
  else if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
    console.log('[Storage] Detected Web environment, using IndexedDB');
    storage = new IndexedDBStorage();
  }
  // 不支持的环境
  else {
    throw new Error(
      'Unsupported environment: Neither Electron nor Web environment detected'
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
  console.log('[Storage] Storage instance reset');
}

/**
 * 检测当前存储类型
 *
 * @returns 'sqlite' | 'indexeddb' | 'unknown'
 */
export function detectStorageType(): 'sqlite' | 'indexeddb' | 'unknown' {
  if (typeof window !== 'undefined' && window.electronStorage) {
    return 'sqlite';
  } else if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
    return 'indexeddb';
  } else {
    return 'unknown';
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
```

### 2. 创建统一导出文件
- [ ] 创建 `app/lib/storage/index.ts`：

```typescript
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

export { getStorage, resetStorage, detectStorageType, isStorageInitialized } from './storage-factory';

// ==================== 类型定义 ====================

export type {
  StorageAdapter,
} from './adapter';

export type {
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
  MessageRole,
  CreateMessageInput,
  PreviewImageData,
} from './types';

// ==================== 常量 ====================

export {
  DEFAULT_PROJECT_UUID,
  DEFAULT_XML_VERSION,
  DB_NAME,
  DB_VERSION,
  SQLITE_DB_FILE,
} from './constants';

// ==================== 内部实现（仅用于测试） ====================

/**
 * ⚠️ 警告：以下导出仅用于测试和调试，
 * 不应在生产代码中直接使用
 */
export { SQLiteStorage } from './sqlite-storage';
export { IndexedDBStorage } from './indexeddb-storage';
```

### 3. 添加使用示例注释
- [ ] 在 `storage-factory.ts` 顶部添加使用示例：

```typescript
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
```

### 4. 添加环境检测日志
- [ ] 在工厂函数中添加详细的日志输出：

```typescript
async function _initializeStorage(): Promise<StorageAdapter> {
  console.log('[Storage] Initializing storage...');
  console.log('[Storage] Environment check:', {
    hasWindow: typeof window !== 'undefined',
    hasElectronStorage: typeof window !== 'undefined' && !!window.electronStorage,
    hasIndexedDB: typeof window !== 'undefined' && typeof indexedDB !== 'undefined',
  });

  // ... 环境检测和初始化代码
}
```

## 验收标准
- [ ] `storage-factory.ts` 创建成功
- [ ] `index.ts` 统一导出所有 API
- [ ] `getStorage()` 正确检测环境
- [ ] 单例模式正确实现（多次调用返回同一实例）
- [ ] `detectStorageType()` 返回正确的类型
- [ ] `resetStorage()` 可清除实例缓存
- [ ] 所有导出都有 JSDoc 注释
- [ ] 编译无 TypeScript 错误

## 测试步骤

### 1. 类型检查
```bash
pnpm run build
# 或
pnpm tsc --noEmit
```

### 2. Electron 环境测试
```bash
pnpm run electron:dev
```

在开发者工具控制台测试：
```javascript
// 1. 检测存储类型
const { detectStorageType } = await import('@/lib/storage');
console.log(detectStorageType()); // 应输出 'sqlite'

// 2. 获取存储实例
const { getStorage } = await import('@/lib/storage');
const storage = await getStorage();
console.log(storage.constructor.name); // 应输出 'SQLiteStorage'

// 3. 测试单例
const storage2 = await getStorage();
console.log(storage === storage2); // 应输出 true

// 4. 测试基本操作
await storage.setSetting('test', 'hello');
const value = await storage.getSetting('test');
console.log(value); // 应输出 'hello'
```

### 3. Web 环境测试
```bash
pnpm run dev
```

在浏览器控制台测试：
```javascript
// 1. 检测存储类型
const { detectStorageType } = await import('@/lib/storage');
console.log(detectStorageType()); // 应输出 'indexeddb'

// 2. 获取存储实例
const { getStorage } = await import('@/lib/storage');
const storage = await getStorage();
console.log(storage.constructor.name); // 应输出 'IndexedDBStorage'

// 3. 测试单例
const storage2 = await getStorage();
console.log(storage === storage2); // 应输出 true

// 4. 测试基本操作
await storage.setSetting('test', 'world');
const value = await storage.getSetting('test');
console.log(value); // 应输出 'world'
```

## 设计要点

### 单例模式
```typescript
// ✅ 正确：全局只有一个实例
const storage1 = await getStorage();
const storage2 = await getStorage();
console.log(storage1 === storage2); // true

// ❌ 错误：直接创建实例
const storage = new SQLiteStorage(); // 不推荐
```

### 环境检测优先级
1. 检测 `window.electronStorage`（Electron）
2. 检测 `indexedDB`（Web）
3. 抛出错误（不支持的环境）

### 初始化时机
```typescript
// 懒加载：第一次调用 getStorage() 时才初始化
const storage = await getStorage(); // ← 这里初始化

// 之后的调用直接返回缓存实例
const storage2 = await getStorage(); // ← 无需再次初始化
```

### 错误处理
```typescript
try {
  const storage = await getStorage();
} catch (error) {
  if (error.message.includes('Unsupported environment')) {
    // 不支持的环境（如 Node.js）
  } else {
    // 初始化失败
  }
}
```

## 注意事项

### 服务端渲染（SSR）
- Next.js App Router 默认使用 SSR
- 服务端没有 `window` 对象
- 确保存储操作只在客户端执行：

```typescript
'use client'; // 必须添加此指令

import { getStorage } from '@/lib/storage';

export function MyComponent() {
  useEffect(() => {
    // ✅ 在客户端执行
    getStorage().then(storage => {
      // ...
    });
  }, []);

  // ❌ 不要在服务端执行
  // const storage = await getStorage(); // 错误！
}
```

### 测试环境
- 单元测试可能没有 `window` 或 `indexedDB`
- 使用 `resetStorage()` 清理测试状态
- 考虑创建 MockStorage 实现

### 并发初始化
```typescript
// ✅ 正确：多次并发调用会等待同一个初始化
const [storage1, storage2, storage3] = await Promise.all([
  getStorage(),
  getStorage(),
  getStorage(),
]);
console.log(storage1 === storage2 === storage3); // true
```

## 可扩展性

### 未来可添加的功能

#### 1. 存储切换（用于测试）
```typescript
export function setStorageType(type: 'sqlite' | 'indexeddb'): void {
  // 强制使用特定存储类型
}
```

#### 2. 存储事件监听
```typescript
export function onStorageChange(callback: (event: StorageEvent) => void): void {
  // 监听存储变化
}
```

#### 3. 存储健康检查
```typescript
export async function checkStorageHealth(): Promise<{
  available: boolean;
  type: string;
  quota?: number;
}> {
  const storage = await getStorage();
  // 检查存储状态
}
```

#### 4. MockStorage（测试用）
```typescript
export class MockStorage implements StorageAdapter {
  private data = new Map();

  async getSetting(key: string) {
    return this.data.get(key) || null;
  }

  // ...
}
```

## 调试技巧

### 查看存储实例
```javascript
// 在控制台查看当前存储实例
const { getStorage } = await import('@/lib/storage');
const storage = await getStorage();
console.log(storage);
```

### 强制重新初始化
```javascript
// 清除缓存并重新初始化
const { resetStorage, getStorage } = await import('@/lib/storage');
resetStorage();
const storage = await getStorage();
```

### 环境信息
```javascript
// 查看环境检测结果
const { detectStorageType } = await import('@/lib/storage');
console.log('Storage type:', detectStorageType());
console.log('Has Electron:', !!window.electronStorage);
console.log('Has IndexedDB:', typeof indexedDB !== 'undefined');
```

## 破坏性变更
- 🆕 新增存储工厂函数
- 🆕 新增统一导出 API

## 下一步
完成后继续 [里程碑 5：React Hooks 封装](./milestone-5.md)

---

**提示**：此里程碑整合 SQLite 和 IndexedDB 实现，提供统一的访问接口。
