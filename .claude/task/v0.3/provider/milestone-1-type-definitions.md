# Milestone 1: 类型定义与存储基础

## 目标

建立新的LLM配置系统的类型基础和存储键结构，为后续开发奠定坚实的架构基础。

## 优先级

🔴 **最高优先级** - 所有后续里程碑都依赖此里程碑

## 任务列表

### 1. 更新类型定义文件

**文件**: `app/types/chat.ts`

- [x] 保留现有的 `ProviderType` 枚举定义
- [x] **删除**旧的 `LLMConfig` 接口（破坏性更改）
- [x] 新增 `JsonValue` 类型（JSON 可序列化值的递归类型定义）
  - 支持：string、number、boolean、null、数组和对象
- [x] 新增 `ProviderConfig` 接口（供应商配置）
  - 包含字段：id, displayName, providerType, apiUrl, apiKey, models, **customConfig**, createdAt, updatedAt
  - customConfig 类型：`{ [key: string]: JsonValue }`，默认为空对象 `{}`
  - customConfig 用途：存储供应商级别的额外设置（如速率限制、区域设置等）
- [x] 新增 `ModelConfig` 接口（单个模型配置）
  - 包含字段：id, providerId, modelName, displayName, temperature, maxToolRounds, isDefault, **customConfig**, createdAt, updatedAt
  - customConfig 类型：`{ [key: string]: JsonValue }`，默认为空对象 `{}`
  - customConfig 用途：存储模型级别的额外设置（如 maxTokens、topP、topK 等高级参数）
- [x] 新增 `AgentSettings` 接口（全局Agent设置）
  - 包含字段：systemPrompt, updatedAt
- [x] 新增 `ActiveModelReference` 接口（当前活动模型引用）
  - 包含字段：providerId, modelId, updatedAt
- [x] 新增 `RuntimeLLMConfig` 接口（运行时合并配置）
  - 合并供应商、模型、Agent设置的所有字段
  - **customConfig 字段**：合并供应商和模型的 customConfig（模型优先级更高，使用浅合并）

#### 1.3 模型能力标记类型

**文件**: `app/types/chat.ts`

- [x] 新增 `ModelCapabilities` 接口

  ```typescript
  export interface ModelCapabilities {
    supportsThinking: boolean; // 支持思考/推理模式
    supportsVision: boolean; // 支持视觉输入
  }
  ```

- [x] 在 `ModelConfig` 接口中新增字段
  - `capabilities: ModelCapabilities` - 模型能力标记
  - `enableToolsInThinking: boolean` - 思考中使用工具调用（仅对supportsThinking为true的模型有意义）
  - 默认值: capabilities 为 `{ supportsThinking: false, supportsVision: false }`, enableToolsInThinking 为 `false`

- [x] 在 `RuntimeLLMConfig` 接口中新增相应字段
  - 继承 ModelConfig 的 capabilities 和 enableToolsInThinking
  - 用于 API 运行时配置

#### 1.4 DeepSeek Provider 类型更新

**文件**: `app/types/chat.ts` 和 `app/lib/config-utils.ts`

- [x] 更新 `ProviderType` 枚举定义

  ```typescript
  export type ProviderType =
    | "openai-reasoning"
    | "openai-compatible"
    | "deepseek-native"; // 新增,替代 "deepseek"
  ```

  - **删除**: "deepseek" (破坏性更改)
  - **新增**: "deepseek-native"

- [x] 更新 `app/lib/config-utils.ts` 中的验证逻辑
  - 移除 "deepseek" 的验证
  - 添加 "deepseek-native" 的验证

### 2. 更新配置工具文件

**文件**: `app/lib/config-utils.ts`

- [x] 保留现有的 `DEFAULT_SYSTEM_PROMPT` 常量
- [x] 保留现有的 `DEFAULT_API_URL` 常量
- [x] **删除** `DEFAULT_LLM_CONFIG` 常量
- [x] 新增 `DEFAULT_PROVIDERS` 常量数组
  - 包含默认的DeepSeek供应商
  - 包含2个默认模型：deepseek-chat 和 deepseek-reasoner
  - 每个模型设置temperature=0.3, maxToolRounds=5
  - deepseek-chat 标记为 isDefault
  - **所有 customConfig 字段初始化为空对象 `{}`**
- [x] 新增 `DEFAULT_AGENT_SETTINGS` 常量
  - 使用现有的 DEFAULT_SYSTEM_PROMPT
- [x] 新增 `DEFAULT_ACTIVE_MODEL` 常量
  - 指向默认的 deepseek-chat 模型
- [x] 新增 `initializeDefaultLLMConfig()` 函数
  - 检查存储中是否存在 `llm_providers` 键
  - 不存在则创建默认配置（供应商、模型、Agent设置、活动模型）
  - 使用 `generateUUID()` 生成所有ID
  - 可选：删除旧的 `llmConfig` 键
- [x] **删除** `normalizeLLMConfig()` 函数（不再需要）

## 涉及文件

- 📝 修改：`app/types/chat.ts`
- 📝 修改：`app/lib/config-utils.ts`

## 验收标准

### TypeScript编译

- [x] 运行 `pnpm tsc --noEmit` 无类型错误
- [x] 所有新类型定义完整且正确

### 类型完整性

- [x] `ProviderConfig` 包含所有必需字段和正确的类型
- [x] `ModelConfig` 正确关联到 `providerId`
- [x] `RuntimeLLMConfig` 正确合并所有配置字段
- [x] 所有时间戳字段使用 `number` 类型

### 默认配置

- [x] `DEFAULT_PROVIDERS` 包含完整的DeepSeek供应商配置
- [x] 所有默认模型都有正确的初始参数
- [x] `initializeDefaultLLMConfig()` 函数逻辑清晰
- [x] **所有 customConfig 字段初始化为空对象 `{}`**

### customConfig 字段验证

- [x] `JsonValue` 类型正确定义递归结构，支持所有 JSON 标准类型
- [x] `ProviderConfig.customConfig` 类型为 `{ [key: string]: JsonValue }`
- [x] `ModelConfig.customConfig` 类型为 `{ [key: string]: JsonValue }`
- [x] `RuntimeLLMConfig.customConfig` 正确合并供应商和模型配置
- [x] 合并策略说明：使用浅合并（展开运算符），模型的值覆盖供应商的同名字段

### 模型能力类型验收

- [x] `ModelCapabilities` 接口包含 supportsThinking 和 supportsVision 布尔字段
- [x] `ModelConfig.capabilities` 有明确的类型定义
- [x] `ModelConfig.enableToolsInThinking` 类型为 boolean
- [x] `RuntimeLLMConfig` 正确继承能力相关字段

### DeepSeek 类型验收

- [x] `ProviderType` 不再包含 "deepseek"
- [x] `ProviderType` 包含 "deepseek-native"
- [x] TypeScript 编译时对旧 "deepseek" 类型产生错误

## 依赖关系

**前置依赖**: 无

**后续依赖**:

- Milestone 2（存储层方法）依赖此里程碑的类型定义
- Milestone 3-7（所有UI和API）依赖此里程碑的类型定义

## 注意事项

1. **破坏性更改**: 旧的 `LLMConfig` 接口将被删除，这是预期的破坏性更改
2. **UUID生成**: 使用项目现有的 `generateUUID()` 函数（位于 `app/lib/utils.ts`）
3. **时间戳**: 统一使用 `Date.now()` 生成毫秒级时间戳
4. **存储键命名**: 使用下划线命名法（如 `llm_providers`），保持与项目现有风格一致
5. **模型能力默认值**: 所有现有模型的 capabilities 字段默认为 `{ supportsThinking: false, supportsVision: false }`
6. **DeepSeek 类型迁移**: 旧的 "deepseek" providerType 将不再被识别，需在初始化函数中处理兼容转换
7. **enableToolsInThinking**: 此字段为模型级别配置，仅对 supportsThinking 为 true 的模型有实际意义

## 预计时间

⏱️ **3-4 小时**
