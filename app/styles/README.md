# CSS模块化架构说明

## 📁 目录结构

```
app/styles/
├── README.md              # 架构说明文档
├── base/                  # 基础样式模块
│   ├── variables.css      # CSS变量定义
│   ├── reset.css          # 全局重置样式
│   └── globals.css        # 全局基础样式
├── layout/                # 布局样式模块
│   ├── container.css      # 主容器和编辑器布局
│   └── sidebar.css        # 侧边栏相关样式
├── components/            # 组件样式模块
│   ├── chat.css           # 聊天相关组件样式
│   ├── forms.css          # 表单控件样式
│   ├── modal.css          # 弹窗组件样式
│   ├── sessions.css       # 会话管理样式
│   └── version-*.css      # 版本管理子模块
├── utilities/             # 工具类模块
│   ├── animations.css     # 动画关键帧定义
│   ├── markdown.css       # Markdown内容样式
│   ├── components.css     # 通用组件样式（错误提示、思考框等）
│   ├── scrollbars.css     # 滚动条样式
│   └── tool-calls.css     # Tool Call卡片样式
└── themes/                # 主题相关模块
    └── drawio2go.css      # HeroUI 自定义主题（浅/深色）
```

## 🎯 设计原则

### 1. 模块化拆分

- **按功能分离**：将样式按照功能模块进行拆分，便于维护
- **单一职责**：每个CSS文件只负责特定领域的样式
- **层次清晰**：从基础到组件，从布局到业务，层次分明

### 2. 导入顺序

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

/* 4. 布局/业务组件 */
@import "./styles/layout/container.css" layer(components);
@import "./styles/layout/sidebar.css" layer(components);
@import "./styles/components/chat.css" layer(components);
@import "./styles/components/forms.css" layer(components);
@import "./styles/components/modal.css" layer(components);
@import "./styles/components/sessions.css" layer(components);
@import "./styles/components/version-*.css" layer(components);

/* 5. 工具类 */
@import "./styles/utilities/animations.css" layer(utilities);
@import "./styles/utilities/markdown.css" layer(utilities);
@import "./styles/utilities/components.css" layer(utilities);
@import "./styles/utilities/scrollbars.css" layer(utilities);
@import "./styles/utilities/tool-calls.css" layer(utilities);
```

### 3. CSS变量系统

- **设计令牌**：统一管理颜色、间距、阴影等设计变量
- **语义化命名**：使用有意义的变量名，如 `--primary-color`、`--border-primary`
- **主题支持**：通过 `themes/drawio2go.css` 维护 `[data-theme="drawio2go(-dark)"]`

## 🎨 主要优化

### 1. 代码复用

- 提取公共颜色值和阴影样式
- 统一边框、背景、过渡动画等常用样式
- 减少重复代码，提高维护性

### 2. 响应式设计

- 保持原有的响应式布局
- 优化容器和组件的自适应能力

### 3. 性能优化

- 模块化加载，便于按需优化
- 保持CSS选择器的高效性
- 优化动画性能

## 📝 开发规范

### 1. 命名规范

- 使用BEM命名方法论
- 组件名使用kebab-case
- 避免过度嵌套的选择器

### 2. 代码组织

- 按功能模块组织CSS代码
- 保持代码的可读性和可维护性
- 添加适当的注释说明

### 3. 主题开发

- HeroUI 主题变量统一放在 `themes/drawio2go.css` 中，按 `[data-theme="drawio2go"]`/`[data-theme="drawio2go-dark"]` 分组
- `base/variables.css` 仅保留设计令牌及兼容性别名（如 `--primary-color` → `--accent`）
- 在 `drawio2go.css` 的 `@theme inline` 区域暴露 `--color-*`/`--radius-*` 供 Tailwind 使用
- 切换深浅色时只需修改 `<html class="light|dark" data-theme="drawio2go(-dark)">`

## 🔧 维护指南

### 1. 添加新组件

1. 确定组件类型（布局、业务组件、工具类等）
2. 在对应目录下创建CSS文件
3. 在主 `globals.css` 中添加导入
4. 更新此README文档

### 2. 修改现有样式

1. 定位到对应的模块文件
2. 检查是否影响其他组件
3. 确保主题兼容性
4. 测试深色/浅色模式

### 3. 性能监控

- 定期检查CSS文件大小
- 监控关键选择器的性能
- 优化重复和冗余的样式

## 🚀 未来扩展

1. **按需加载**：可以考虑实现CSS模块的按需加载
2. **主题系统**：支持更多主题变体
3. **组件库**：将常用组件抽象为可复用的组件库
4. **自动化**：集成PostCSS插件进行自动化优化
