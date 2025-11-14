# DrawIO2Go 样式系统文档

> 本文档为 AI 代理提供项目样式系统的完整指南

---

## 📋 目录

1. [设计系统概述](#设计系统概述)
2. [设计令牌 (Design Tokens)](#设计令牌-design-tokens)
3. [样式文件组织结构](#样式文件组织结构)
4. [Material Design 实践指南](#material-design-实践指南)
5. [Tailwind CSS v4 使用规范](#tailwind-css-v4-使用规范)
6. [常见问题与最佳实践](#常见问题与最佳实践)

---

## 设计系统概述

### 🎨 设计风格

- **主色调**: `#3388BB` (蓝色)
- **设计语言**: 现代扁平化设计 + Material Design 风格
- **圆角规范**: 统一使用 4px/8px/12px 标准
- **阴影层级**: Material Design 标准 4 层阴影系统
- **间距系统**: 4px 基准的标准间距体系

### 核心原则

1. **一致性优先** - 所有组件必须使用统一的设计令牌
2. **扁平化设计** - 避免过度的渐变、阴影和装饰效果
3. **无干扰动画** - 仅保留必要的交互反馈，避免脉冲、浮动等干扰性动画
4. **可访问性** - 遵循 WCAG 2.1 AA 标准

---

## 设计令牌 (Design Tokens)

> 所有设计令牌定义在 `app/styles/base/variables.css`

### 🔵 圆角系统

```css
--radius-sm: 0.25rem; /* 4px - 小元素（徽章、标签） */
--radius: 0.5rem; /* 8px - 标准圆角（按钮、输入框、卡片） */
--radius-lg: 0.75rem; /* 12px - 大元素（对话框、大卡片） */
```

**使用场景：**

- 徽章、标签 → `var(--radius-sm)`
- 按钮、输入框、小卡片 → `var(--radius)`
- 对话框、大卡片、面板 → `var(--radius-lg)`

---

### 📏 间距系统

```css
--spacing-xs: 0.25rem; /* 4px */
--spacing-sm: 0.5rem; /* 8px */
--spacing-md: 1rem; /* 16px */
--spacing-lg: 1.5rem; /* 24px */
--spacing-xl: 2rem; /* 32px */
```

**使用场景：**

- 徽章内边距、图标间距 → `var(--spacing-xs)`
- 按钮内边距、小间距 → `var(--spacing-sm)`
- 卡片内边距、标准间距 → `var(--spacing-md)`
- 对话框内边距、大间距 → `var(--spacing-lg)`
- 空状态内边距、超大间距 → `var(--spacing-xl)`

---

### 🎨 色彩系统

#### 主题色（蓝色 #3388BB）

```css
--primary-color: #3388bb; /* 主色调 */
--primary-hover: #2a6fa0; /* 悬停状态 */
--primary-light: #e6f2f9; /* 浅色背景 */
--primary-foreground: #ffffff; /* 前景文字 */
```

#### 语义化颜色

```css
--success-color: #22c55e; /* 成功/最新版本徽章 */
--error-color: #ef4444; /* 错误/危险操作 */
--warning-color: #f59e0b; /* 警告/关键帧徽章 */
--info-color: #8b5cf6; /* 信息/差异徽章（紫色） */
```

#### 灰度系统

```css
--gray-primary: #6b7280;
--gray-light: #9ca3af;
--gray-border: rgba(156, 163, 175, 0.25);
--gray-bg: rgba(156, 163, 175, 0.04);
```

#### 边框和背景

```css
/* 边框 */
--border-primary: rgba(51, 136, 187, 0.25);
--border-light: rgba(51, 136, 187, 0.15);
--border-hover: rgba(51, 136, 187, 0.3);

/* 背景 */
--bg-primary: rgba(51, 136, 187, 0.04);
--bg-secondary: rgba(51, 136, 187, 0.08);
--bg-hover: rgba(51, 136, 187, 0.12);
```

---

### 🌑 Material Design 阴影层级

```css
--shadow-1: 0 1px 3px rgba(51, 136, 187, 0.12); /* 轻微提升 */
--shadow-2: 0 2px 6px rgba(51, 136, 187, 0.16); /* 标准提升 */
--shadow-4: 0 4px 12px rgba(51, 136, 187, 0.16); /* 中等提升 */
--shadow-8: 0 8px 24px rgba(51, 136, 187, 0.16); /* 高层级提升 */
```

**使用场景：**

- 卡片默认状态 → `var(--shadow-1)`
- 卡片悬停状态 → `var(--shadow-2)`
- 下拉菜单、弹出层 → `var(--shadow-4)`
- 对话框、模态框 → `var(--shadow-8)`

**兼容性映射：**

```css
--shadow-sm: var(--shadow-1);
--shadow-md: var(--shadow-2);
--shadow-lg: var(--shadow-4);
```

---

### ⏱️ 动画系统

#### 缓动函数

```css
--ease-out-cubic: cubic-bezier(0.4, 0, 0.2, 1);
--ease-in-out-cubic: cubic-bezier(0.4, 0, 0.6, 1);
```

#### 动画时长

```css
--duration-short: 150ms; /* 快速交互（颜色变化、边框） */
--duration-medium: 200ms; /* 标准交互（悬停、聚焦） */
--duration-long: 300ms; /* 复杂动画（展开、滑动） */
```

#### 过渡动画（组合）

```css
--transition-fast: var(--duration-short) var(--ease-out-cubic);
--transition-normal: var(--duration-medium) var(--ease-out-cubic);
--transition-slow: var(--duration-long) var(--ease-out-cubic);
```

---

## 样式文件组织结构

```
app/styles/
├── base/                # 基础样式（变量、Reset、全局）
│   ├── variables.css
│   ├── reset.css
│   └── globals.css
├── components/          # 业务组件样式
│   ├── chat.css
│   ├── forms.css
│   ├── modal.css
│   ├── sessions.css
│   ├── version-animations.css
│   ├── version-dialog.css
│   ├── version-sidebar.css
│   ├── version-timeline.css
│   └── version-wip.css
├── layout/              # 布局相关
│   ├── container.css
│   └── sidebar.css
├── themes/
│   └── drawio2go.css    # HeroUI 自定义主题（浅/深色）
└── utilities/
    ├── animations.css
    ├── components.css
    ├── markdown.css
    ├── scrollbars.css
    └── tool-calls.css
```

### 导入顺序（globals.css）

```css
@layer theme, base, components, utilities;

/* 1. 外部框架 */
@import "tailwindcss";
@import "@heroui/styles";

/* 2. HeroUI 主题 */
@import "./styles/themes/drawio2go.css" layer(theme);

/* 3. 基础样式 */
@import "./styles/base/reset.css" layer(base);
@import "./styles/base/variables.css" layer(base);
@import "./styles/base/globals.css" layer(base);

/* 4. 布局与组件 */
@import "./styles/layout/container.css" layer(components);
@import "./styles/layout/sidebar.css" layer(components);
@import "./styles/components/chat.css" layer(components);
@import "./styles/components/forms.css" layer(components);
@import "./styles/components/modal.css" layer(components);
@import "./styles/components/sessions.css" layer(components);
@import "./styles/components/version-*.css" layer(components);

/* 5. 工具样式 */
@import "./styles/utilities/*.css" layer(utilities);
```

---

## Material Design 实践指南

### 自定义主题（drawio2go.css）

- 主题文件位于 `app/styles/themes/drawio2go.css`，包含 `[data-theme="drawio2go"]`（浅色）与 `[data-theme="drawio2go-dark"]`（深色）两套变量。
- 根节点必须按照以下约定设置：

  ```html
  <html class="light" data-theme="drawio2go">
  <html class="dark" data-theme="drawio2go-dark">
  ```

- `@theme inline` 已将 `--color-background`、`--color-accent`、`--radius` 等暴露给 Tailwind，故可直接使用 `bg-background`、`text-foreground`、`rounded-lg` 等工具类。
- 所有旧的 `--primary-*` 变量已映射至 HeroUI 的 `--accent`/`--accent-hover`/`--accent-soft`，请勿再写入硬编码 Hex。
- 需要新增主题变量时，请在 `drawio2go.css` 中定义，并在 `@theme inline` 中同步暴露 Tailwind token。

### ✅ 应该做的

1. **使用设计令牌**

   ```css
   /* ✅ 正确 */
   border-radius: var(--radius);
   box-shadow: var(--shadow-2);
   padding: var(--spacing-md);

   /* ❌ 错误 */
   border-radius: 8px;
   box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
   padding: 16px;
   ```

2. **简单的交互反馈**

   ```css
   /* ✅ 正确 - 只改变颜色和阴影 */
   .card:hover {
     border-color: var(--primary-color);
     box-shadow: var(--shadow-2);
   }

   /* ❌ 错误 - 避免上移动画 */
   .card:hover {
     transform: translateY(-2px);
   }
   ```

3. **扁平化背景**

   ```css
   /* ✅ 正确 */
   background: var(--bg-primary);

   /* ❌ 错误 - 避免渐变 */
   background: linear-gradient(135deg, ...);
   ```

### ❌ 不应该做的

1. **硬编码颜色值**

   ```css
   /* ❌ 错误 */
   color: #3388bb;
   background: rgba(51, 136, 187, 0.1);

   /* ✅ 正确 */
   color: var(--primary-color);
   background: var(--bg-primary);
   ```

2. **干扰性动画**

   ```css
   /* ❌ 错误 - 脉冲动画 */
   animation: pulse 2s infinite;

   /* ❌ 错误 - 浮动动画 */
   animation: float 3s ease-in-out infinite;
   ```

3. **不规则圆角**

   ```css
   /* ❌ 错误 */
   border-radius: 1rem 1rem 0.25rem 1rem;

   /* ✅ 正确 */
   border-radius: var(--radius);
   ```

---

## Tailwind CSS v4 使用规范

### 重要变化

1. **必须使用 v4** - 不兼容 v3
2. **新导入语法**：`@import "tailwindcss"`
3. **PostCSS 配置**：`@tailwindcss/postcss`

### 配置文件

**tailwind.config.js**

```javascript
export default {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#3388BB",
      },
    },
  },
};
```

### 与 CSS 变量结合使用

```tsx
// ✅ 正确 - 组合使用
<div className="flex gap-4 p-4 rounded-lg" style={{
  boxShadow: 'var(--shadow-2)',
  borderColor: 'var(--primary-color)'
}}>
```

### HeroUI v3 集成

```tsx
// ✅ HeroUI v3 不需要 Provider
import { Button, Card } from '@heroui/react'

// ✅ 使用 onPress 而不是 onClick
<Button onPress={() => {}} variant="solid">
  保存版本
</Button>

// ✅ 复合组件模式
<Card.Root>
  <Card.Header>标题</Card.Header>
  <Card.Content>内容</Card.Content>
</Card.Root>
```

---

## 常见问题与最佳实践

### Q1: 什么时候使用 Tailwind，什么时候使用 CSS 变量？

**建议：**

- **布局和间距** → Tailwind (`flex`, `gap-4`, `p-4`)
- **颜色、阴影、圆角** → CSS 变量 (`var(--shadow-2)`)
- **自定义样式** → CSS 文件 + CSS 变量

### Q2: 如何确保深色模式兼容？

- HTML 根节点切换策略：

  ```html
  <html class="light" data-theme="drawio2go">
  <html class="dark" data-theme="drawio2go-dark">
  ```

- 颜色、圆角、阴影全部放在 `drawio2go.css` 中按 data-theme 维护；其他自定义变量（如 `--shadow-sidebar`）可继续在 `variables.css` 里使用 `.dark` 选择器做补丁。
- Tailwind 工具类会根据 `@theme inline` 输出的 `--color-*` 自动读取主题色，不需要在组件里写额外条件判断。

### Q3: 新增组件时应该如何命名类？

遵循 BEM 命名规范：

```css
.component-name {
} /* 块 */
.component-name__element {
} /* 元素 */
.component-name--modifier {
} /* 修饰符 */
```

### Q4: 如何处理版本管理组件的样式？

**版本管理组件样式文件：**

- `version-sidebar.css` - 侧边栏容器和空状态
- `version-wip.css` - WIP 指示器卡片
- `version-timeline.css` - 版本时间线和卡片
- `version-dialog.css` - 创建版本对话框

**2025-11-13 视觉升级要点：**

#### 侧边栏 Header（`version-sidebar.css`）

```css
.sidebar-header {
  /* 信息区 + 操作区两栏布局 */
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: var(--spacing-lg);
}

.sidebar-header__info {
  /* History 图标 + 标题/描述垂直布局 */
  display: flex;
  gap: var(--spacing-md);
}

.sidebar-header__icon {
  /* 图标容器 */
  color: var(--primary-color); /* #3388BB */
}

.sidebar-header__description {
  /* 副标题描述 */
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.empty-state-card {
  /* 空状态卡片 */
  background: var(--bg-primary);
  border-radius: var(--radius);
  padding: var(--spacing-xl);
}
```

#### WIP 指示器（`version-wip.css`）

```css
.wip-indicator__body {
  /* 三段式布局容器 */
}

.wip-indicator__top {
  /* 顶部：图标 + 徽章 + 版本号 */
  display: flex;
  gap: var(--spacing-md);
}

.wip-badge {
  /* WIP 徽章 */
  background: var(--primary-color);
  color: white;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-size: 0.625rem;
  font-weight: 600;
}

.wip-indicator__meta {
  /* 底部元数据行 */
  display: flex;
  gap: var(--spacing-lg);
  margin-top: var(--spacing-md);
  font-size: 0.75rem;
  color: var(--text-secondary);
}
```

#### 版本时间线（`version-timeline.css`）

```css
.timeline-list {
  position: relative;
}

.timeline-list::before {
  /* 时间线主轴 */
  content: "";
  position: absolute;
  left: 8px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--border-primary);
}

.version-card::before {
  /* 时间线节点 */
  content: "";
  position: absolute;
  left: -20px;
  top: 50%;
  transform: translateY(-50%);
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--primary-color);
}

.version-card--collapsed {
  /* 折叠状态卡片 */
  cursor: pointer;
}

.version-card__compact-view {
  /* 紧凑视图：左侧版本信息 + 右侧时间和箭头 */
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.version-card__chevron {
  /* 展开箭头 */
  transition: transform var(--transition-fast);
}

.version-card__chevron.rotated {
  transform: rotate(180deg);
}
```

#### 徽章系统规范

```css
/* 通用徽章基础样式 */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 1.25rem; /* 20px */
  padding: 0 var(--spacing-sm); /* 0 8px */
  border-radius: var(--radius-sm);
  font-size: 0.625rem; /* 10px */
  font-weight: 500;
  text-transform: uppercase;
}

/* 最新版本徽章 */
.latest-badge {
  background: var(--success-color); /* #22c55e */
  color: white;
}

/* 关键帧徽章 */
.keyframe-badge {
  background: var(--warning-color); /* #f59e0b */
  color: white;
}

/* Diff 徽章 */
.diff-badge {
  background: var(--info-color); /* #8b5cf6 紫色 */
  color: white;
}
```

### Q5: 如何测试样式修改？

1. **开发模式自动热更新** - CSS 修改无需重启
2. **检查设计令牌使用** - 搜索硬编码值 (`px`, `#`, `rgba`)
3. **测试响应式** - 使用浏览器开发者工具模拟不同屏幕
4. **测试深色模式** - 切换 `[data-theme="dark"]`

---

## 更新历史

- **2025-11-13**: 版本页面现代化外观升级（里程碑 3 完成）
  - **版本侧边栏**：新增信息描述区（History 图标 + 副标题）、空状态卡片与悬浮 CTA 按钮
  - **WIP 指示器**：卡片式信息区（Activity 图标 + WIP 徽章）、实时保存状态与元数据展示
  - **历史时间线**：主轴 + 节点视觉、紧凑折叠卡片、Disclosure 展开交互
  - **徽章系统**：统一最新徽章（绿）、关键帧徽章（黄）、Diff 徽章（紫）
  - **文本语义化**：新增 `--text-primary/secondary/tertiary` 变量
  - **相关组件**：`VersionSidebar.tsx`, `WIPIndicator.tsx`, `VersionCard.tsx`, `VersionTimeline.tsx`
- **2025-11-12**: 版本管理 Material Design 规范化（里程碑 2 完成）
  - 统一圆角规范至 4px/8px/12px
  - 建立 Material Design 4 层阴影系统
  - 添加标准间距系统（4px 基准）
  - 移除干扰性动画（脉冲、浮动、上移）
  - 统一徽章样式规范
  - 创建完整设计系统文档

---

**维护提示：** 本文档应随设计系统变更而更新。修改 `variables.css` 后，请同步更新本文档。
