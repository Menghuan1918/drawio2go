# 里程碑 1：基础配置扩展

**状态**：✅ 已完成
**预计耗时**：30 分钟
**依赖**：无

## 目标

扩展 LLM 配置，支持最大循环次数设置，采用现代化的 providerType 枚举系统

## 任务清单

### 1. 更新 LLMConfig 接口

- [x] 在 `app/types/chat.ts` 中更新 `LLMConfig` 接口：
  ```typescript
  export interface LLMConfig {
    apiUrl: string;
    apiKey: string;
    temperature: number;
    modelName: string;
    systemPrompt: string;
    providerType: ProviderType; // 现代化枚举类型，替代旧的布尔值
    maxToolRounds: number;
  }
  ```

### 2. 更新默认配置

- [x] 在 `app/lib/llm-config.ts` 中添加 `maxToolRounds: 5`
  ```typescript
  export const DEFAULT_LLM_CONFIG: LLMConfig = {
    apiUrl: DEFAULT_API_URL,
    apiKey: "",
    temperature: 0.3,
    modelName: "deepseek-chat",
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    providerType: "deepseek",
    maxToolRounds: 5,
  };
  ```

### 3. 添加配置迁移逻辑

- [x] 在 `normalizeLLMConfig` 函数中处理旧格式迁移：
  ```typescript
  const resolveProviderType = (
    providerType?: unknown,
    legacyFlag?: unknown,
  ): ProviderType => {
    if (isProviderType(providerType)) {
      return providerType;
    }
    if (legacyFlag === true) {
      return "openai";
    }
    return "openai-response";
  };
  ```

### 4. 添加 UI 控件

- [x] 在 `SettingsSidebar.tsx` 中添加滑块控件：
  ```tsx
  {
    /* 最大工具调用轮次 */
  }
  <div className="w-full mt-4">
    <Label>最大工具调用轮次: {llmConfig.maxToolRounds}</Label>
    <input
      type="range"
      min="1"
      max="20"
      step="1"
      value={llmConfig.maxToolRounds}
      onChange={(e) =>
        setLlmConfig({
          ...llmConfig,
          maxToolRounds: parseInt(e.target.value),
        })
      }
      className="w-full mt-2 temperature-slider"
    />
    <Description className="mt-2">
      限制 AI 工具调用的最大循环次数，防止无限循环（范围 1-20）
    </Description>
  </div>;
  ```

### 5. 更新供应商选择UI

- [x] 使用现代化的下拉选择框替代布尔值开关：
  ```tsx
  <select
    className="mt-2 provider-select"
    value={llmConfig.providerType}
    onChange={(e) =>
      setLlmConfig({
        ...llmConfig,
        providerType: e.target.value as ProviderType,
      })
    }
  >
    {PROVIDER_OPTIONS.map((option) => (
      <option
        key={option.value}
        value={option.value}
        disabled={option.disabled}
      >
        {option.label}
      </option>
    ))}
  </select>
  ```

## 验收标准

- [x] 设置页面能正确显示"最大工具调用轮次"滑块
- [x] 滑块范围为 1-20，步长为 1
- [x] 当前值实时显示在 Label 中
- [x] 修改后保存，重新加载页面能恢复设置
- [x] 旧配置升级时使用默认值 5
- [x] 供应商选择使用现代化下拉框，支持多种选项
- [x] 配置迁移逻辑正确处理旧格式

## 测试步骤

1. 打开设置侧边栏
2. 找到"最大工具调用轮次"控件
3. 拖动滑块到不同值（如 10）
4. 点击"保存"
5. 刷新页面
6. 重新打开设置，确认值为 10
7. 测试供应商选择切换功能
8. 验证配置迁移功能

## 实际增强功能

- ✅ 使用 `ProviderType` 枚举替代旧的布尔值
- ✅ 添加 `normalizeLLMConfig` 函数进行配置验证和迁移
- ✅ 支持多种供应商类型（OpenAI Chat、OpenAI Responses、DeepSeek、Anthropic）
- ✅ 统一的类型定义系统
- ✅ 自定义 Hook `useLLMConfig` 封装配置管理逻辑

## 注意事项

- 使用 `parseInt()` 确保值为整数
- 复用现有的 `temperature-slider` 样式类
- 确保与其他配置项的间距一致（`mt-4`）
- 新的枚举系统更易扩展和维护

---

**下一步**：完成后继续 [里程碑 2：工具定义层](./milestone-2.md)
