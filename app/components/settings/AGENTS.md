# Settings 组件模块 (AGENTS.md)

## 模块概述

`app/components/settings/` 目录包含了应用全局设置面板的 React 组件。该模块提供多个独立的设置面板，覆盖通用配置、供应商/模型管理、Agent 系统提示词和版本管理。所有配置项均支持国际化，并通过父组件管理状态持久化。

**关键特性：**

- 多标签页设置面板（通用、模型、Agent、版本）
- 连接测试器（按需接入）
- 系统提示词内联编辑（AgentSettingsPanel）
- 语言切换
- 文件路径选择（Electron 环境）
- 版本自动快照策略

> 说明：原 SystemPromptEditor 弹窗组件已下线，系统提示词编辑已合并到 AgentSettingsPanel。

---

## 设置面板列表

| 面板                     | 职责            | 核心配置项                                                                                            |
| ------------------------ | --------------- | ----------------------------------------------------------------------------------------------------- |
| **GeneralSettingsPanel** | 通用设置        | 语言选择、默认文件路径                                                                                |
| **ModelsSettingsPanel**  | 供应商/模型管理 | 供应商列表（Accordion）、模型预览、删除供应商级联处理、Provider/Model 编辑                            |
| **ProviderEditDialog**   | 供应商新增/编辑 | HeroUI Modal 弹窗，支持新增/编辑供应商、表单校验、Toast 反馈                                          |
| **ModelEditDialog**      | 模型新增/编辑   | HeroUI Modal 弹窗，模型名称/温度/工具轮次校验，能力（思考/视觉/工具）按钮切换（含 Tooltip）、模型测试 |
| **AgentSettingsPanel**   | Agent 配置      | 全局系统提示词（System Prompt）编辑                                                                   |
| **VersionSettingsPanel** | 版本管理        | AI 编辑前自动创建版本快照                                                                             |
| **ConnectionTester**     | 连接测试器      | 测试 LLM API 连接可用性                                                                               |
| **SettingsNav**          | 设置导航栏      | 标签页切换（通用 / 模型 / Agent / 版本，图标导航）                                                    |

---

## 配置项说明

### GeneralSettingsPanel（通用设置）

```typescript
interface GeneralSettingsPanelProps {
  defaultPath: string; // 默认文件路径
  onDefaultPathChange: (path: string) => void;
}
```

**配置项：**

- **语言选择** - 切换应用UI语言（中文/英文），使用 LanguageSwitcher 组件
- **默认文件路径** - 设置文件浏览器打开的初始目录（Electron 环境）

### ModelsSettingsPanel（供应商/模型管理）

```typescript
interface ModelsSettingsPanelProps {
  providers: ProviderConfig[];
  models: ModelConfig[];
  activeModel: ActiveModelReference | null;
  onProvidersChange: (providers: ProviderConfig[]) => void;
  onModelsChange: (models: ModelConfig[]) => void;
  onActiveModelChange: (activeModel: ActiveModelReference | null) => void;
}
```

**功能点：**

- 供应商列表（Accordion 展示）与模型预览
- 删除供应商（级联删除模型）并处理活动模型切换，使用 ConfirmDialog 二次确认
- Provider 编辑/新增对话框（ProviderEditDialog）
- 模型完整 CRUD：Card 列表 + 能力徽章（思考/视觉/工具）、Popover 菜单（编辑/设为默认/删除）
- ModelEditDialog 支持新增/编辑模型，ConfirmDialog 统一模型删除确认
- 操作完成后自动刷新 provider/model/activeModel，并通过 Toast 反馈

### AgentSettingsPanel（Agent 配置）

```typescript
interface AgentSettingsPanelProps {
  systemPrompt: string;
  onChange: (systemPrompt: string) => void;
  error?: string;
}
```

**功能点：**

- 内联 TextField + TextArea 直接编辑系统提示词（15 行默认高度）
- 恢复默认：按钮 + `ConfirmDialog`（variant="danger"），使用 `DEFAULT_SYSTEM_PROMPT`
- 校验辅助：导出 `isSystemPromptValid` / `getSystemPromptError`，空白时展示 `FieldError`
- 由父组件管理保存逻辑与时间戳更新（保持无副作用）

### VersionSettingsPanel（版本管理）

```typescript
interface VersionSettingsPanelProps {
  settings: { autoVersionOnAIEdit: boolean };
  onChange: (settings: { autoVersionOnAIEdit: boolean }) => void;
}
```

**配置项：**

- **AI 编辑时自动版本化** - 开关，在 AI 修改图表前是否自动创建版本快照

---

## 组件间关系

```
SettingsNav（导航栏）
└── onTabChange -> activeTab

GeneralSettingsPanel
├── LanguageSwitcher（语言切换器）
└── 默认路径输入 + 文件夹选择

ModelsSettingsPanel
├── Provider 列表（Accordion）
├── Model 卡片列表（能力徽章、状态、操作菜单）
├── ProviderEditDialog（新增/编辑）
├── ModelEditDialog（新增/编辑模型）
├── ConfirmDialog（供应商/模型删除确认）
└── 删除供应商级联模型 & 活动模型切换处理

AgentSettingsPanel
└── ConfirmDialog（恢复默认提示词）

VersionSettingsPanel
└── 自动版本化开关
```

---

## 国际化支持

默认使用 `useAppTranslation("settings")` 获取文案；`AgentSettingsPanel` 直接使用 `react-i18next` 的 `useTranslation("settings")`，并为关键文案提供中文 fallback。

支持的翻译键：

**通用设置：**

```
settings.general.title
settings.general.description
settings.general.defaultPath.label
settings.general.defaultPath.placeholder
settings.general.defaultPath.description
settings.general.defaultPath.selectButton
```

**LLM 设置：**

```
settings.llm.title
settings.llm.description
settings.llm.apiUrl.label
settings.llm.apiUrl.placeholder
settings.llm.apiUrl.description
settings.llm.provider.label
settings.llm.provider.description
settings.llm.providers.[type].label        // openai-compatible, anthropic, deepseek-native, openai-reasoning
settings.llm.providers.[type].description
settings.llm.apiKey.label
settings.llm.apiKey.placeholder
settings.llm.apiKey.description
settings.llm.modelName.label
settings.llm.modelName.placeholder
settings.llm.modelName.description
settings.llm.temperature.label
settings.llm.temperature.description
settings.llm.maxToolRounds.label
settings.llm.maxToolRounds.description
settings.systemPrompt.label
settings.systemPrompt.button
settings.systemPrompt.description

settings.agent.title
settings.agent.description
settings.agent.systemPrompt.label
settings.agent.systemPrompt.description
settings.agent.futureFeatures
```

**文件设置：**

```
settings.file.title
settings.file.description
settings.file.defaultPath.label
settings.file.defaultPath.placeholder
settings.file.defaultPath.note
settings.file.defaultPath.browse
```

**版本设置：**

```
settings.version.title
settings.version.description
settings.version.autoVersionOnAIEdit.label
settings.version.autoVersionOnAIEdit.description
```

## 代码腐化清理记录

### 2025-12-08 清理

**执行的操作**：

- 删除 `ModelsSettingsPanel` 中的过时 TODO 注释，避免误导性待办。
- 确认此次清理不改动模型/供应商 CRUD 逻辑，仅做注释层面瘦身。
- 文档记录本次范围，后续若重构模型表单需另行评估。

**影响文件**：1 个（ModelsSettingsPanel.tsx）

**下次关注**：

- 观察模型管理面板是否需要 onPress 统一或表单校验复用。

**连接测试：**

```
settings.connectionTest.button
settings.connectionTest.description
settings.connectionTest.title
settings.connectionTest.loading
settings.connectionTest.testing
settings.connectionTest.success
settings.connectionTest.error
settings.connectionTest.close
```

---

## 使用示例

### 完整设置面板集成

```tsx
import {
  SettingsNav,
  GeneralSettingsPanel,
  ModelsSettingsPanel,
  AgentSettingsPanel,
  VersionSettingsPanel,
  isSystemPromptValid,
  type SettingsTab,
} from "@/app/components/settings";
import { DEFAULT_AGENT_SETTINGS } from "@/app/lib/config-utils";
import type {
  ActiveModelReference,
  AgentSettings,
  ModelConfig,
  ProviderConfig,
} from "@/app/types/chat";

export function SettingsModal() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [generalPath, setGeneralPath] = useState("");
  const [version, setVersion] = useState({ autoVersionOnAIEdit: true });
  const [agentSettings, setAgentSettings] = useState<AgentSettings>(
    DEFAULT_AGENT_SETTINGS,
  );
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [activeModel, setActiveModel] = useState<ActiveModelReference | null>(
    null,
  );

  return (
    <div className="settings-container">
      <SettingsNav activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="settings-content">
        {activeTab === "general" && (
          <GeneralSettingsPanel
            defaultPath={generalPath}
            onDefaultPathChange={setGeneralPath}
          />
        )}

        {activeTab === "models" && (
          <ModelsSettingsPanel
            providers={providers}
            models={models}
            activeModel={activeModel}
            onProvidersChange={setProviders}
            onModelsChange={setModels}
            onActiveModelChange={setActiveModel}
          />
        )}

        {activeTab === "agent" && (
          <AgentSettingsPanel
            systemPrompt={agentSettings.systemPrompt}
            onChange={(systemPrompt) =>
              setAgentSettings((prev) => ({
                ...prev,
                systemPrompt,
                updatedAt: Date.now(),
              }))
            }
            error={
              isSystemPromptValid(agentSettings.systemPrompt)
                ? undefined
                : "系统提示词不能为空"
            }
          />
        )}

        {activeTab === "version" && (
          <VersionSettingsPanel settings={version} onChange={setVersion} />
        )}
      </div>
    </div>
  );
}
```

### 系统提示词编辑

```tsx
<AgentSettingsPanel
  systemPrompt={systemPrompt}
  onChange={(next) => {
    setSystemPrompt(next);
    setUpdatedAt(Date.now());
  }}
  error={isSystemPromptValid(systemPrompt) ? undefined : "系统提示词不能为空"}
/>

// 面板内联编辑（TextArea rows=15），右侧按钮触发 ConfirmDialog 恢复 DEFAULT_SYSTEM_PROMPT。
```

---

## 工具和常量

### 常量 (`constants.ts`)

```typescript
interface ProviderOption {
  value: ProviderType;
  label: string;
  description: string;
  disabled?: boolean;
}

const PROVIDER_OPTIONS: ProviderType[] = [
  "openai-compatible",
  "anthropic",
  "deepseek-native",
  "openai-reasoning",
];

// 获取国际化后的供应商选项
const getProviderOptions = (t: TFunction): ProviderOption[] => {
  // 返回带有翻译的选项列表
};
```

### 类型定义

来自 `@/app/types/chat`（节选）：

```typescript
type ProviderType =
  | "openai-reasoning"
  | "openai-compatible"
  | "deepseek-native"
  | "anthropic";

interface ProviderConfig {
  id: string;
  displayName: string;
  providerType: ProviderType;
  apiUrl: string;
  apiKey: string;
  models: string[];
  customConfig: Record<string, JsonValue>;
  createdAt: number;
  updatedAt: number;
}

interface ModelConfig {
  id: string;
  providerId: string;
  modelName: string;
  displayName: string;
  temperature: number;
  maxToolRounds: number;
  isDefault: boolean;
  capabilities: ModelCapabilities;
  enableToolsInThinking: boolean;
  customConfig: Record<string, JsonValue>;
  createdAt: number;
  updatedAt: number;
}

interface AgentSettings {
  systemPrompt: string;
  updatedAt: number;
}
```

---

## API 集成

### 连接测试 API

**端点：** `POST /api/test`

**请求体：**

```json
{
  "apiUrl": "https://api.example.com/v1",
  "apiKey": "sk-xxx",
  "modelName": "gpt-4o",
  "temperature": 0.7,
  "providerType": "openai-compatible"
}
```

**响应（成功）：**

```json
{
  "success": true,
  "response": "OK / 测试消息"
}
```

**响应（失败）：**

```json
{
  "success": false,
  "error": "Invalid API key"
}
```

---

## 限制与注意事项

1. **状态管理** - 各面板通过 props 回调管理状态，父组件负责持久化
2. **Electron 环境检测** - 文件夹选择功能依赖 `window.electron?.selectFolder()`
3. **密码输入** - API Key 使用密码类型输入框，不在 HTML 中暴露
4. **验证** - AgentSettingsPanel 暴露 `isSystemPromptValid` / `getSystemPromptError` 处理空白校验，其他输入仍需父组件或 API 层处理
5. **异步操作** - ConnectionTester 中的网络请求可能超时，应设置合理的超时时间
6. **国际化** - 大部分面板使用 `useAppTranslation("settings")`；AgentSettingsPanel 使用 `useTranslation("settings")` 并内置中文 fallback

---

## 文件结构

```
app/components/settings/
├── index.ts                      # 模块导出
├── SettingsNav.tsx               # 设置导航栏（标签页）
├── GeneralSettingsPanel.tsx      # 通用设置面板
├── ModelsSettingsPanel.tsx       # 供应商/模型管理面板（Accordion）
├── AgentSettingsPanel.tsx        # Agent 配置面板（System Prompt）
├── ProviderEditDialog.tsx        # 供应商新增/编辑对话框
├── VersionSettingsPanel.tsx      # 版本管理设置面板
├── ConnectionTester.tsx          # 连接测试器（弹窗）
└── constants.ts                  # 常量定义（供应商选项等）
```

---

## 与其他模块的关系

- **LanguageSwitcher** - GeneralSettingsPanel 引入，来自 `app/components/LanguageSwitcher`
- **i18n hooks** - 绝大多数面板使用 `useAppTranslation("settings")`；AgentSettingsPanel 直接使用 `react-i18next` 的 `useTranslation`
- **类型定义** - 依赖 `@/app/types/chat` 的 ProviderConfig / ModelConfig / AgentSettings 等类型
- **配置工具** - 按需复用存储工具与默认常量（如 DEFAULT_AGENT_SETTINGS）

---

**最后更新:** 2025年12月04日
