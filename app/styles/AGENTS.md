# DrawIO2Go 样式系统文档

> 本文档为 AI 代理提供项目样式系统的核心指南

## 目录

1. [设计系统概述](#设计系统概述)
2. [设计令牌](#设计令牌)
3. [样式文件组织](#样式文件组织)
4. [Material Design 实践](#material-design-实践)
5. [Tailwind CSS v4 规范](#tailwind-css-v4-规范)
6. [常见问题](#常见问题)

---

## 设计系统概述

### 设计风格

- **主色调**: `#3388BB` (蓝色)
- **设计语言**: 现代扁平化 + Material Design
- **圆角规范**: 4px/8px/12px
- **阴影层级**: Material Design 4 层阴影系统
- **间距系统**: 4px 基准

### 核心原则

1. **一致性优先** - 统一使用设计令牌
2. **扁平化设计** - 避免过度装饰
3. **无干扰动画** - 仅保留必要的交互反馈
4. **可访问性** - 遵循 WCAG 2.1 AA 标准

---

## 设计令牌

> 所有设计令牌定义在 `app/styles/base/variables.css`

### 圆角系统

```css
--radius-sm: 0.25rem; /* 4px - 徽章、标签 */
--radius: 0.5rem; /* 8px - 按钮、输入框、卡片 */
--radius-lg: 0.75rem; /* 12px - 对话框、大卡片 */
```

### 间距系统

```css
--spacing-xs: 0.25rem; /* 4px */
--spacing-sm: 0.5rem; /* 8px */
--spacing-md: 1rem; /* 16px */
--spacing-lg: 1.5rem; /* 24px */
--spacing-xl: 2rem; /* 32px */
```

### 色彩系统

> 使用 OKLCH 色彩空间，浅色模式变量在 `[data-theme="drawio2go"]`，深色模式在 `[data-theme="drawio2go-dark"]`

#### 主题色（基于 #3388BB）

```css
/* 主色调 - 浅色模式 */
--accent: oklch(0.6 0.11 235);
--accent-hover: oklch(0.53 0.13 238);
--accent-active: oklch(0.48 0.14 240);
--accent-soft: color-mix(in oklch, var(--accent) 8%, var(--background));

/* 深色模式提亮确保可读性 */
--accent: oklch(0.72 0.12 235);
--accent-hover: oklch(0.77 0.13 237);
--accent-active: oklch(0.82 0.14 238);

/* 兼容旧变量 */
--primary-color: var(--accent);
--primary-hover: var(--accent-hover);
```

#### 语义化颜色

```css
/* 浅色模式 */
--success: oklch(0.75 0.22 150); /* 成功 */
--warning: oklch(0.78 0.19 68); /* 警告 */
--danger: oklch(0.65 0.24 25); /* 错误 */
--info: oklch(0.62 0.23 290); /* 信息 */

/* 深色模式稍微提亮 */
```

#### 边框/背景系统

```css
/* 边框 - 浅色模式透明度 18%/28%/40%/55%/65% */
--border: color-mix(in oklch, var(--accent) 18%, transparent);
--border-primary: color-mix(in oklch, var(--accent) 40%, transparent);
--border-light: color-mix(in oklch, var(--accent) 28%, transparent);
--border-hover: color-mix(in oklch, var(--accent) 55%, transparent);
--border-focus: color-mix(in oklch, var(--accent) 65%, transparent);

/* 背景 - 浅色模式透明度 6%/10%/15% */
--bg-primary: color-mix(in oklch, var(--accent) 6%, transparent);
--bg-secondary: color-mix(in oklch, var(--accent) 10%, transparent);
--bg-hover: color-mix(in oklch, var(--accent) 15%, transparent);

/* 深色模式提升透明度以增强对比 */
```

#### 灰度系统

```css
--gray-primary: #6b7280;
--gray-light: #9ca3af;
--gray-border: rgba(156, 163, 175, 0.25);
--gray-bg: rgba(156, 163, 175, 0.04);
```

### Material Design 阴影层级

```css
/* 浅色模式 - 模糊半径 2/4/8/16/32px，透明度渐进 12%→30% */
--shadow-xs: 0 1px 2px color-mix(in oklch, var(--accent) 12%, transparent);
--shadow-1: 0 1px 4px color-mix(in oklch, var(--accent) 18%, transparent);
--shadow-2: 0 2px 8px color-mix(in oklch, var(--accent) 22%, transparent);
--shadow-4: 0 4px 16px color-mix(in oklch, var(--accent) 26%, transparent);
--shadow-8: 0 8px 32px color-mix(in oklch, var(--accent) 30%, transparent);
--shadow-sidebar: -2px 0 12px
  color-mix(in oklch, var(--accent) 15%, transparent);

/* 深色模式使用蓝调增强层次 */
```

**使用场景**: 紧凑卡片 `shadow-xs` | 默认卡片 `shadow-1` | 悬停 `shadow-2` | 弹出层 `shadow-4` | 模态框 `shadow-8`

### 现代 UI 增强

```css
/* 渐变效果 - 用于 CTA 按钮、卡片头部、进度条 */
--accent-gradient: linear-gradient(
  135deg,
  var(--accent) 0%,
  oklch(0.55 0.12 240) 100%
);

/* 玻璃形态 - 用于浮动面板、半透明模态 */
--glass-effect: backdrop-blur(12px) saturate(180%) brightness(105%);
--glass-background: color-mix(in oklch, var(--surface) 85%, transparent);
```

### 动画系统

```css
/* 缓动函数 */
--ease-out-cubic: cubic-bezier(0.4, 0, 0.2, 1);
--ease-in-out-cubic: cubic-bezier(0.4, 0, 0.6, 1);

/* 时长 */
--duration-short: 150ms; /* 颜色变化 */
--duration-medium: 200ms; /* 悬停聚焦 */
--duration-long: 300ms; /* 展开滑动 */

/* 组合 */
--transition-fast: var(--duration-short) var(--ease-out-cubic);
--transition-normal: var(--duration-medium) var(--ease-out-cubic);
--transition-slow: var(--duration-long) var(--ease-out-cubic);
```

---

## 样式文件组织

```
app/styles/
├── base/           # 变量、Reset、全局
├── components/     # 业务组件 (chat, modal, sessions, version-*)
├── layout/         # 布局 (container, sidebar)
├── themes/
│   └── drawio2go.css  # HeroUI 主题 (浅/深色)
└── utilities/      # 动画、Markdown、滚动条等
```

### 导入顺序

```css
@layer theme, base, components, utilities;

@import "tailwindcss";
@import "@heroui/styles";
@import "./styles/themes/drawio2go.css" layer(theme);
@import "./styles/base/*.css" layer(base);
@import "./styles/layout/*.css" layer(components);
@import "./styles/components/*.css" layer(components);
@import "./styles/utilities/*.css" layer(utilities);
```

---

## Material Design 实践

### 自定义主题

- 主题文件: `app/styles/themes/drawio2go.css`
- 浅色模式: `<html class="light" data-theme="drawio2go">`
- 深色模式: `<html class="dark" data-theme="drawio2go-dark">`
- 由 `ThemeToggle` 组件管理（localStorage 持久化 + 系统主题检测）
- `@theme inline` 已暴露变量给 Tailwind，可使用 `bg-background`、`text-accent` 等工具类

### 规范要点

**✅ 应该做的**

- 使用设计令牌: `border-radius: var(--radius)`, `box-shadow: var(--shadow-2)`
- 简单交互反馈: 只改变颜色和阴影，避免 `translateY` 上移动画
- 扁平化背景: `background: var(--bg-primary)`
- 使用 CSS 变量: `color: var(--accent)` 或 `className="text-accent"`

**❌ 不应该做的**

- 硬编码颜色: ~~`color: #3388BB`~~ ~~`className="text-[#3388BB]"`~~
- 干扰性动画: ~~`animation: pulse 2s infinite`~~
- 不规则圆角: ~~`border-radius: 1rem 1rem 0.25rem 1rem`~~

---

## Tailwind CSS v4 规范

### 重要变化

- 必须使用 v4（不兼容 v3）
- 导入语法: `@import "tailwindcss"`
- PostCSS 配置: `@tailwindcss/postcss`

### 与 CSS 变量结合

```tsx
// 组合使用 Tailwind 工具类和 CSS 变量
<div className="flex gap-4 p-4 rounded-lg" style={{
  boxShadow: 'var(--shadow-2)',
  borderColor: 'var(--accent)'
}}>
```

### HeroUI v3 集成

```tsx
import { Button, Card } from '@heroui/react'

// 不需要 Provider，使用 onPress 而非 onClick
<Button onPress={() => {}} variant="solid">保存</Button>

// 复合组件模式
<Card.Root>
  <Card.Header>标题</Card.Header>
  <Card.Content>内容</Card.Content>
</Card.Root>
```

---

## 常见问题

### Q1: Tailwind vs CSS 变量使用场景？

- **布局和间距** → Tailwind (`flex`, `gap-4`, `p-4`)
- **颜色、阴影、圆角** → CSS 变量 (`var(--shadow-2)`)
- **自定义样式** → CSS 文件 + CSS 变量

### Q2: 深色模式兼容？

- 根节点切换: `<html class="light|dark" data-theme="drawio2go|drawio2go-dark">`
- 变量在 `drawio2go.css` 按 `data-theme` 维护
- Tailwind 自动读取 `@theme inline` 输出的主题色

### Q3: 类命名规范？

遵循 BEM:

- `.component-name` (块)
- `.component-name__element` (元素)
- `.component-name--modifier` (修饰符)

### Q4: 版本管理组件样式

**文件**: `version-sidebar.css`, `version-timeline.css`, `version-dialog.css`

**关键样式类**:

```css
/* 侧边栏 */
.sidebar-header {
  display: flex;
  justify-content: space-between;
  padding: var(--spacing-lg);
}
.empty-state-card {
  background: var(--bg-primary);
  border-radius: var(--radius);
}

/* 时间线 */
.timeline-list::before {
  /* 主轴 */
  width: 2px;
  background: var(--border-primary);
}
.version-card::before {
  /* 节点 */
  width: 8px;
  height: 8px;
  background: var(--primary-color);
}
.version-card--wip {
  border-style: dashed;
}
.version-card--collapsed {
  cursor: pointer;
}

/* 徽章 */
.badge {
  height: 1.25rem;
  padding: 0 var(--spacing-sm);
  border-radius: var(--radius-sm);
}
.latest-badge {
  background: var(--success-color);
}
.keyframe-badge {
  background: var(--warning-color);
}
.diff-badge {
  background: var(--info-color);
}
```

### Q5: SVG 预览规范

- `version-preview` - 16:10 比例，`object-fit: contain`，边框 `var(--border-light)`，阴影 `var(--shadow-1)`
- `version-preview--placeholder` - 缺失预览降级（ImageOff 图标）
- `version-page-badge` - 页面数徽章，背景 `var(--bg-secondary)`，边框 `var(--border-primary)`
- `version-pages-grid` - 多页懒加载栅格，使用 `repeat(auto-fit, minmax(120px, 1fr))`

### Q6: 测试样式修改？

1. 开发模式自动热更新（CSS 修改无需重启）
2. 搜索硬编码值 (`px`, `#`, `rgba`)
3. 测试响应式和深色模式

---

## 更新历史

### 2025-11-17 ~ 2025-11-19: 主题色彩现代化

- **主色调优化**: OKLCH 色彩空间，提升饱和度和对比度
- **深色模式完善**: 提亮确保可读性
- **对比度增强**: 边框透明度梯度优化，阴影模糊半径翻倍
- **现代 UI 效果**: 新增渐变和玻璃形态变量
- **主题切换**: `ThemeToggle` 组件，localStorage 持久化
- **硬编码清理**: 移除项目中所有硬编码颜色值

### 2025-11-13: 版本管理现代化外观

- 版本侧边栏信息描述区和空状态优化
- WIP 指示器卡片式设计
- 历史时间线主轴 + 节点视觉
- 统一徽章系统（最新/关键帧/Diff）

### 2025-11-12: Material Design 规范化

- 统一圆角规范 4px/8px/12px
- 建立 Material Design 4 层阴影系统
- 标准间距系统（4px 基准）
- 移除干扰性动画

---

**维护提示**: 修改 `drawio2go.css` 后，请同步更新本文档。
