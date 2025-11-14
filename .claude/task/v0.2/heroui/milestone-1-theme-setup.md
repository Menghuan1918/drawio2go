# Milestone 1: 主题配置与基础设施

## 📋 里程碑概述

**优先级**：⭐⭐⭐ 最高
**预计时间**：2-3 小时
**状态**：✅ 已完成（2025-11-14）
**依赖**：无
**阻塞**：Milestone 2, 3, 4, 5

## 🎯 目标

建立 HeroUI V3 自定义主题配置，作为整个迁移项目的基础设施。确保主题色、圆角、间距等设计令牌正确映射到 HeroUI 的主题系统。

## ✅ 任务清单

### 1. 颜色转换与配置

- [x] **将主题色 #3388BB 转换为 oklch 格式**
  - 使用 [OKLCH Color Tool](https://oklch.com) 进行转换
  - 记录转换结果：`oklch(0.5843 0.0889 234.67)`
  - 计算 hover 态、light 态的 oklch 值
  - 实际写入：`--accent: oklch(0.5843 0.0889 234.67)`、`--accent-hover: oklch(0.5216 0.1033 243.38)`、`--accent-soft: color-mix(in oklch, var(--accent) 15%, var(--background))`

- [x] **配置浅色模式主题色变量**
  - `--accent`: 主题色
  - `--accent-foreground`: 主题色上的前景色（文字）
  - `--accent-hover`: hover 态
  - `--accent-soft`: 软化色（15% 透明度）

- [x] **配置深色模式主题色变量**
  - 适配深色背景的主题色亮度
  - 确保对比度符合 WCAG 标准
  - 实际应用：`--accent: oklch(0.69 0.0889 234.67)`、`--accent-hover: oklch(0.74 0.0889 234.67)`、`--accent-soft: color-mix(in oklch, var(--accent) 22%, var(--background))`

### 2. 圆角系统映射

- [x] **映射三级圆角到 HeroUI**
  - 当前：`--radius-sm: 4px`, `--radius: 8px`, `--radius-lg: 12px`
  - HeroUI：设置 `--radius: 0.5rem` (8px) 作为基准
  - 验证 HeroUI 自动计算的其他圆角值是否符合需求

- [x] **配置 field-radius**
  - `--field-radius: calc(var(--radius) * 1.5)` = 12px
  - 用于表单输入框的圆角

### 3. 间距系统保留

- [x] **保留现有间距变量**
  ```css
  --spacing-xs: 4px --spacing-sm: 8px --spacing-md: 16px --spacing-lg: 24px
    --spacing-xl: 32px;
  ```
  这些与 HeroUI 无冲突，继续使用

### 4. 阴影系统映射

- [x] **映射 Material Design 阴影到 HeroUI**
  - `--shadow-1` → `--surface-shadow` (轻微提升)
  - `--shadow-2` → `--overlay-shadow` (中等提升)
  - 深色模式：阴影设置为 transparent（Material Design 规范）

### 5. 创建自定义主题文件

- [x] **创建 `app/styles/themes/drawio2go.css`**
  - 包含浅色模式配置 `[data-theme="drawio2go"]`
  - 包含深色模式配置 `[data-theme="drawio2go-dark"]`
  - 参考 HeroUI 官方主题结构
  - 包含 `@theme inline` 暴露 `--color-*`、`--radius-*` 供 Tailwind 使用

### 6. 更新全局样式入口

- [x] **修改 `app/globals.css`**
  - 导入 Tailwind CSS
  - 导入 HeroUI 样式
  - 导入自定义主题
  - 保留必要的全局样式（滚动条、Markdown等）
  - 删除即将废弃的样式导入（buttons.css 等）
  - 采用 `@layer theme, base, components, utilities` 统一控制顺序

### 7. 更新 HTML 主题属性

- [x] **修改根 HTML 元素**
  - 浅色模式：`<html class="light" data-theme="drawio2go">`
  - 深色模式：`<html class="dark" data-theme="drawio2go-dark">`
  - 确保 body 应用 `bg-background text-foreground`
  - `app/layout.tsx` 默认输出 `class="light" data-theme="drawio2go"` 并允许客户端切换

### 8. 配置 Tailwind 主题扩展

- [x] **在主题文件中使用 `@theme inline` 指令**
  - 将自定义颜色变量暴露给 Tailwind
  - 确保可以使用 `bg-primary`、`text-primary` 等工具类

## 📝 实现细节

### 主题文件结构参考

```css
/* app/styles/themes/drawio2go.css */
@layer base {
  /* DrawIO2Go Light Theme */
  [data-theme="drawio2go"] {
    color-scheme: light;

    /* Primitive Colors */
    --white: oklch(100% 0 0);
    --black: oklch(0% 0 0);
    --snow: oklch(0.9911 0 0);
    --eclipse: oklch(0.2103 0.0059 285.89);

    /* Spacing & Layout */
    --spacing: 0.25rem; /* HeroUI 基础间距 */
    --border-width: 0px;
    --disabled-opacity: 0.5;

    /* Radius - 8px 作为基准 */
    --radius: 0.5rem; /* 8px */
    --field-radius: calc(var(--radius) * 1.5); /* 12px */

    /* Base Colors */
    --background: oklch(0.9702 0 0);
    --foreground: var(--eclipse);

    /* Surface & Overlay */
    --surface: var(--white);
    --surface-foreground: var(--foreground);
    --overlay: var(--white);
    --overlay-foreground: var(--foreground);

    /* Primary/Accent - DrawIO2Go 蓝色 #3388BB */
    --accent: oklch(0.5843 0.0889 234.67);
    --accent-foreground: var(--snow);

    /* Default */
    --default: oklch(94% 0.001 286.375);
    --default-foreground: var(--eclipse);

    /* Status Colors */
    --success: oklch(0.7329 0.1935 150.81);
    --success-foreground: var(--eclipse);
    --warning: oklch(0.7819 0.1585 72.33);
    --warning-foreground: var(--eclipse);
    --danger: oklch(0.6532 0.2328 25.74);
    --danger-foreground: var(--snow);

    /* Shadows - Material Design */
    --surface-shadow: 0 2px 4px 0 rgba(51, 136, 187, 0.12);
    --overlay-shadow: 0 4px 12px 0 rgba(51, 136, 187, 0.16);
    --field-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.04);
  }

  /* DrawIO2Go Dark Theme */
  [data-theme="drawio2go-dark"] {
    color-scheme: dark;

    /* Base Colors */
    --background: oklch(12% 0.005 285.823);
    --foreground: var(--snow);

    /* Surface & Overlay */
    --surface: oklch(0.2103 0.0059 285.89);
    --surface-foreground: var(--foreground);
    --overlay: oklch(0.22 0.0059 285.89);
    --overlay-foreground: var(--foreground);

    /* Primary/Accent - 适配深色模式 */
    --accent: oklch(0.65 0.1 234.67); /* 提高亮度 */
    --accent-foreground: var(--snow);

    /* Default */
    --default: oklch(27.4% 0.006 286.033);
    --default-foreground: var(--snow);

    /* Status Colors */
    --success: oklch(0.7329 0.1935 150.81);
    --success-foreground: var(--eclipse);
    --warning: oklch(0.8203 0.1388 76.34);
    --warning-foreground: var(--eclipse);
    --danger: oklch(0.594 0.1967 24.63);
    --danger-foreground: var(--snow);

    /* Shadows - 深色模式无阴影 */
    --surface-shadow: 0 0 0 0 transparent inset;
    --overlay-shadow: 0 0 0 0 transparent inset;
    --field-shadow: 0 0 0 0 transparent inset;
  }
}
```

### globals.css 更新参考

```css
/* app/globals.css */

/* 定义 CSS 图层顺序 */
@layer theme, base, components, utilities;

/* 导入 Tailwind CSS */
@import "tailwindcss";

/* 导入 HeroUI 基础样式 */
@import "@heroui/styles";

/* 导入自定义主题 */
@import "./styles/themes/drawio2go.css" layer(theme);

/* 导入保留的全局样式模块 */
@import "./styles/base/globals.css" layer(base);
@import "./styles/layout/container.css" layer(components);
@import "./styles/layout/sidebar.css" layer(components);
@import "./styles/utilities/scrollbars.css" layer(utilities);
@import "./styles/utilities/markdown.css" layer(utilities);

/* 其他样式将在后续里程碑中逐步整合或删除 */
```

## 🧪 验证标准

### 功能验证

- [x] **主题色应用正确**
  - HeroUI Button `color="primary"` 显示 #3388BB
  - hover 态颜色正确
  - 深色模式主题色对比度足够

- [x] **圆角显示正确**
  - Button 圆角为 8px
  - Input 圆角为 12px
  - Card 圆角为 8px

- [x] **阴影显示正确**
  - 浅色模式：卡片有轻微蓝色阴影
  - 深色模式：无阴影或透明阴影

- [x] **深色模式切换正常**
  - 主题色、背景色、前景色切换正确
  - 无闪烁或样式错乱

### 代码验证

- [x] **CSS 变量定义完整**
  - 使用浏览器 DevTools 检查所有 HeroUI 必需变量已定义
  - 无 CSS 警告或错误

- [x] **Tailwind 工具类可用**
  - `bg-accent`、`text-accent` 等类可用
  - 圆角工具类生效（`rounded-lg` 等）

- [x] **无样式冲突**
  - 检查浏览器 DevTools 无样式覆盖冲突
  - 无 !important 使用（本里程碑范围内）

## 📚 参考资源

- [HeroUI Theming Guide](https://v3.heroui.com/docs/handbook/theming)
- [HeroUI Colors Guide](https://v3.heroui.com/docs/handbook/colors)
- [OKLCH Color Tool](https://oklch.com)
- [HeroUI Default Theme Source](https://github.com/heroui-inc/heroui/blob/v3/packages/styles/themes/default/variables.css)

## ⚠️ 注意事项

1. **OKLCH 颜色格式**
   - HeroUI v3 使用 oklch() 而非传统 hex/rgb
   - 确保颜色转换准确，避免色差

2. **图层顺序**
   - 必须正确定义 `@layer` 顺序
   - theme < base < components < utilities

3. **data-theme 属性**
   - 必须同时设置 `class="light/dark"` 和 `data-theme="xxx"`
   - 两者缺一不可

4. **CSS 变量作用域**
   - 主题变量定义在 `[data-theme="xxx"]` 选择器下
   - 确保全局可访问

5. **HeroUI 计算变量**
   - HeroUI 会自动计算 hover、soft 等变体
   - 无需手动定义所有变体

## 🔗 相关里程碑

- **阻塞的里程碑**：
  - Milestone 2: Button 迁移（需要主题色配置）
  - Milestone 3: 表单组件（需要圆角配置）
  - Milestone 5: CSS 清理（需要确认哪些样式可删除）

- **后续优化**：
  - 可在后续里程碑中微调主题变量
  - 根据实际效果调整阴影、间距等

## 📝 完成标准

- [x] 所有任务清单项完成
- [x] 所有验证标准通过
- [x] 主题在浏览器中正确显示
- [x] 无 console 错误或警告
- [x] 代码已提交到 Git（建议使用专门的分支）

---

**创建日期**：2025-11-14
**预计开始**：待定
**实际开始**：2025-11-14
**完成日期**：2025-11-14
