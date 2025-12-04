# Milestone 2: 存储层方法实现

## 目标

在 `useStorageSettings` Hook中实现完整的供应商、模型、Agent设置和活动模型的CRUD操作方法，确保数据持久化的可靠性和一致性。

## 优先级

🔴 **最高优先级** - UI和API都依赖存储层

## 任务列表

### 1. 供应商管理方法

**文件**: `app/hooks/useStorageSettings.ts`

- [x] 实现 `getProviders()` 方法
  - 从存储读取 `llm_providers` 键
  - 解析JSON为 `ProviderConfig[]`
  - 不存在时调用 `initializeDefaultLLMConfig()`
  - 使用 `runStorageTask` 包装（8秒超时）

- [x] 实现 `saveProviders()` 方法
  - 接收 `ProviderConfig[]` 参数
  - 序列化为JSON并写入 `llm_providers` 键
  - 使用 `runStorageTask` 包装

- [x] 实现 `addProvider()` 方法
  - 接收供应商信息（不包含id和时间戳）
  - 生成UUID作为id
  - 设置 createdAt 和 updatedAt
  - **初始化 customConfig 为空对象 `{}`**
  - 添加到现有供应商列表
  - 调用 `saveProviders()` 持久化
  - 返回完整的 `ProviderConfig`

- [x] 实现 `updateProvider()` 方法
  - 接收providerId和部分更新数据
  - 查找并更新对应供应商
  - **支持更新 customConfig 字段（合并而非完全覆盖）**
  - 更新 updatedAt 时间戳
  - 调用 `saveProviders()` 持久化

- [x] 实现 `deleteProvider()` 方法
  - 接收providerId
  - 检查是否为当前活动模型的供应商
  - 如果是，先切换活动模型到其他供应商
  - 从列表中移除该供应商
  - 调用 `saveProviders()` 持久化

### 2. 模型管理方法

**文件**: `app/hooks/useStorageSettings.ts`

- [x] 实现 `addModel()` 方法
  - 接收providerId和模型信息
  - 生成UUID作为modelId
  - 设置 createdAt 和 updatedAt
  - **初始化 customConfig 为空对象 `{}`**
  - **初始化 capabilities 字段（优先从白名单获取，否则使用全false默认值）**
  - **初始化 enableToolsInThinking 为 false（除非明确传入）**
  - 添加到对应供应商的models数组
  - 调用 `saveProviders()` 持久化
  - 返回完整的 `ModelConfig`

- [x] 实现 `updateModel()` 方法
  - 接收providerId、modelId和部分更新数据
  - 查找并更新对应模型
  - **支持更新 customConfig 字段（合并而非完全覆盖）**
  - **支持更新 capabilities 字段（整体替换）**
  - **支持更新 enableToolsInThinking 字段**
  - 更新 updatedAt 时间戳
  - 调用 `saveProviders()` 持久化

- [x] 实现 `deleteModel()` 方法
  - 接收providerId和modelId
  - 检查是否为当前活动模型
  - 如果是，先切换活动模型到同供应商的其他模型
  - 从供应商的models数组中移除
  - 调用 `saveProviders()` 持久化

### 3. Agent设置方法

**文件**: `app/hooks/useStorageSettings.ts`

- [x] 实现 `getAgentSettings()` 方法
  - 从存储读取 `agent_settings` 键
  - 解析JSON为 `AgentSettings`
  - 不存在时返回默认的 `DEFAULT_AGENT_SETTINGS`
  - 使用 `runStorageTask` 包装

- [x] 实现 `saveAgentSettings()` 方法
  - 接收部分AgentSettings更新
  - 合并现有设置
  - 更新 updatedAt 时间戳
  - 序列化为JSON并写入 `agent_settings` 键
  - 使用 `runStorageTask` 包装

### 4. 活动模型管理方法

**文件**: `app/hooks/useStorageSettings.ts`

- [x] 实现 `getActiveModel()` 方法
  - 从存储读取 `llm_active_model` 键
  - 解析JSON为 `ActiveModelReference`
  - 不存在时返回null
  - 使用 `runStorageTask` 包装

- [x] 实现 `setActiveModel()` 方法
  - 接收providerId和modelId
  - 验证供应商和模型是否存在
  - 创建或更新 `ActiveModelReference`
  - 设置 updatedAt 时间戳
  - 序列化为JSON并写入 `llm_active_model` 键
  - 使用 `runStorageTask` 包装

### 5. 运行时配置获取方法

**文件**: `app/hooks/useStorageSettings.ts`

- [x] 实现 `getRuntimeConfig()` 方法
  - 获取当前活动模型引用
  - 获取对应的供应商和模型配置
  - 获取Agent设置
  - 合并为完整的 `RuntimeLLMConfig`
  - **合并 customConfig**：先复制供应商的 customConfig，再合并模型的 customConfig（使用展开运算符，模型的同名字段覆盖供应商的值）
  - 任一数据不存在时返回null
  - 使用 `runStorageTask` 包装

### 6. 清理旧配置（可选）

**文件**: `app/hooks/useStorageSettings.ts`

- [x] **删除** `getLLMConfig()` 方法
- [x] **删除** `saveLLMConfig()` 方法
- [x] 在 `initializeDefaultLLMConfig()` 中可选删除旧的 `llmConfig` 键

### 7. 默认配置更新

**文件**: `app/lib/config-utils.ts`

- [x] 修改 `DEFAULT_PROVIDERS` 常量
  - 更新 providerType 为 "deepseek-native"
  - deepseek-chat 的 capabilities 设为 `{ supportsThinking: false, supportsVision: false }`
  - deepseek-reasoner 的 capabilities 设为 `{ supportsThinking: true, supportsVision: false }`
  - deepseek-reasoner 的 enableToolsInThinking 设为 `true`
  - deepseek-chat 的 enableToolsInThinking 设为 `false`

- [x] 在 `initializeDefaultLLMConfig()` 函数中添加兼容性迁移
  - 检查现有供应商的 providerType
  - 如果为 "deepseek"，自动转换为 "deepseek-native"
  - 记录警告日志

### 8. 创建模型能力白名单文件

**新建文件**: `app/lib/model-capabilities.ts`

- [x] 创建默认模型能力映射常量

  ```typescript
  export const DEFAULT_MODEL_CAPABILITIES: Record<string, ModelCapabilities>;
  ```

  - 包含DeepSeek系列（deepseek-chat, deepseek-reasoner）
  - 包含OpenAI系列（o1-preview, o1-mini, o3-mini, gpt-4o, gpt-4-turbo等）
  - 为每个模型配置准确的能力标记

- [x] 创建能力获取辅助函数

  ```typescript
  export function getDefaultCapabilities(modelName: string): ModelCapabilities;
  ```

  - 根据模型名称查找白名单
  - 未找到时返回全false的默认值

- [x] 在 `addModel()` 方法中集成白名单
  - 如果未提供 capabilities 参数，调用 `getDefaultCapabilities(modelName)`
  - 自动填充合理的默认能力

## 涉及文件

- 📝 修改：`app/hooks/useStorageSettings.ts`
- 📝 修改：`app/lib/config-utils.ts`
- ✨ 新建：`app/lib/model-capabilities.ts`
- 📖 依赖：`app/lib/utils.ts`（使用UUID生成和runStorageTask）

## 验收标准

### 方法完整性

- [x] 所有供应商CRUD方法实现完整
- [x] 所有模型CRUD方法实现完整
- [x] Agent设置读写方法实现完整
- [x] 活动模型管理方法实现完整
- [x] 运行时配置合并方法实现完整

### 数据一致性

- [x] 删除供应商时正确处理级联（活动模型切换）
- [x] 删除模型时正确处理级联（活动模型切换）
- [x] 所有写操作都更新时间戳
- [x] 所有UUID使用 `generateUUID()` 生成
- [x] **所有新建的供应商和模型都初始化 customConfig 为 `{}`**
- [x] **更新操作正确合并 customConfig 字段（而非完全覆盖）**
- [x] **getRuntimeConfig() 正确合并供应商和模型的 customConfig**

### 错误处理

- [x] 所有存储操作使用 `runStorageTask` 包装
- [x] 超时设置为8秒（与项目现有策略一致）
- [x] 方法内部有适当的错误日志

### TypeScript类型

- [x] 所有方法有完整的类型签名
- [x] 返回类型正确（Promise包装）
- [x] 参数类型使用正确的接口

### 初始化测试

- [x] 首次调用 `getProviders()` 时自动创建默认配置
- [x] 默认配置包含DeepSeek供应商和2个模型
- [x] 默认活动模型指向 deepseek-chat

### 模型能力存储验收

- [x] 新建模型时 capabilities 字段正确初始化（优先使用白名单）
- [x] 新建模型时 enableToolsInThinking 字段正确初始化
- [x] 更新模型时 capabilities 和 enableToolsInThinking 字段正确更新
- [x] JSON 序列化/反序列化后 capabilities 对象结构完整

### 默认配置验收

- [x] deepseek-reasoner 的 capabilities.supportsThinking 为 true
- [x] deepseek-reasoner 的 enableToolsInThinking 为 true
- [x] deepseek-chat 的 capabilities 均为 false
- [x] 默认供应商的 providerType 为 "deepseek-native"
- [x] `initializeDefaultLLMConfig()` 自动迁移旧 "deepseek" 类型

### 模型能力白名单验收

- [x] `model-capabilities.ts` 文件已创建
- [x] 白名单包含常见模型的能力映射
- [x] `getDefaultCapabilities()` 函数正确处理未知模型
- [x] `addModel()` 正确使用白名单自动填充

## 依赖关系

**前置依赖**:

- ✅ Milestone 1（类型定义）必须完成

**后续依赖**:

- Milestone 3-6（所有UI）依赖这些存储方法
- Milestone 7（API集成）依赖 `getRuntimeConfig()` 方法

## 注意事项

1. **级联删除**: 删除供应商/模型时，必须检查并处理活动模型引用
2. **原子性**: 所有写操作应该是原子的，避免部分更新
3. **时间戳**: 每次更新都要更新 `updatedAt` 字段
4. **JSON序列化**: 确保所有日期、undefined等特殊值正确处理
5. **存储适配器**: 代码应该兼容SQLite和IndexedDB两种存储
6. **能力字段完整性**: 序列化到 JSON 时确保 capabilities 对象完整包含两个布尔字段
7. **白名单维护**: 随着新模型发布，需手动更新 `model-capabilities.ts` 白名单
8. **能力覆盖**: updateModel 时传入的 capabilities 会整体替换，不支持部分更新

## 预计时间

⏱️ **3-4 小时**
