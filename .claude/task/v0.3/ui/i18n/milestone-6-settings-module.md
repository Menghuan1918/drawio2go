# M6: 设置模块国际化

## 目标

完成设置模块所有组件的国际化改造,包括 SettingsSidebar、LLMSettingsPanel、VersionSettingsPanel、FileSettingsPanel、SystemPromptEditor 和 ConnectionTester。

## 完成状态

✅ **已完成** - 所有设置相关组件已完成国际化

## 已完成的工作

### 1. 核心组件国际化

#### SettingsSidebar.tsx
- ✅ 导入并使用 `useAppTranslation("settings")` hook
- ✅ 国际化操作栏文本（未保存的更改、取消、保存）
- ✅ 国际化错误消息和成功提示
- ✅ 新增 Toast 提示功能,支持成功/错误消息显示
- ✅ Toast 消息完全国际化

#### LLMSettingsPanel.tsx
- ✅ 国际化面板标题和描述
- ✅ 国际化所有表单字段:
  - API URL (标签、占位符、描述)
  - Provider (标签、描述、选项列表)
  - API Key (标签、占位符、描述)
  - Model Name (标签、占位符、描述)
  - Temperature (标签、描述)
  - Max Tool Rounds (标签、描述)
- ✅ 使用 `getProviderOptions(t)` 动态生成供应商选项
- ✅ 集成 SystemPromptEditor 和 ConnectionTester 子组件

#### VersionSettingsPanel.tsx
- ✅ 国际化面板标题和描述
- ✅ 国际化 "AI 编辑自动版本" 开关
  - 标签文本
  - 描述文本

#### FileSettingsPanel.tsx
- ✅ 国际化文件路径配置面板
- ✅ 国际化字段:
  - 面板标题和描述
  - 默认路径标签、占位符、浏览按钮
  - 注意事项说明

#### SystemPromptEditor.tsx
- ✅ 国际化系统提示词编辑器
- ✅ 国际化所有文本:
  - 标签、按钮、描述
  - 弹窗标题和内容标签
  - 占位符文本
  - 取消、保存、恢复默认按钮

#### ConnectionTester.tsx
- ✅ 国际化连接测试组件
- ✅ 国际化所有文本:
  - 测试按钮和描述
  - 测试结果弹窗标题
  - 成功/错误消息 (支持插值)
  - 加载状态文本
  - 关闭按钮

#### GeneralSettingsPanel.tsx
- ✅ 更新错误处理国际化 (`errors.selectFolderFailed`)

### 2. 配置重构

#### constants.ts
- ✅ 重构供应商选项结构
- ✅ 创建 `getProviderOptions(t: TFunction)` 函数
- ✅ 将供应商列表改为基础值数组
- ✅ 通过翻译函数动态生成 label 和 description

### 3. 翻译资源

#### public/locales/zh-CN/settings.json
新增以下命名空间:

```json
{
  "llm": {
    "title": "LLM 配置",
    "description": "配置 API 端点、模型与调用参数",
    "apiUrl": { "label", "placeholder", "description" },
    "provider": { "label", "description" },
    "apiKey": { "label", "placeholder", "description" },
    "modelName": { "label", "placeholder", "description" },
    "temperature": { "label", "description" },
    "maxToolRounds": { "label", "description" },
    "providers": {
      "openai-compatible": { "label", "description" },
      "deepseek": { "label", "description" },
      "openai-reasoning": { "label", "description" }
    }
  },
  "systemPrompt": {
    "label", "button", "title", "contentLabel",
    "placeholder", "description", "cancel", "save", "reset"
  },
  "connectionTest": {
    "title", "description", "button", "testing",
    "loading", "success", "error", "close"
  },
  "version": {
    "title", "description",
    "autoVersionOnAIEdit": { "label", "description" }
  },
  "actionBar": {
    "unsavedChanges", "cancel", "save"
  },
  "toasts": {
    "saveSuccess", "saveFailed", "testSuccess",
    "testFailed", "resetSuccess", "resetFailed", "loadFailed"
  },
  "errors": {
    "required", "invalidUrl", "missingApiKey",
    "outOfRange", "requestFailed", "selectFolderFailed",
    "loadFailed", "saveFailed"
  },
  "file": {
    "title", "description",
    "defaultPath": { "label", "placeholder", "browse", "note" }
  }
}
```

#### public/locales/en-US/settings.json
- ✅ 对应完整的英文翻译

### 4. 代码质量改进

- ✅ 所有组件使用 `useAppTranslation` hook
- ✅ 移除所有硬编码中文文本
- ✅ 使用插值变量处理动态内容 (如 `{{error}}`, `{{response}}`)
- ✅ Toast 提示使用 `useCallback` 和定时器自动清理
- ✅ 正确处理组件卸载时的定时器清理

## 技术细节

### 供应商选项动态生成

**原方案** (硬编码):
```typescript
export const PROVIDER_OPTIONS = [
  { value: "openai-compatible", label: "OpenAI Compatible", description: "..." },
  // ...
];
```

**新方案** (国际化):
```typescript
export const getProviderOptions = (t: TFunction): ProviderOption[] =>
  PROVIDER_OPTIONS.map((value) => ({
    value,
    label: t(`llm.providers.${value}.label`),
    description: t(`llm.providers.${value}.description`),
  }));
```

### Toast 提示实现

```typescript
const [toast, setToast] = useState<{
  message: string;
  variant: "success" | "error";
} | null>(null);

const showToast = useCallback((message: string, variant: "success" | "error" = "success") => {
  if (toastTimer.current) clearTimeout(toastTimer.current);
  setToast({ message, variant });
  toastTimer.current = setTimeout(() => setToast(null), 3200);
}, []);
```

## 验收清单

- ✅ SettingsSidebar 完全国际化
- ✅ LLMSettingsPanel 完全国际化
- ✅ VersionSettingsPanel 完全国际化
- ✅ FileSettingsPanel 完全国际化
- ✅ SystemPromptEditor 完全国际化
- ✅ ConnectionTester 完全国际化
- ✅ GeneralSettingsPanel 错误处理国际化
- ✅ constants.ts 供应商选项国际化
- ✅ zh-CN 翻译文件完整
- ✅ en-US 翻译文件完整
- ✅ 所有硬编码中文已移除
- ✅ Toast 提示国际化
- ✅ 错误消息国际化
- ✅ 动态内容使用插值变量

## 测试场景

### 基础国际化测试
1. 打开设置侧边栏
2. 切换到英语
3. 验证所有面板标题、标签、描述、按钮显示为英文
4. 切换回中文,验证所有文本立即更新

### LLM 配置测试
1. 在中文模式下配置 LLM 参数
2. 切换到英语
3. 验证已填写内容保持不变
4. 验证所有标签和描述更新为英文
5. 验证供应商下拉列表选项为英文

### 连接测试
1. 配置 LLM 后点击"测试连接"
2. 验证加载状态文本国际化
3. 验证成功/失败消息国际化
4. 切换语言后重新测试,验证消息语言正确

### Toast 提示测试
1. 修改设置后保存
2. 验证成功 Toast 显示且语言正确
3. 触发保存错误 (如权限问题)
4. 验证错误 Toast 显示且语言正确

### 系统提示词测试
1. 打开系统提示词编辑器
2. 验证弹窗标题、标签、按钮国际化
3. 点击"恢复默认"
4. 验证按钮文本国际化

## 注意事项

1. **插值变量**: 错误消息和成功提示使用 `{{error}}`, `{{response}}` 等插值变量
2. **动态选项**: 供应商选项通过 `getProviderOptions(t)` 动态生成,确保语言切换时立即更新
3. **Toast 清理**: 使用 `useEffect` 清理定时器,防止内存泄漏
4. **类型安全**: `getProviderOptions` 返回类型明确为 `ProviderOption[]`

## 下一步

继续 **M7: 画布与工具栏国际化** (如需要)
