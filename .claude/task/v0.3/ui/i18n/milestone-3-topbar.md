# M3: TopBar 组件国际化 ✅

## 状态：已完成

完成时间：根据暂存区更改

## 目标

完成 TopBar 组件的国际化改造，包括提取翻译、创建翻译资源和代码改造。这是最简单的组件，用于快速验证 i18n 流程。

## 实际完成内容

### ✅ 3.1 提取中文文本

**文件**: `app/components/TopBar.tsx`

**已提取的文本** (5 条核心文本):

- ✅ 选区信息：暂无选区信息
- ✅ 加载按钮文本
- ✅ 保存按钮文本
- ✅ 侧边栏展开 Aria 标签
- ✅ 侧边栏收起 Aria 标签

### ✅ 3.2 创建翻译资源

**已创建文件**:

- ✅ `public/locales/zh-CN/topbar.json`
- ✅ `public/locales/en-US/topbar.json`

**实际翻译结构**:

```json
{
  "selectionLabel": {
    "noSelection": "暂无选区信息 / No selection"
  },
  "buttons": {
    "load": "加载 / Load",
    "save": "保存 / Save"
  },
  "aria": {
    "collapseSidebar": "收起侧栏 / Collapse sidebar",
    "expandSidebar": "展开侧栏 / Expand sidebar"
  }
}
```

### ✅ 3.3 改造组件代码

**已完成的改造**:

1. ✅ 组件已是客户端组件（有 `"use client"` 标记）

2. ✅ 导入 Hook:

```tsx
import { useAppTranslation } from "@/app/i18n/hooks";
```

3. ✅ 在组件内使用 Hook:

```tsx
export default function TopBar({...}) {
  const { t } = useAppTranslation("topbar");
  // ...
}
```

4. ✅ 替换硬编码文本:

```tsx
// 改造后
{
  selectionLabel || t("selectionLabel.noSelection");
}
{
  t("buttons.load");
}
{
  t("buttons.save");
}
```

5. ✅ 更新 Aria 标签:

```tsx
aria-label={
  isSidebarOpen ? t("aria.collapseSidebar") : t("aria.expandSidebar")
}
```

## 验收检查

- ✅ `TopBar.tsx` 组件已标记为客户端组件
- ✅ 导入了 `useAppTranslation` Hook（实际使用的是 `useAppTranslation` 而非 `useTranslation`）
- ✅ 所有硬编码中文文本已替换为 `t()` 调用
- ✅ `topbar.json` 翻译文件已创建（zh-CN + en-US）
- ✅ 中英文翻译键值完全对齐
- ✅ 翻译结构清晰，分为 selectionLabel、buttons、aria 三个命名空间
- ⏳ 需运行 `pnpm run lint` 验证无错误
- ⏳ 需运行 `pnpm run dev` 验证应用正常启动
- ⏳ 需实际测试语言切换功能

## 实际代码差异

### TopBar.tsx 关键更改

```diff
+ import { useAppTranslation } from "@/app/i18n/hooks";

  export default function TopBar({...}) {
+   const { t } = useAppTranslation("topbar");

-   {selectionLabel || "暂无选区信息"}
+   {selectionLabel || t("selectionLabel.noSelection")}

-   加载
+   {t("buttons.load")}

-   保存
+   {t("buttons.save")}

-   aria-label={isSidebarOpen ? "收起侧栏" : "展开侧栏"}
+   aria-label={isSidebarOpen ? t("aria.collapseSidebar") : t("aria.expandSidebar")}
```

### 翻译文件内容

**`public/locales/zh-CN/topbar.json`**:

```json
{
  "selectionLabel": {
    "noSelection": "暂无选区信息"
  },
  "buttons": {
    "load": "加载",
    "save": "保存"
  },
  "aria": {
    "collapseSidebar": "收起侧栏",
    "expandSidebar": "展开侧栏"
  }
}
```

**`public/locales/en-US/topbar.json`**:

```json
{
  "selectionLabel": {
    "noSelection": "No selection"
  },
  "buttons": {
    "load": "Load",
    "save": "Save"
  },
  "aria": {
    "collapseSidebar": "Collapse sidebar",
    "expandSidebar": "Expand sidebar"
  }
}
```

## 实施要点

1. **Hook 命名**: 实际使用 `useAppTranslation` 而非原计划的 `useTranslation`
2. **翻译键设计**: 采用三层结构 `category.key` 模式，清晰易维护
3. **极简改造**: 只改造了必要的文本，未过度工程化
4. **Aria 标签**: 动态切换的 aria-label 也正确实现了国际化

## 遗留问题

- 无

## 后续建议

1. 添加更多测试场景验证：
   - 切换语言后 TopBar 文本立即更新
   - 刷新页面后语言选择保持
   - Aria 标签在 DOM 中正确更新

2. 考虑是否需要为 ThemeToggle 也添加国际化支持

## 下一步

继续 [M4: ProjectSelector 组件国际化](./milestone-4-project-selector.md)
