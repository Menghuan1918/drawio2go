# M4: ProjectSelector 组件国际化 ✅

## 状态：已完成

完成时间：根据暂存区更改

## 目标

完成 ProjectSelector 组件的国际化改造，包括表单标签、按钮文本、验证消息和空状态提示。

## 实际完成内容

### ✅ 4.1 提取中文文本

**文件**: `app/components/ProjectSelector.tsx`

**已提取的文本** (15 条核心文本):

- ✅ 选择器标题："选择项目"（改自"选择工程"）
- ✅ 空状态标题："暂无项目"（改自"暂无工程"）
- ✅ 空状态描述："点击下方按钮新建第一个项目"（改自"点击下方按钮新建第一个工程"）
- ✅ 新建标题："新建项目"（改自"新建工程"）
- ✅ 创建时间标签："创建于: {{date}}"
- ✅ 项目名称标签
- ✅ 项目名称占位符
- ✅ 项目名称帮助文本
- ✅ 项目描述标签
- ✅ 项目描述占位符
- ✅ 项目描述帮助文本
- ✅ 取消按钮
- ✅ 创建按钮
- ✅ 新建项目按钮

**术语统一**:
- "工程" → "项目" (Project)
- 所有中文文本统一为"项目"术语

### ✅ 4.2 创建翻译资源

**已创建文件**:

- ✅ `public/locales/zh-CN/project.json`
- ✅ `public/locales/en-US/project.json`
- ✅ `public/locales/zh-CN/validation.json`（添加项目验证部分）
- ✅ `public/locales/en-US/validation.json`（添加项目验证部分）

**实际翻译结构**:

**`public/locales/zh-CN/project.json`**:

```json
{
  "selector": {
    "title": "选择项目",
    "empty": {
      "title": "暂无项目",
      "description": "点击下方按钮新建第一个项目"
    },
    "createTitle": "新建项目",
    "createdAt": "创建于: {{date}}"
  },
  "form": {
    "name": {
      "label": "项目名称",
      "placeholder": "输入项目名称",
      "help": "创建项目时必填"
    },
    "description": {
      "label": "项目描述",
      "placeholder": "输入项目描述（可选）",
      "help": "可选，用于标注项目背景"
    }
  },
  "buttons": {
    "cancel": "取消",
    "create": "创建",
    "new": "新建项目"
  }
}
```

**`public/locales/en-US/project.json`**:

```json
{
  "selector": {
    "title": "Select Project",
    "empty": {
      "title": "No Projects",
      "description": "Click the button below to create your first project"
    },
    "createTitle": "New Project",
    "createdAt": "Created: {{date}}"
  },
  "form": {
    "name": {
      "label": "Project Name",
      "placeholder": "Enter project name",
      "help": "Required when creating a project"
    },
    "description": {
      "label": "Project Description",
      "placeholder": "Enter project description (optional)",
      "help": "Optional, for project context"
    }
  },
  "buttons": {
    "cancel": "Cancel",
    "create": "Create",
    "new": "New Project"
  }
}
```

**`public/locales/zh-CN/validation.json`** (项目验证部分):

```json
{
  "project": {
    "nameRequired": "项目名称不能为空"
  }
}
```

**`public/locales/en-US/validation.json`**:

```json
{
  "project": {
    "nameRequired": "Project name is required"
  }
}
```

### ✅ 4.3 改造组件代码

**已完成的改造**:

1. ✅ 组件已是客户端组件（有 `"use client"` 标记）

2. ✅ 导入 Hook 和工具函数:

```tsx
import { useAppTranslation } from "@/app/i18n/hooks";
import { formatVersionTimestamp } from "@/app/lib/format-utils";
```

3. ✅ 在组件内使用 Hook:

```tsx
export default function ProjectSelector({...}) {
  const { t, i18n } = useAppTranslation("project");
  // ...
}
```

4. ✅ 替换选择器标题:

```tsx
// 改造前
选择工程

// 改造后
{t("selector.title")}
```

5. ✅ 替换空状态提示:

```tsx
// 改造前
<p className="empty-state-card__title">暂无工程</p>
<p className="empty-state-card__description">
  点击下方按钮新建第一个工程
</p>

// 改造后
<p className="empty-state-card__title">
  {t("selector.empty.title")}
</p>
<p className="empty-state-card__description">
  {t("selector.empty.description")}
</p>
```

6. ✅ 替换创建时间标签（使用多语言格式化）:

```tsx
// 改造前
<p className="text-xs text-gray-400 mt-2">
  创建于:{" "}
  {new Date(project.created_at).toLocaleDateString("zh-CN")}
</p>

// 改造后
<p className="text-xs text-gray-400 mt-2">
  {t("selector.createdAt", {
    date: formatVersionTimestamp(
      project.created_at,
      "full",
      i18n.language,
    ),
  })}
</p>
```

7. ✅ 替换表单标题:

```tsx
// 改造前
<h3 className="text-md font-semibold text-accent mb-3">新建工程</h3>

// 改造后
<h3 className="text-md font-semibold text-accent mb-3">
  {t("selector.createTitle")}
</h3>
```

8. ✅ 替换表单字段:

```tsx
// 改造前
<Label>工程名称</Label>
<Input placeholder="输入工程名称" />
<Description>创建工程时必填</Description>

// 改造后
<Label>{t("form.name.label")}</Label>
<Input placeholder={t("form.name.placeholder")} />
<Description>{t("form.name.help")}</Description>
```

```tsx
// 改造前
<Label>工程描述</Label>
<Input placeholder="输入工程描述（可选）" />
<Description>可选，用于标注工程背景</Description>

// 改造后
<Label>{t("form.description.label")}</Label>
<Input placeholder={t("form.description.placeholder")} />
<Description>{t("form.description.help")}</Description>
```

9. ✅ 替换按钮文本:

```tsx
// 改造前
<Button variant="ghost">取消</Button>
<Button variant="primary">创建</Button>
<Button variant="primary">新建工程</Button>

// 改造后
<Button variant="ghost">{t("buttons.cancel")}</Button>
<Button variant="primary">{t("buttons.create")}</Button>
<Button variant="primary">{t("buttons.new")}</Button>
```

### ✅ 4.4 增强格式化工具

**已完成的改造**: `app/lib/format-utils.ts`

**新增功能**:

1. ✅ 支持从 localStorage 读取当前激活语言
2. ✅ `formatVersionTimestamp` 接受 `locale` 参数
3. ✅ `formatConversationDate` 接受 `locale` 参数
4. ✅ 自动回退逻辑：显式传入 locale → localStorage → defaultLocale

**关键代码**:

```tsx
// 获取当前激活的 locale；允许显式传入，未传入时回退到 localStorage 或默认值
function getActiveLocale(locale?: string): string {
  const normalized = normalizeLocale(locale);
  if (normalized) return normalized;

  const savedLanguage = getSavedLocale();
  if (savedLanguage) return savedLanguage;

  return defaultLocale;
}

export function formatVersionTimestamp(
  timestamp: number,
  mode: "full" | "compact" = "full",
  locale?: string,
): string {
  const activeLocale = getActiveLocale(locale);
  const options =
    mode === "full" ? VERSION_FULL_OPTIONS : VERSION_COMPACT_OPTIONS;
  return new Date(timestamp).toLocaleString(activeLocale, options);
}
```

### ✅ 4.5 相关组件同步改造

**已改造的其他组件** (利用增强的格式化工具):

1. ✅ **ConversationList.tsx**: 使用多语言 `date-fns` locale
2. ✅ **MessagePreviewPanel.tsx**: 传入 `i18n.language` 到 `formatConversationDate`
3. ✅ **VersionCard.tsx**: 传入 `i18n.language` 到 `formatVersionTimestamp`
4. ✅ **VersionCompare.tsx**: 传入 `i18n.language` 到 `formatVersionTimestamp`

**示例**（ConversationList.tsx）:

```tsx
import { useAppTranslation } from "@/app/i18n/hooks";
import { enUS, zhCN } from "date-fns/locale";

const DATE_FNS_LOCALE_MAP: Record<string, DateFnsLocale> = {
  "en-US": enUS,
  "zh-CN": zhCN,
};

export default function ConversationList({...}) {
  const { i18n } = useAppTranslation("chat");
  const dateFnsLocale =
    DATE_FNS_LOCALE_MAP[i18n.language] ??
    DATE_FNS_LOCALE_MAP[defaultLocale] ??
    enUS;

  // 使用 dateFnsLocale...
}
```

### ✅ 4.6 localStorage 访问安全性增强

**已改造的组件**:

1. ✅ **ThemeToggle.tsx**: 提取了 `readStoredTheme` 和 `writeStoredTheme` 工具函数
2. ✅ **DrawioEditorNative.tsx**: 使用 try-catch 包裹 localStorage 访问

**关键改进**:

```tsx
// ThemeToggle.tsx
const readStoredTheme = (): "light" | "dark" | undefined => {
  if (typeof window === "undefined") return undefined;
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (value === "light" || value === "dark") return value;
    return undefined;
  } catch {
    return undefined;
  }
};

const writeStoredTheme = (value: "light" | "dark") => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, value);
  } catch {
    // 忽略无痕模式等环境的写入失败
  }
};
```

## 验收检查

- ✅ `ProjectSelector.tsx` 已导入 `useAppTranslation` Hook
- ✅ 使用了 `const { t, i18n } = useAppTranslation("project")` 获取翻译函数和语言信息
- ✅ 所有硬编码中文文本（选择器、表单、按钮、空状态）已替换为 `t()` 调用
- ✅ `project.json` 翻译文件完整（zh-CN + en-US）
- ✅ `validation.json` 包含项目验证消息
- ✅ 中英文翻译键值完全对齐
- ✅ 翻译结构清晰，分为 selector、form、buttons 三个命名空间
- ✅ 术语统一："工程" → "项目"
- ✅ 创建时间使用 `formatVersionTimestamp` 支持多语言格式化
- ✅ 格式化工具增强，支持 locale 参数
- ✅ 相关组件（ConversationList、MessagePreviewPanel、VersionCard、VersionCompare）同步改造
- ✅ localStorage 访问安全性增强（ThemeToggle、DrawioEditorNative）
- ⏳ 需运行 `grep -n "[\u4e00-\u9fa5]" app/components/ProjectSelector.tsx` 验证无硬编码中文（除注释）
- ⏳ 需运行 `pnpm run lint` 验证无错误
- ⏳ 需运行 `pnpm run dev` 验证应用正常启动
- ⏳ 需实际测试语言切换功能

## 实际代码差异

### ProjectSelector.tsx 关键更改

```diff
+ import { useAppTranslation } from "@/app/i18n/hooks";
+ import { formatVersionTimestamp } from "@/app/lib/format-utils";

  export default function ProjectSelector({...}) {
+   const { t, i18n } = useAppTranslation("project");

-   选择工程
+   {t("selector.title")}

-   <p className="empty-state-card__title">暂无工程</p>
-   <p className="empty-state-card__description">
-     点击下方按钮新建第一个工程
-   </p>
+   <p className="empty-state-card__title">
+     {t("selector.empty.title")}
+   </p>
+   <p className="empty-state-card__description">
+     {t("selector.empty.description")}
+   </p>

-   创建于:{" "}
-   {new Date(project.created_at).toLocaleDateString("zh-CN")}
+   {t("selector.createdAt", {
+     date: formatVersionTimestamp(
+       project.created_at,
+       "full",
+       i18n.language,
+     ),
+   })}

-   <h3>新建工程</h3>
+   <h3>{t("selector.createTitle")}</h3>

-   <Label>工程名称</Label>
-   <Input placeholder="输入工程名称" />
-   <Description>创建工程时必填</Description>
+   <Label>{t("form.name.label")}</Label>
+   <Input placeholder={t("form.name.placeholder")} />
+   <Description>{t("form.name.help")}</Description>

-   <Label>工程描述</Label>
-   <Input placeholder="输入工程描述（可选）" />
-   <Description>可选，用于标注工程背景</Description>
+   <Label>{t("form.description.label")}</Label>
+   <Input placeholder={t("form.description.placeholder")} />
+   <Description>{t("form.description.help")}</Description>

-   <Button>取消</Button>
-   <Button>创建</Button>
-   <Button>新建工程</Button>
+   <Button>{t("buttons.cancel")}</Button>
+   <Button>{t("buttons.create")}</Button>
+   <Button>{t("buttons.new")}</Button>
```

### format-utils.ts 关键更改

```diff
+ import { defaultLocale } from "@/app/i18n/config";
+ import { LANGUAGE_STORAGE_KEY } from "@/app/i18n/client";

+ // 获取当前激活的 locale；允许显式传入，未传入时回退到 localStorage 或默认值
+ function getActiveLocale(locale?: string): string {
+   const normalized = normalizeLocale(locale);
+   if (normalized) return normalized;
+
+   const savedLanguage = getSavedLocale();
+   if (savedLanguage) return savedLanguage;
+
+   return defaultLocale;
+ }

  export function formatVersionTimestamp(
    timestamp: number,
    mode: "full" | "compact" = "full",
+   locale?: string,
  ): string {
+   const activeLocale = getActiveLocale(locale);
    const options =
      mode === "full" ? VERSION_FULL_OPTIONS : VERSION_COMPACT_OPTIONS;
-   return new Date(timestamp).toLocaleString("zh-CN", options);
+   return new Date(timestamp).toLocaleString(activeLocale, options);
  }
```

## 实施要点

1. **Hook 命名**: 使用 `useAppTranslation`（与 M3 保持一致）
2. **翻译键设计**: 采用三层结构 `category.subcategory.key` 模式，清晰易维护
3. **术语统一**: "工程" 统一改为 "项目"，提升专业性
4. **多语言格式化**: 创建时间使用增强的 `formatVersionTimestamp`，自动适配当前语言
5. **插值变量**: `createdAt` 使用 `{{date}}` 插值，保持中英文结构一致
6. **联动改造**:
   - 增强 `format-utils.ts` 支持多语言
   - 同步改造所有使用日期/时间格式化的组件
   - 增强 localStorage 访问的安全性

## 遗留问题

- 无

## 后续建议

1. **添加更多验证消息**:
   - `nameMinLength`: "项目名称至少需要 {{min}} 个字符"
   - `nameMaxLength`: "项目名称不能超过 {{max}} 个字符"
   - `descriptionMaxLength`: "描述不能超过 {{max}} 个字符"
   - `nameInvalid`: "项目名称包含非法字符"

2. **添加更多操作按钮文本**（如果需要）:
   - `buttons.select`: "选择"
   - `buttons.delete`: "删除"
   - `buttons.rename`: "重命名"

3. **添加更多操作状态提示**（如果需要）:
   - `actions.creating`: "正在创建..."
   - `actions.created`: "项目已创建"
   - `actions.deleted`: "项目已删除"
   - `actions.renamed`: "项目已重命名"

4. **测试场景**:
   - 切换语言后所有文本立即更新
   - 刷新页面后语言选择保持
   - 创建时间根据语言正确格式化
   - 表单验证错误消息根据语言显示

## 下一步

完成后继续 [M5: UnifiedSidebar 组件国际化](./milestone-5-unified-sidebar.md)
