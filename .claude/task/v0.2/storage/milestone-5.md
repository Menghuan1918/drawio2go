# 里程碑 5：React Hooks 封装

**状态**：✅ 已完成
**实际耗时**：约 60 分钟
**依赖**：里程碑 4

## 目标

创建 React Hooks 封装存储层 API，提供响应式的数据管理，自动处理加载状态和错误，简化组件中的存储操作。

## 任务清单

### 1. 创建设置管理 Hook

- [x] 创建 `app/hooks/useStorageSettings.ts`：

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { getStorage } from "@/lib/storage";
import type { LLMConfig } from "@/types/chat";

/**
 * 设置管理 Hook
 *
 * 提供设置的读取、保存和删除功能，
 * 自动处理加载状态和错误
 */
export function useStorageSettings() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  /**
   * 获取设置值
   */
  const getSetting = useCallback(
    async (key: string): Promise<string | null> => {
      try {
        const storage = await getStorage();
        return await storage.getSetting(key);
      } catch (err) {
        const error = err as Error;
        setError(error);
        throw error;
      }
    },
    [],
  );

  /**
   * 设置值
   */
  const setSetting = useCallback(
    async (key: string, value: string): Promise<void> => {
      try {
        const storage = await getStorage();
        await storage.setSetting(key, value);
      } catch (err) {
        const error = err as Error;
        setError(error);
        throw error;
      }
    },
    [],
  );

  /**
   * 删除设置
   */
  const deleteSetting = useCallback(async (key: string): Promise<void> => {
    try {
      const storage = await getStorage();
      await storage.deleteSetting(key);
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    }
  }, []);

  /**
   * 获取所有设置
   */
  const getAllSettings = useCallback(async () => {
    try {
      const storage = await getStorage();
      return await storage.getAllSettings();
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    }
  }, []);

  /**
   * 获取 LLM 配置
   */
  const getLLMConfig = useCallback(async (): Promise<LLMConfig | null> => {
    try {
      const value = await getSetting("llmConfig");
      return value ? JSON.parse(value) : null;
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    }
  }, [getSetting]);

  /**
   * 保存 LLM 配置
   */
  const saveLLMConfig = useCallback(
    async (config: LLMConfig): Promise<void> => {
      try {
        await setSetting("llmConfig", JSON.stringify(config));
      } catch (err) {
        const error = err as Error;
        setError(error);
        throw error;
      }
    },
    [setSetting],
  );

  /**
   * 获取默认路径
   */
  const getDefaultPath = useCallback(async (): Promise<string | null> => {
    try {
      return await getSetting("defaultPath");
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    }
  }, [getSetting]);

  /**
   * 保存默认路径
   */
  const saveDefaultPath = useCallback(
    async (path: string): Promise<void> => {
      try {
        await setSetting("defaultPath", path);
      } catch (err) {
        const error = err as Error;
        setError(error);
        throw error;
      }
    },
    [setSetting],
  );

  // 初始化时检查存储可用性
  useEffect(() => {
    getStorage()
      .then(() => {
        setLoading(false);
      })
      .catch((err) => {
        setError(err);
        setLoading(false);
      });
  }, []);

  return {
    loading,
    error,
    getSetting,
    setSetting,
    deleteSetting,
    getAllSettings,
    getLLMConfig,
    saveLLMConfig,
    getDefaultPath,
    saveDefaultPath,
  };
}
```

### 2. 创建工程管理 Hook

- [x] 创建 `app/hooks/useStorageProjects.ts`：

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { getStorage, DEFAULT_PROJECT_UUID } from "@/lib/storage";
import type { Project } from "@/lib/storage";

/**
 * 工程管理 Hook
 *
 * 临时实现：仅查询默认工程
 * 未来扩展：支持多工程管理
 */
export function useStorageProjects() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [defaultProject, setDefaultProject] = useState<Project | null>(null);

  /**
   * 获取默认工程
   */
  const getDefaultProject = useCallback(async (): Promise<Project | null> => {
    try {
      const storage = await getStorage();
      const project = await storage.getProject(DEFAULT_PROJECT_UUID);
      setDefaultProject(project);
      return project;
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    }
  }, []);

  /**
   * 更新默认工程
   */
  const updateDefaultProject = useCallback(
    async (
      updates: Partial<Omit<Project, "uuid" | "created_at" | "updated_at">>,
    ): Promise<void> => {
      try {
        const storage = await getStorage();
        await storage.updateProject(DEFAULT_PROJECT_UUID, updates);
        await getDefaultProject(); // 刷新
      } catch (err) {
        const error = err as Error;
        setError(error);
        throw error;
      }
    },
    [getDefaultProject],
  );

  // 初始化时加载默认工程
  useEffect(() => {
    getDefaultProject()
      .then(() => {
        setLoading(false);
      })
      .catch((err) => {
        setError(err);
        setLoading(false);
      });
  }, [getDefaultProject]);

  return {
    loading,
    error,
    defaultProject,
    getDefaultProject,
    updateDefaultProject,
  };
}
```

### 3. 创建 XML 版本管理 Hook

- [x] 创建 `app/hooks/useStorageXMLVersions.ts`：

```typescript
"use client";

import { useState, useCallback } from "react";
import {
  getStorage,
  DEFAULT_PROJECT_UUID,
  DEFAULT_XML_VERSION,
} from "@/lib/storage";
import type { XMLVersion } from "@/lib/storage";

/**
 * XML 版本管理 Hook
 *
 * 临时实现：固定使用 semantic_version="1.0.0"
 * 未来扩展：支持多版本管理
 */
export function useStorageXMLVersions() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * 保存 XML（创建新版本）
   *
   * @param xml XML 内容
   * @param previewImage 预览图（可选）
   * @param name 版本名称（可选）
   * @param description 版本描述（可选）
   * @returns 创建的 XML 版本
   */
  const saveXML = useCallback(
    async (
      xml: string,
      previewImage?: Blob,
      name?: string,
      description?: string,
    ): Promise<XMLVersion> => {
      setLoading(true);
      setError(null);

      try {
        const storage = await getStorage();
        const version = await storage.createXMLVersion({
          project_uuid: DEFAULT_PROJECT_UUID,
          semantic_version: DEFAULT_XML_VERSION,
          xml_content: xml,
          preview_image: previewImage,
          name,
          description,
          source_version_id: 0,
        });

        setLoading(false);
        return version;
      } catch (err) {
        const error = err as Error;
        setError(error);
        setLoading(false);
        throw error;
      }
    },
    [],
  );

  /**
   * 获取当前 XML（获取最新版本）
   */
  const getCurrentXML = useCallback(async (): Promise<string | null> => {
    setLoading(true);
    setError(null);

    try {
      const storage = await getStorage();
      const versions =
        await storage.getXMLVersionsByProject(DEFAULT_PROJECT_UUID);

      if (versions.length === 0) {
        setLoading(false);
        return null;
      }

      // 返回最新版本的 XML
      const latest = versions[0];
      setLoading(false);
      return latest.xml_content;
    } catch (err) {
      const error = err as Error;
      setError(error);
      setLoading(false);
      throw error;
    }
  }, []);

  /**
   * 获取所有 XML 版本
   */
  const getAllXMLVersions = useCallback(async (): Promise<XMLVersion[]> => {
    setLoading(true);
    setError(null);

    try {
      const storage = await getStorage();
      const versions =
        await storage.getXMLVersionsByProject(DEFAULT_PROJECT_UUID);
      setLoading(false);
      return versions;
    } catch (err) {
      const error = err as Error;
      setError(error);
      setLoading(false);
      throw error;
    }
  }, []);

  /**
   * 获取指定版本
   */
  const getXMLVersion = useCallback(
    async (id: number): Promise<XMLVersion | null> => {
      setLoading(true);
      setError(null);

      try {
        const storage = await getStorage();
        const version = await storage.getXMLVersion(id);
        setLoading(false);
        return version;
      } catch (err) {
        const error = err as Error;
        setError(error);
        setLoading(false);
        throw error;
      }
    },
    [],
  );

  return {
    loading,
    error,
    saveXML,
    getCurrentXML,
    getAllXMLVersions,
    getXMLVersion,
  };
}
```

### 4. 创建对话管理 Hook

- [x] 创建 `app/hooks/useStorageConversations.ts`：

```typescript
"use client";

import { useState, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { getStorage, DEFAULT_PROJECT_UUID } from "@/lib/storage";
import type { Conversation, Message, CreateMessageInput } from "@/lib/storage";

/**
 * 对话管理 Hook
 *
 * 管理对话和消息的创建、读取、更新、删除
 */
export function useStorageConversations() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * 创建对话
   *
   * @param xmlVersionId 关联的 XML 版本 ID
   * @param title 对话标题
   * @returns 创建的对话
   */
  const createConversation = useCallback(
    async (
      xmlVersionId: number,
      title: string = "New Chat",
    ): Promise<Conversation> => {
      setLoading(true);
      setError(null);

      try {
        const storage = await getStorage();
        const conversation = await storage.createConversation({
          id: uuidv4(),
          project_uuid: DEFAULT_PROJECT_UUID,
          xml_version_id: xmlVersionId,
          title,
        });

        setLoading(false);
        return conversation;
      } catch (err) {
        const error = err as Error;
        setError(error);
        setLoading(false);
        throw error;
      }
    },
    [],
  );

  /**
   * 获取对话
   */
  const getConversation = useCallback(
    async (id: string): Promise<Conversation | null> => {
      setLoading(true);
      setError(null);

      try {
        const storage = await getStorage();
        const conversation = await storage.getConversation(id);
        setLoading(false);
        return conversation;
      } catch (err) {
        const error = err as Error;
        setError(error);
        setLoading(false);
        throw error;
      }
    },
    [],
  );

  /**
   * 更新对话
   */
  const updateConversation = useCallback(
    async (
      id: string,
      updates: Partial<Pick<Conversation, "title" | "xml_version_id">>,
    ): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        const storage = await getStorage();
        await storage.updateConversation(id, updates);
        setLoading(false);
      } catch (err) {
        const error = err as Error;
        setError(error);
        setLoading(false);
        throw error;
      }
    },
    [],
  );

  /**
   * 删除对话
   */
  const deleteConversation = useCallback(async (id: string): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const storage = await getStorage();
      await storage.deleteConversation(id);
      setLoading(false);
    } catch (err) {
      const error = err as Error;
      setError(error);
      setLoading(false);
      throw error;
    }
  }, []);

  /**
   * 获取所有对话
   */
  const getAllConversations = useCallback(async (): Promise<Conversation[]> => {
    setLoading(true);
    setError(null);

    try {
      const storage = await getStorage();
      const conversations =
        await storage.getConversationsByProject(DEFAULT_PROJECT_UUID);
      setLoading(false);
      return conversations;
    } catch (err) {
      const error = err as Error;
      setError(error);
      setLoading(false);
      throw error;
    }
  }, []);

  /**
   * 获取对话的所有消息
   */
  const getMessages = useCallback(
    async (conversationId: string): Promise<Message[]> => {
      setLoading(true);
      setError(null);

      try {
        const storage = await getStorage();
        const messages =
          await storage.getMessagesByConversation(conversationId);
        setLoading(false);
        return messages;
      } catch (err) {
        const error = err as Error;
        setError(error);
        setLoading(false);
        throw error;
      }
    },
    [],
  );

  /**
   * 添加消息
   */
  const addMessage = useCallback(
    async (
      conversationId: string,
      role: "user" | "assistant" | "system",
      content: string,
      toolInvocations?: any,
    ): Promise<Message> => {
      setLoading(true);
      setError(null);

      try {
        const storage = await getStorage();
        const message = await storage.createMessage({
          id: uuidv4(),
          conversation_id: conversationId,
          role,
          content,
          tool_invocations: toolInvocations
            ? JSON.stringify(toolInvocations)
            : undefined,
        });

        setLoading(false);
        return message;
      } catch (err) {
        const error = err as Error;
        setError(error);
        setLoading(false);
        throw error;
      }
    },
    [],
  );

  /**
   * 批量添加消息
   */
  const addMessages = useCallback(
    async (messages: CreateMessageInput[]): Promise<Message[]> => {
      setLoading(true);
      setError(null);

      try {
        const storage = await getStorage();
        const created = await storage.createMessages(messages);
        setLoading(false);
        return created;
      } catch (err) {
        const error = err as Error;
        setError(error);
        setLoading(false);
        throw error;
      }
    },
    [],
  );

  return {
    loading,
    error,
    createConversation,
    getConversation,
    updateConversation,
    deleteConversation,
    getAllConversations,
    getMessages,
    addMessage,
    addMessages,
  };
}
```

## 验收标准

- [x] 4 个 Hook 文件全部创建
- [x] 所有 Hook 使用 `'use client'` 指令
- [x] 所有 Hook 提供 loading 和 error 状态
- [x] 所有方法使用 useCallback 优化
- [x] 临时实现正确使用默认常量
- [x] 所有方法都有 JSDoc 注释
- [x] 编译无 TypeScript 错误

## 测试步骤

### 1. 在组件中使用 Hooks

创建测试组件 `app/components/StorageTest.tsx`：

```typescript
'use client';

import { useStorageSettings, useStorageXMLVersions, useStorageConversations } from '@/hooks';

export function StorageTest() {
  const settings = useStorageSettings();
  const xml = useStorageXMLVersions();
  const conversations = useStorageConversations();

  const handleTest = async () => {
    try {
      // 测试设置
      await settings.saveLLMConfig({
        apiUrl: 'https://api.test.com',
        apiKey: 'test-key',
        modelName: 'gpt-4',
        temperature: 0.7,
        maxToolRounds: 10,
        providerType: 'openai-compatible',
        systemPrompt: 'You are a helpful assistant.',
      });

      // 测试 XML
      const version = await xml.saveXML('<diagram></diagram>');
      console.log('Saved XML version:', version);

      // 测试对话
      const conv = await conversations.createConversation(version.id, 'Test Chat');
      await conversations.addMessage(conv.id, 'user', 'Hello!');

      console.log('All tests passed!');
    } catch (error) {
      console.error('Test failed:', error);
    }
  };

  return (
    <div>
      <button onClick={handleTest}>Run Storage Test</button>
      {settings.loading && <p>Loading...</p>}
      {settings.error && <p>Error: {settings.error.message}</p>}
    </div>
  );
}
```

### 2. 集成测试

1. 启动应用：`pnpm run dev` 或 `pnpm run electron:dev`
2. 渲染 `<StorageTest />` 组件
3. 点击按钮执行测试
4. 检查控制台输出
5. 验证数据库中的数据

## 设计要点

### Hook 设计模式

```typescript
// ✅ 良好的 Hook 设计
export function useStorageXXX() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const method = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // ... 操作
      setLoading(false);
    } catch (err) {
      setError(err);
      setLoading(false);
      throw err; // 重新抛出，让调用者处理
    }
  }, []);

  return { loading, error, method };
}
```

### 错误处理策略

```typescript
// 在 Hook 中设置 error 状态
setError(error);

// 重新抛出错误，让组件处理
throw error;

// 组件中使用
try {
  await saveXML(xml);
} catch (error) {
  // 显示错误提示
  toast.error(error.message);
}
```

### 临时实现注释

```typescript
/**
 * 临时实现：固定使用 DEFAULT_PROJECT_UUID
 * 未来扩展：支持多工程切换
 */
const project_uuid = DEFAULT_PROJECT_UUID;
```

## 注意事项

### 'use client' 指令

- 所有 Hook 文件必须添加 `'use client'`
- 确保在第一行，注释之前

### useCallback 依赖

```typescript
// ✅ 正确：明确列出依赖
const method = useCallback(async () => {
  await otherMethod();
}, [otherMethod]);

// ❌ 错误：缺少依赖
const method = useCallback(async () => {
  await otherMethod(); // 缺少依赖！
}, []);
```

### 避免循环依赖

```typescript
// ❌ 错误：Hook 之间相互依赖
export function useA() {
  const { method } = useB(); // 循环依赖！
}

export function useB() {
  const { method } = useA(); // 循环依赖！
}
```

## 可扩展性

### 未来可添加的 Hook

#### 1. useStorageSync（数据同步）

```typescript
export function useStorageSync() {
  const syncToRemote = useCallback(async () => {
    // 同步到远程服务器
  }, []);

  return { syncToRemote };
}
```

#### 2. useStorageExport（数据导出）

```typescript
export function useStorageExport() {
  const exportAll = useCallback(async () => {
    // 导出所有数据为 JSON
  }, []);

  return { exportAll };
}
```

#### 3. useStorageSearch（数据搜索）

```typescript
export function useStorageSearch() {
  const searchConversations = useCallback(async (query: string) => {
    // 全文搜索对话
  }, []);

  return { searchConversations };
}
```

## 破坏性变更

- 🆕 新增 4 个存储 Hook
- 🆕 替代现有的 useLLMConfig 和 useChatSessions

## 下一步

完成后继续 [里程碑 6：集成测试与文档](./milestone-6.md)

---

**提示**：此里程碑创建 React Hooks 封装，为组件提供便捷的存储 API。
