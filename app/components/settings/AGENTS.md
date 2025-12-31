# Settings 组件模块 (AGENTS.md)

## 模块概述

`app/components/settings/` 目录包含了应用全局设置面板的 React 组件。该模块提供多个独立的设置面板，覆盖通用配置、供应商/模型管理、Agent 系统提示词和版本管理。所有配置项均支持国际化，并通过父组件管理状态持久化。

**关键特性：**

- 多标签页设置面板（通用、画布、模型、Agent、版本）
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
| **DrawioSettingsPanel**  | 画布设置        | DrawIO Base URL、DrawIO 标识符（origin 校验）、DrawIO 默认主题（ui=）                                 |
| **ModelsSettingsPanel**  | 供应商/模型管理 | 供应商列表（Accordion）、模型预览、删除供应商级联处理、Provider/Model 编辑                            |
| **ProviderEditDialog**   | 供应商新增/编辑 | HeroUI Modal 弹窗，支持新增/编辑供应商、表单校验、Toast 反馈                                          |
| **ModelEditDialog**      | 模型新增/编辑   | HeroUI Modal 弹窗，模型名称/温度/工具轮次校验，能力（思考/视觉/工具）按钮切换（含 Tooltip）、模型测试 |
| **AgentSettingsPanel**   | Agent 配置      | 全局系统提示词（System Prompt）编辑                                                                   |
| **VersionSettingsPanel** | 版本管理        | AI 编辑前自动创建版本快照                                                                             |
| **AboutSettingsPanel**   | 关于            | 应用版本、GitHub 链接、更新检查（含 `update.autoCheck`）                                              |
| **ConnectionTester**     | 连接测试器      | 测试 LLM API 连接可用性                                                                               |
| **SettingsNav**          | 设置导航栏      | 标签页切换（通用 / 画布 / 模型 / Agent / 版本 / 关于，图标导航）                                      |

---

## 配置项说明

### GeneralSettingsPanel（通用设置）

```typescript
interface GeneralSettingsPanelProps {
  sidebarExpanded: boolean; // 默认展开侧边栏
  onSidebarExpandedChange: (expanded: boolean) => void;
  defaultPath: string; // 默认文件路径
  onDefaultPathChange: (path: string) => void;
}
```

**配置项：**

- **语言选择** - 切换应用UI语言（中文/英文），使用 LanguageSwitcher 组件
- **默认展开侧边栏** - 控制启动时右侧侧边栏是否默认展开
- **默认文件路径** - 设置文件浏览器打开的初始目录（Electron 环境）

### DrawioSettingsPanel（画布设置）

```typescript
interface DrawioSettingsPanelProps {
  drawioBaseUrl: string;
  drawioIdentifier: string;
  drawioTheme: "kennedy" | "min" | "atlas" | "sketch" | "simple";
  drawioUrlParams: string;
  drawioBaseUrlError?: string;
  drawioIdentifierError?: string;
  onDrawioBaseUrlChange: (value: string) => void;
  onDrawioIdentifierChange: (value: string) => void;
  onDrawioThemeChange: (
    value: "kennedy" | "min" | "atlas" | "sketch" | "simple",
  ) => void;
  onDrawioUrlParamsChange: (value: string) => void;
  onResetDrawioBaseUrl: () => void | Promise<void>;
  onResetDrawioIdentifier: () => void | Promise<void>;
  onResetDrawioUrlParams: () => void | Promise<void>;
}
```

**配置项：**

- **DrawIO Base URL** - DrawIO iframe 加载地址（默认 `https://embed.diagrams.net`）
- **DrawIO 标识符** - postMessage `event.origin` 校验用的子串（默认 `diagrams.net`）
- **DrawIO 默认主题** - 通过 URL 参数 `ui=` 控制（默认 `kennedy`）
- **自定义 URL 参数** - 允许覆盖/添加任意 URL 参数（优先级最高，例如覆盖 `ui=`/`dark=` 等）
- **恢复默认** - 需二次确认（ConfirmDialog），避免误操作导致画布不可用

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
  skillSettings: SkillSettings;
  onSkillSettingsChange: (settings: SkillSettings) => void;
  error?: string;
}
```

**功能点：**

- 内联 TextField + TextArea 直接编辑系统提示词（15 行默认高度）
- 恢复默认：按钮 + `ConfirmDialog`（variant="danger"），使用 `DEFAULT_SYSTEM_PROMPT`
- 提示词升级提醒：由 `app/hooks/useUpdateChecker.ts` 在设置页挂载后统一检测（命中历史版本且不等于当前默认值时 Toast warning），提供“升级到最新版”按钮一键替换为 `DEFAULT_SYSTEM_PROMPT`
- 校验辅助：导出 `isSystemPromptValid` / `getSystemPromptError`，空白时展示 `FieldError`
- 新对话默认设置：复用 `skill-elements` 配置，支持默认风格/颜色主题/默认知识多选（必选项锁定）
  - **自定义风格提示词**：当选择 `custom` 风格时可编辑 `customThemePrompt`，用于替换 `{{theme}}` 注入内容
  - **自定义知识内容**：可选 `customKnowledgeContent`，追加到 `{{knowledge}}` 的末尾以补充自定义约束
  - **知识大小提示**：知识列表展示每项 prompt 片段字节数（TextEncoder 计算），便于控制 token 消耗
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

DrawioSettingsPanel
├── DrawIO Base URL 输入 + 恢复默认
├── DrawIO 标识符 输入 + 恢复默认
└── DrawIO 默认主题选择（ui=）

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

**翻译文件路径：** `public/locales/{locale}/settings.json`

**主要翻译命名空间：**

- `settings.general.*` - 通用设置
- `settings.drawio.*` - 画布设置
- `settings.llm.*` - LLM 设置
- `settings.agent.*` - Agent 设置
- `settings.version.*` - 版本设置
- `settings.connectionTest.*` - 连接测试

---

## 代码腐化清理记录

### 2025-12-08 清理

**执行的操作：**

- 删除 `ModelsSettingsPanel` 中的过时 TODO 注释，避免误导性待办。
- 确认此次清理不改动模型/供应商 CRUD 逻辑，仅做注释层面瘦身。
- 文档记录本次范围，后续若重构模型表单需另行评估。

**影响文件**：1 个（ModelsSettingsPanel.tsx）

**下次关注**：

- 观察模型管理面板是否需要 onPress 统一或表单校验复用。

---

## 使用示例

### 基础集成

```tsx
import {
  SettingsNav,
  GeneralSettingsPanel,
  DrawioSettingsPanel,
  ModelsSettingsPanel,
  AgentSettingsPanel,
  VersionSettingsPanel,
  isSystemPromptValid,
} from "@/app/components/settings";

// 在父组件中管理 activeTab 和各面板的 state
// 通过 onTabChange、onChange 等回调处理状态更新
// 参考完整实现：app/components/SettingsDialog.tsx
```

### 系统提示词校验

```tsx
import {
  isSystemPromptValid,
  getSystemPromptError,
} from "@/app/components/settings";

const error = isSystemPromptValid(prompt)
  ? undefined
  : getSystemPromptError(prompt);
```

---

## 核心类型定义

来自 `@/app/types/chat`：

```typescript
type ProviderType =
  | "openai-reasoning"
  | "gemini"
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
  skillSettings: SkillSettings;
}
```

**常量 (`constants.ts`)：**

```typescript
const PROVIDER_OPTIONS: ProviderType[] = [
  "openai-compatible",
  "gemini",
  "anthropic",
  "deepseek-native",
  "openai-reasoning",
];

// 使用 getProviderOptions(t) 获取国际化后的供应商选项
```

---

## API 集成

### 连接测试 API

**端点：** `POST /api/test`

**请求/响应：** 包含 apiUrl、apiKey、modelName、providerType 等字段，返回 success 和 response/error。

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
├── AboutSettingsPanel.tsx        # 关于面板（版本信息 + 更新检查）
└── constants.ts                  # 常量定义（供应商选项等）
```

---

## 与其他模块的关系

- **LanguageSwitcher** - GeneralSettingsPanel 引入，来自 `app/components/LanguageSwitcher`
- **i18n hooks** - 绝大多数面板使用 `useAppTranslation("settings")`；AgentSettingsPanel 直接使用 `react-i18next` 的 `useTranslation`
- **类型定义** - 依赖 `@/app/types/chat` 的 ProviderConfig / ModelConfig / AgentSettings 等类型
- **配置工具** - 按需复用存储工具与默认常量（如 DEFAULT_AGENT_SETTINGS）

---

**最后更新:** 2025年12月27日
