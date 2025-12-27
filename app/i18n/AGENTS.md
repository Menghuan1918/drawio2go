# 国际化 (i18n) 模块

## 模块概述

DrawIO2Go 采用 **react-i18next** 框架实现多语言支持，支持 **英文 (en-US)** 和 **简体中文 (zh-CN)** 两种语言。通过统一的配置、类型安全的 Hook 和结构化的翻译文件，确保一致的国际化体验。

**实现方案**：

- 前端：react-i18next + i18next 核心库
- 语言检测：localStorage + 浏览器语言 + HTML lang 属性的多层级回退
- 翻译加载：动态 fetch 加载 JSON 文件，兼容 Electron file:// 协议与 SSR/SSG 场景
- 类型安全：通过命名空间（Namespace）约束 Hook 使用

## 目录结构

```
app/i18n/
├── config.ts          # 基础配置：语言列表、默认语言、命名空间、显示名称
├── client.ts          # 客户端初始化：i18next 实例、后端加载、语言检测
├── hooks.ts           # useAppTranslation Hook 封装，类型安全
└── AGENTS.md          # 本文档

public/locales/
├── en-US/             # 英文翻译文件
│   ├── common.json
│   ├── topbar.json
│   ├── sidebar.json
│   ├── chat.json
│   ├── settings.json
│   ├── project.json
│   ├── version.json
│   ├── errors.json
│   └── validation.json
└── zh-CN/             # 中文翻译文件（结构同上）

app/components/
├── I18nProvider.tsx           # 全局 i18n Provider（监听语言变化、同步 <html lang>）
├── LanguageSwitcher.tsx       # 语言切换器组件（使用 HeroUI Select）
└── settings/
    └── GeneralSettingsPanel.tsx # 通用设置面板（包含语言切换）
```

## 核心配置文件

### app/i18n/config.ts

定义 i18n 全局常量和类型：

```typescript
// 支持的语言列表（保持排序确保 UI 稳定）
export const locales = ["en-US", "zh-CN"] as const;
export type Locale = (typeof locales)[number];

// 默认语言（用于初始加载与兜底回退）
export const defaultLocale = "en-US" as const;

// 命名空间列表（对应各模块的文案分区）
export const namespaces = [
  "common", // 通用文案（Toast、通知等）
  "topbar", // 顶栏文案
  "sidebar", // 侧边栏文案
  "chat", // 聊天模块文案
  "settings", // 设置模块文案
  "version", // 版本管理文案
  "project", // 项目选择器文案
  "errors", // 错误信息
  "validation", // 表单验证文案
  "page", // 页面级文案（首页加载、连接状态等）
] as const;
export type Namespace = (typeof namespaces)[number];

// 语言显示名称（用于语言切换器展示）
export const localeDisplayNames: Record<Locale, string> = {
  "en-US": "English",
  "zh-CN": "简体中文",
} as const;
```

### app/i18n/client.ts

客户端初始化和配置：

**关键特性**：

- **动态翻译加载**：使用 `fetch` 加载 `/locales/{{lng}}/{{ns}}.json`
- **Electron 兼容**：自动检测 `file://` 协议，调整 loadPath 为相对路径
- **SSR/SSG 兼容**：避免首屏访问 localStorage，通过 try/catch 保护所有浏览器存储访问
- **多层级语言检测**：localStorage → Navigator → HTML lang 属性
- **无 Suspense**：`useSuspense: false` 避免组件挂起

## 使用方式

### 在组件中使用翻译

```typescript
"use client";

import { useAppTranslation } from "@/app/i18n/hooks";

export default function MyComponent() {
  // 指定命名空间获得类型安全的 t() 函数
  const { t, i18n } = useAppTranslation("settings");

  return (
    <div>
      {/* 使用 t() 翻译文案 */}
      <h1>{t("general.title")}</h1>

      {/* 访问当前语言 */}
      <p>Current language: {i18n.language}</p>

      {/* 支持插值 */}
      <p>{t("errors.selectFolderFailed", { defaultValue: "Failed" })}</p>
    </div>
  );
}
```

### 组件树上层配置 Provider

在根布局中包裹 `I18nProvider`：

```typescript
// app/layout.tsx
import { I18nProvider } from "@/app/components/I18nProvider";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <I18nProvider locale="en-US">
          {/* 所有组件树节点可使用 useAppTranslation */}
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
```

**I18nProvider 职责**：

- 初始化 i18next 实例
- 监听 `languageChanged` 事件并同步 `<html lang>` 属性（无障碍支持）
- 兼容 SSR 场景（通过 `locale` 属性传入初始语言）
- 处理 Electron file:// 环境的 localStorage 访问

### 语言切换

使用 `LanguageSwitcher` 组件或手动调用：

```typescript
import i18n from "@/app/i18n/client";

// 手动切换语言
await i18n.changeLanguage("zh-CN");

// 语言切换自动触发：
// 1. localStorage 更新（通过 LANGUAGE_STORAGE_KEY）
// 2. 所有组件收到 "languageChanged" 事件
// 3. <html lang> 同步更新
```

## 翻译文件管理

### 文件结构

翻译文件存储在 `public/locales/{{lng}}/{{ns}}.json`，采用嵌套键值对结构：

```json
{
  "nav": {
    "general": "通用",
    "llm": "LLM 配置"
  },
  "general": {
    "title": "通用设置",
    "language": {
      "label": "语言",
      "description": "切换界面显示语言"
    }
  },
  "toasts": {
    "saveSuccess": "设置已保存",
    "saveFailed": "保存失败：{{error}}"
  }
}
```

### 命名规范

- **嵌套键**：使用点号路径访问（如 `t("general.title")`）
- **插值变量**：用双花括号表示（如 `{{error}}`），通过第二参数传入
- **复数形式**：i18next 支持 `_one`, `_other` 后缀（暂未使用）

### 新增语言步骤

1. 在 `app/i18n/config.ts` 中新增 locale：

   ```typescript
   export const locales = ["en-US", "zh-CN", "ja-JP"] as const;
   export const localeDisplayNames = { ..., "ja-JP": "日本語" };
   ```

2. 在 `public/locales/` 下创建新语言目录（如 `ja-JP/`）

3. 复制英文翻译文件作为模板，逐个翻译

4. 重启开发服务器使新语言生效

## 模块里程碑

### Milestone 1: 国际化基础设施

- 实现 i18next 客户端初始化（client.ts）
- 配置语言列表、默认语言、命名空间
- 创建 useAppTranslation Hook 封装

### Milestone 2: 语言切换器与通用设置

- 实现 LanguageSwitcher 组件（HeroUI Select）
- 创建 GeneralSettingsPanel，集成语言切换
- localStorage 持久化语言偏好
- 支持 Electron 和 SSR 场景

### Milestone 3 & 4: 顶栏与项目选择器国际化

- 完成 Topbar 各组件翻译（logo, buttons, menus）
- 完成 ProjectSelector 翻译（项目创建、编辑对话框）
- 新增 topbar.json 和 project.json 翻译文件

### Milestone 5: 侧边栏国际化

- 完成 Sidebar 模块翻译（导航、功能区标签）
- 新增 sidebar.json 翻译文件
- 支持侧边栏语言动态切换

### Milestone 6: 设置模块国际化

- 完成 Settings 全部模块翻译（通用、LLM、版本设置）
- 支持系统提示词、API 配置等复杂文案
- 新增 validation.json 和完整 settings.json
- 集成 Toast 通知的多语言支持

### Milestone 7: Skill 配置系统国际化

- 完成 Skill（绘图技能）模块翻译
- 新增 `chat.json` → `skill.*` 命名空间：
  - `skill.theme.*`：风格选择（modern/academic/minimal/custom）
  - `skill.element.*`：知识类型（general/basic/uml/aws/azure/gcp/network）
  - `skill.custom.*`：自定义风格对话框
  - `skill.disabled.*`：功能禁用提示
- 支持多语言风格描述和知识分类
- 集成 `app/config/skill-elements.json` 配置系统

**新增翻译键结构**：

```json
{
  "skill": {
    "buttonLabel": "{{theme}}", // 按钮标签（动态显示当前风格）
    "ariaLabel": "配置绘图风格与知识", // 无障碍标签
    "disabled": {
      // 功能禁用提示
      "missingTemplate": "系统提示词需要包含占位符",
      "partialTemplate": "系统提示词需要同时包含两个占位符",
      "unavailable": "当前状态下无法修改设置"
    },
    "theme": {
      // 风格配置
      "label": "风格",
      "description": "选择图表整体风格（优先遵从用户配色）",
      "modern": "现代",
      "academic": "学术",
      "minimal": "极简",
      "custom": "自定义",
      "unknown": "未知风格"
    },
    "knowledge": {
      // 知识配置
      "label": "知识",
      "description": "选择可用知识类型（可多选）",
      "required": "必选"
    },
    "custom": {
      // 自定义风格对话框
      "title": "自定义风格",
      "placeholder": "描述你希望的图表风格：色调、饱和度、线宽、圆角...",
      "save": "保存",
      "cancel": "取消"
    },
    "element": {
      // 知识类型翻译
      "general": "通用",
      "basic": "基础流程",
      "misc": "杂项",
      "uml": "UML",
      "aws": "AWS",
      "azure": "Azure",
      "gcp": "GCP",
      "network": "网络"
    }
  }
}
```

**配置文件关联**：

- `app/config/skill-elements.json`：定义风格和知识的 `nameKey` 字段
- `public/locales/{lng}/chat.json`：提供 `skill.*` 键的翻译文本
- `app/components/ChatSidebar.tsx`：使用 `t("skill.theme.modern")` 读取翻译

## 注意事项

### SSR/SSG 兼容性

- **避免首屏 localStorage 访问**：I18nProvider 在 useEffect 中延迟初始化存储访问
- **Props 传入初始语言**：通过 `locale` 属性在服务端预设语言，避免客户端水合问题
- **完整 HTML 标签集合**：确保 `<html lang>` 在服务端正确输出

### Electron 兼容性

- **file:// 协议检测**：client.ts 自动检测 file:// URL 和 electron 对象
- **相对路径加载**：Electron 环境下 loadPath 为 `./locales/{{lng}}/{{ns}}.json`
- **localStorage 保护**：所有访问均包裹 try/catch，避免无痕模式和沙箱环境报错

### 性能优化

- **按需加载**：仅加载当前语言的命名空间，无需提前加载所有语言
- **缓存机制**：浏览器缓存已加载的翻译文件（HTTP Cache-Control）
- **防止闪烁**：I18nProvider 首屏不显示内容，直到语言初始化完成

### 类型安全

- **命名空间约束**：useAppTranslation 只接受预定义的 Namespace，避免拼写错误
- **键路径检查**：编辑器支持 TypeScript 智能补全（需配置 i18next-scanner）
- **插值验证**：传入的插值变量必须与翻译文件中的占位符匹配

## 相关文件

- **配置**: `drawio2go/app/i18n/config.ts`
- **客户端**: `drawio2go/app/i18n/client.ts`
- **Hooks**: `drawio2go/app/i18n/hooks.ts`
- **Provider**: `drawio2go/app/components/I18nProvider.tsx`
- **语言切换器**: `drawio2go/app/components/LanguageSwitcher.tsx`
- **翻译文件**: `drawio2go/public/locales/{{lng}}/{{ns}}.json`
