# 里程碑 6：集成测试与文档

**状态**：⏳ 待开始
**预计耗时**：30 分钟
**依赖**：里程碑 1-5

## 目标

进行完整的集成测试，确保所有功能正常工作，更新项目文档，为后续开发提供清晰的指引。

## 任务清单

### 1. 语法检查

- [ ] 运行 TypeScript 编译检查：

  ```bash
  pnpm run build
  # 或
  pnpm tsc --noEmit
  ```

- [ ] 运行 ESLint 检查：

  ```bash
  pnpm lint
  ```

- [ ] 修复所有编译错误和 Lint 警告

### 2. Electron 环境集成测试

- [ ] 启动 Electron 应用：

  ```bash
  pnpm run electron:dev
  ```

- [ ] 打开开发者工具，检查控制台日志：

  ```
  [Storage] Detected Electron environment, using SQLite
  SQLite database initialized at: /path/to/drawio2go.db
  Created default project
  ```

- [ ] 在控制台测试存储功能：

  ```javascript
  // 1. 检测存储类型
  const { detectStorageType } = await import("./app/lib/storage");
  console.log("Storage type:", detectStorageType()); // 'sqlite'

  // 2. 测试设置
  const { getStorage } = await import("./app/lib/storage");
  const storage = await getStorage();
  await storage.setSetting("test_key", "test_value");
  const value = await storage.getSetting("test_key");
  console.log("Setting value:", value); // 'test_value'

  // 3. 测试工程
  const project = await storage.getProject("default");
  console.log("Default project:", project);

  // 4. 测试 XML 版本
  const xmlVersion = await storage.createXMLVersion({
    project_uuid: "default",
    semantic_version: "1.0.0",
    xml_content: "<mxfile><diagram>Test</diagram></mxfile>",
    source_version_id: 0,
  });
  console.log("Created XML version:", xmlVersion);

  // 5. 测试对话
  const conversation = await storage.createConversation({
    id: "test-conv-1",
    project_uuid: "default",
    xml_version_id: xmlVersion.id,
    title: "Test Conversation",
  });
  console.log("Created conversation:", conversation);

  // 6. 测试消息
  const message = await storage.createMessage({
    id: "test-msg-1",
    conversation_id: "test-conv-1",
    role: "user",
    content: "Hello, world!",
  });
  console.log("Created message:", message);

  // 7. 查询消息
  const messages = await storage.getMessagesByConversation("test-conv-1");
  console.log("Messages:", messages);
  ```

- [ ] 使用 SQLite 客户端检查数据库：
  - macOS: `sqlite3 ~/Library/Application\ Support/drawio2go/drawio2go.db`
  - Linux: `sqlite3 ~/.config/drawio2go/drawio2go.db`
  - Windows: `sqlite3 %APPDATA%\drawio2go\drawio2go.db`

  ```sql
  -- 查看所有表
  .tables

  -- 查看表结构
  .schema projects
  .schema xml_versions
  .schema conversations
  .schema messages
  .schema settings

  -- 查询数据
  SELECT * FROM projects;
  SELECT * FROM xml_versions;
  SELECT * FROM conversations;
  SELECT * FROM messages;
  SELECT * FROM settings;
  ```

### 3. Web 环境集成测试

- [ ] 启动 Web 开发服务器：

  ```bash
  pnpm run dev
  ```

- [ ] 打开浏览器 (http://localhost:3000)，检查控制台日志：

  ```
  [Storage] Detected Web environment, using IndexedDB
  IndexedDB initialized
  Created default project
  ```

- [ ] 在控制台测试存储功能（同 Electron 测试代码）

- [ ] 检查 IndexedDB：
  - Chrome DevTools: Application → IndexedDB → drawio2go
  - 查看 5 个 Object Stores：
    - settings
    - projects
    - xml_versions
    - conversations
    - messages

  ```javascript
  // 手动查询 IndexedDB
  const request = indexedDB.open("drawio2go", 1);
  request.onsuccess = (event) => {
    const db = event.target.result;
    const tx = db.transaction("projects", "readonly");
    const store = tx.objectStore("projects");
    const getAllRequest = store.getAll();
    getAllRequest.onsuccess = () => {
      console.log("All projects:", getAllRequest.result);
    };
  };
  ```

### 4. 图片数据测试

- [ ] 测试图片存储和读取：

```javascript
// 创建测试图片（1x1 PNG）
const createTestImage = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "red";
  ctx.fillRect(0, 0, 1, 1);
  return new Promise((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });
};

// 测试
const storage = await getStorage();
const blob = await createTestImage();

// 创建带预览图的 XML 版本
const xmlVersion = await storage.createXMLVersion({
  project_uuid: "default",
  semantic_version: "1.0.0",
  xml_content: "<mxfile><diagram>Test</diagram></mxfile>",
  preview_image: blob,
  source_version_id: 0,
});

console.log("Created with preview image:", xmlVersion);

// 读取并验证
const retrieved = await storage.getXMLVersion(xmlVersion.id);
console.log("Retrieved preview image:", retrieved.preview_image);
console.log("Image size:", retrieved.preview_image?.size);
```

### 5. 级联删除测试

- [ ] 测试级联删除功能：

```javascript
const storage = await getStorage();

// 1. 创建测试数据
const xmlVersion = await storage.createXMLVersion({
  project_uuid: "default",
  semantic_version: "1.0.0",
  xml_content: "<test/>",
  source_version_id: 0,
});

const conversation = await storage.createConversation({
  id: "cascade-test",
  project_uuid: "default",
  xml_version_id: xmlVersion.id,
  title: "Cascade Test",
});

await storage.createMessage({
  id: "msg-1",
  conversation_id: "cascade-test",
  role: "user",
  content: "Test message",
});

// 2. 验证数据存在
console.log("Before delete:", {
  xmlVersion: await storage.getXMLVersion(xmlVersion.id),
  conversation: await storage.getConversation("cascade-test"),
  messages: await storage.getMessagesByConversation("cascade-test"),
});

// 3. 删除 XML 版本（应级联删除对话和消息）
await storage.deleteXMLVersion(xmlVersion.id);

// 4. 验证级联删除
console.log("After delete:", {
  xmlVersion: await storage.getXMLVersion(xmlVersion.id), // null
  conversation: await storage.getConversation("cascade-test"), // null
  messages: await storage.getMessagesByConversation("cascade-test"), // []
});
```

### 6. React Hooks 测试

- [ ] 创建测试组件并验证 Hooks 功能：

```typescript
// app/components/StorageTest.tsx
'use client';

import { useStorageSettings, useStorageXMLVersions, useStorageConversations } from '@/hooks';
import { Button } from '@heroui/react';

export function StorageTest() {
  const settings = useStorageSettings();
  const xml = useStorageXMLVersions();
  const conversations = useStorageConversations();

  const runTests = async () => {
    console.log('=== Storage Hooks Test ===');

    // 测试 1: 设置
    console.log('1. Testing settings...');
    await settings.setSetting('test', 'value');
    const value = await settings.getSetting('test');
    console.assert(value === 'value', 'Settings test failed');
    console.log('✓ Settings test passed');

    // 测试 2: XML
    console.log('2. Testing XML...');
    const xmlVer = await xml.saveXML('<diagram>Test</diagram>');
    console.assert(xmlVer.id > 0, 'XML test failed');
    console.log('✓ XML test passed');

    // 测试 3: 对话
    console.log('3. Testing conversations...');
    const conv = await conversations.createConversation(xmlVer.id, 'Test');
    console.assert(conv.id, 'Conversation test failed');
    console.log('✓ Conversation test passed');

    // 测试 4: 消息
    console.log('4. Testing messages...');
    await conversations.addMessage(conv.id, 'user', 'Hello');
    const msgs = await conversations.getMessages(conv.id);
    console.assert(msgs.length === 1, 'Message test failed');
    console.log('✓ Message test passed');

    console.log('=== All tests passed! ===');
  };

  return (
    <div className="p-4">
      <Button onPress={runTests}>Run Storage Tests</Button>
      {(settings.loading || xml.loading || conversations.loading) && (
        <p>Loading...</p>
      )}
      {(settings.error || xml.error || conversations.error) && (
        <p className="text-red-500">Error occurred!</p>
      )}
    </div>
  );
}
```

### 7. 更新 AGENTS.md 文档

- [ ] 在根目录 `AGENTS.md` 中添加存储层说明：

````markdown
### 3. 状态持久化

- **新存储层（v0.2）**: 统一的抽象存储层
  - Electron: SQLite (better-sqlite3)
  - Web: IndexedDB (idb)
- **数据模型**: 5 张表（Settings, Projects, XMLVersions, Conversations, Messages）
- **临时实现**: 固定使用默认工程和版本 1.0.0
- **未来扩展**: 多工程、多版本、数据同步

### 存储层架构

- **位置**: `app/lib/storage/`
- **使用方式**:

  ```typescript
  import { getStorage } from "@/lib/storage";

  const storage = await getStorage();
  await storage.setSetting("key", "value");
  ```
````

- **React Hooks**:
  - `useStorageSettings` - 设置管理
  - `useStorageProjects` - 工程管理
  - `useStorageXMLVersions` - XML 版本管理
  - `useStorageConversations` - 对话管理

````

### 8. 创建存储层开发文档
- [ ] 创建 `app/lib/storage/README.md`：

```markdown
# DrawIO2Go 存储层

## 概述

统一的抽象存储层，自动适配 Electron (SQLite) 和 Web (IndexedDB) 环境。

## 快速开始

### 基本使用

\`\`\`typescript
import { getStorage } from '@/lib/storage';

// 自动检测环境并初始化
const storage = await getStorage();

// 设置操作
await storage.setSetting('key', 'value');
const value = await storage.getSetting('key');

// XML 版本
const xmlVersion = await storage.createXMLVersion({
  project_uuid: 'default',
  semantic_version: '1.0.0',
  xml_content: '<diagram>...</diagram>',
  source_version_id: 0
});

// 对话和消息
const conversation = await storage.createConversation({
  id: uuidv4(),
  project_uuid: 'default',
  xml_version_id: xmlVersion.id,
  title: 'My Chat'
});

await storage.createMessage({
  id: uuidv4(),
  conversation_id: conversation.id,
  role: 'user',
  content: 'Hello!'
});
\`\`\`

### 使用 React Hooks

\`\`\`typescript
import { useStorageSettings, useStorageXMLVersions } from '@/hooks';

function MyComponent() {
  const settings = useStorageSettings();
  const xml = useStorageXMLVersions();

  const handleSave = async () => {
    await xml.saveXML('<diagram>...</diagram>');
  };

  return <button onClick={handleSave}>Save</button>;
}
\`\`\`

## 数据模型

### 表结构

1. **Settings**: 键值对设置
2. **Projects**: 工程管理（临时固定使用 'default'）
3. **XMLVersions**: XML 版本历史（临时固定版本 '1.0.0'）
4. **Conversations**: 对话记录（关联 XML 版本）
5. **Messages**: 消息内容

### 关系图

\`\`\`
Projects (1) ──── (N) XMLVersions
    │                     │
    │                     │
    └──── (N) Conversations (N)
                  │
                  │
                  └──── (N) Messages
\`\`\`

## API 文档

完整 API 请参考 `adapter.ts` 中的 `StorageAdapter` 接口。

## 环境支持

- ✅ Electron 38.x + SQLite
- ✅ Modern browsers + IndexedDB
- ❌ Node.js (无 window 对象)

## 注意事项

1. 所有操作都是异步的
2. 图片使用 Blob/Buffer 存储
3. 外键约束自动级联删除
4. 临时实现固定使用默认工程和版本

## 故障排除

### SQLite 编译错误
\`\`\`bash
pnpm rebuild better-sqlite3
\`\`\`

### IndexedDB 配额不足
检查可用空间：
\`\`\`javascript
const estimate = await navigator.storage.estimate();
console.log(estimate);
\`\`\`
\`\`\`

### 9. 性能测试（可选）
- [ ] 测试大量数据写入性能：

```javascript
const storage = await getStorage();

// 创建 100 个 XML 版本
console.time('Create 100 XML versions');
for (let i = 0; i < 100; i++) {
  await storage.createXMLVersion({
    project_uuid: 'default',
    semantic_version: '1.0.0',
    xml_content: `<diagram>Test ${i}</diagram>`,
    source_version_id: 0
  });
}
console.timeEnd('Create 100 XML versions');

// 批量创建 1000 条消息
console.time('Create 1000 messages');
const messages = Array.from({ length: 1000 }, (_, i) => ({
  id: `msg-${i}`,
  conversation_id: 'test-conv',
  role: 'user' as const,
  content: `Message ${i}`
}));
await storage.createMessages(messages);
console.timeEnd('Create 1000 messages');

// 查询性能
console.time('Query all XML versions');
const versions = await storage.getXMLVersionsByProject('default');
console.timeEnd('Query all XML versions');
console.log(`Found ${versions.length} versions`);
````

### 10. 清理测试数据

- [ ] Electron: 删除数据库文件并重启
- [ ] Web: 执行 `indexedDB.deleteDatabase('drawio2go')` 并刷新

## 验收标准

- [ ] 编译无错误，Lint 无警告
- [ ] Electron 环境所有测试通过
- [ ] Web 环境所有测试通过
- [ ] 图片数据正确存储和读取
- [ ] 级联删除功能正常
- [ ] React Hooks 测试通过
- [ ] AGENTS.md 文档已更新
- [ ] storage/README.md 已创建
- [ ] 性能测试结果可接受（可选）

## 测试检查清单

### 功能测试

- [x] Settings CRUD
- [x] Projects CRUD
- [x] XMLVersions CRUD
- [x] Conversations CRUD
- [x] Messages CRUD
- [x] 图片存储和读取
- [x] 级联删除
- [x] 批量操作

### 环境测试

- [x] Electron 环境
- [x] Web 环境
- [x] 环境自动检测
- [x] 数据库初始化
- [x] 默认工程创建

### Hook 测试

- [x] useStorageSettings
- [x] useStorageProjects
- [x] useStorageXMLVersions
- [x] useStorageConversations
- [x] loading 状态
- [x] error 处理

### 边界测试

- [x] 空数据处理
- [x] 不存在的 ID 查询
- [x] 重复主键
- [x] 外键约束
- [x] 大数据量（可选）

## 设计要点

### 测试驱动验证

- 先写测试用例
- 再运行测试
- 验证功能正确性
- 记录测试结果

### 文档完整性

- API 文档
- 使用示例
- 故障排除
- 架构说明

### 可维护性

- 清晰的注释
- 完整的类型定义
- 详细的日志输出
- 合理的错误提示

## 注意事项

### 测试数据清理

- 测试完成后清理测试数据
- 避免污染生产环境
- 使用独立的测试数据库（可选）

### 控制台日志

- 保留重要的初始化日志
- 移除调试用的 console.log
- 使用统一的日志格式

### 性能监控

- 记录关键操作的耗时
- 监控数据库大小
- 优化慢查询

## 常见问题

### Q: 测试失败如何调试？

A:

1. 检查控制台错误信息
2. 使用数据库客户端检查数据
3. 添加 console.log 追踪执行流程
4. 使用浏览器开发者工具断点调试

### Q: 如何重置数据库？

A:

- Electron: 删除 `drawio2go.db` 文件
- Web: `indexedDB.deleteDatabase('drawio2go')`

### Q: 性能不符合预期？

A:

1. 检查是否使用了索引
2. 优化批量操作（使用事务）
3. 减少不必要的查询
4. 考虑数据分页

## 下一步

完成此里程碑后，存储层开发完成！

后续可以：

1. 集成到现有组件中
2. 迁移旧的 localStorage 逻辑
3. 添加数据导出功能
4. 实现多版本管理（v0.3）
5. 实现多工程管理（v0.4）

---

**完成标志**：

- ✅ 所有测试通过
- ✅ 文档更新完成
- ✅ 无编译错误
- ✅ 性能可接受

**恭喜！** 🎉 抽象存储层实现完成！
