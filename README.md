# DrawIO2Go

基于 Electron + Next.js + HeroUI 构建的跨平台 DrawIO 编辑器应用。

## 功能特性

- ✨ 基于 DrawIO 的强大图表编辑功能
- 💾 本地文件保存和加载
- ⚙️ 自定义默认保存路径
- 🎨 现代化 UI（HeroUI v3 + Tailwind CSS v4）
- 🖥️ 跨平台支持（Windows, macOS, Linux）
- 🌐 同时支持浏览器和桌面应用模式

## 技术栈

- **前端框架**: Next.js 15 (App Router)
- **UI 库**: HeroUI v3 (Alpha)
- **样式**: Tailwind CSS v4
- **DrawIO 集成**: react-drawio
- **桌面应用**: Electron
- **语言**: TypeScript

## 开发环境要求

- Node.js 20.x 或更高版本
- npm 或其他包管理器

## 安装和运行

### 1. 安装依赖

```bash
npm install
```

### 2. 开发模式

**仅运行 Next.js 网页版**:

```bash
npm run dev
```

然后在浏览器中访问 `http://localhost:3000`

**运行 Electron 桌面应用**:

```bash
npm run electron:dev
```

### 3. 生产构建

**构建 Next.js 应用**:

```bash
npm run build
```

**构建 Electron 应用**:

```bash
npm run electron:build
```

这将在 `dist` 目录中生成适合您平台的安装包。

## 使用说明

### 主界面

- **DrawIO 编辑器**: 主要编辑区域，占据大部分界面
- **顶栏操作区**: 由左到右依次展示选区状态 → 工程选择按钮（居中铺满）→ 加载/保存 → 侧栏收起/展开图标
- **统一侧栏**: 点击顶栏最右侧图标展开，顶部 Tab 可在“聊天 / 设置 / 版本”之间切换

### 设置

1. 点击顶栏最右侧的侧栏图标展开统一侧栏
2. 在侧栏顶部 Tab 中选择“设置”
3. 配置以下项目：
   - **默认启动路径**: 设置图表文件的默认保存/加载目录
     - 点击"浏览"按钮选择文件夹
     - 或直接输入路径
     - 设置保存后，使用"保存"按钮会自动在此目录创建文件

### 文件操作

#### 保存图表

1. 编辑完成后，点击"保存"按钮
2. 如果已设置默认路径，文件会自动保存到该目录
3. 否则会弹出文件选择对话框

#### 加载图表

1. 点击"加载"按钮
2. 选择要打开的 .drawio 文件
3. 图表会在编辑器中打开

### 自动保存

应用会自动将编辑内容保存到浏览器的 localStorage，确保数据不会丢失。

## 项目结构

```
drawio2go/
├── app/                      # Next.js App Router 应用
│   ├── components/           # React 组件
│   │   ├── DrawioEditorNative.tsx  # DrawIO 编辑器组件（iframe + PostMessage）
│   │   ├── TopBar.tsx        # 顶栏组件
│   │   └── SettingsPopover.tsx # 设置弹窗组件
│   ├── layout.tsx            # 根布局
│   ├── page.tsx              # 主页面
│   └── globals.css           # 全局样式
├── electron/                 # Electron 相关文件
│   ├── main.js               # 主进程
│   └── preload.js            # 预加载脚本
├── package.json
├── next.config.mjs
├── postcss.config.mjs
└── tsconfig.json
```

## 开发说明

### 添加新组件

组件应放置在 `app/components/` 目录下，需要交互的组件记得添加 `"use client"` 指令。

### 修改 Electron 配置

Electron 相关配置在 `electron/main.js` 中，包括窗口大小、IPC 通信等。

### 样式自定义

全局样式在 `app/globals.css` 中，可以覆盖 HeroUI 的 CSS 变量来自定义主题。

## 注意事项

- HeroUI v3 目前处于 Alpha 阶段，API 可能会有变化
- 开发环境下 Electron 会自动打开开发者工具
- 文件保存路径需要有写入权限

## License

MIT
