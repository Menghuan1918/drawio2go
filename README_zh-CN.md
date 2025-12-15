# DrawIO2Go

<p align="center">
  <strong>AI 驱动的跨平台 DrawIO 编辑器</strong>
</p>

<p align="center">
  简体中文 | <a href="./README.md">English</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-38.x-47848F?logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/Next.js-15-black?logo=next.js&logoColor=white" alt="Next.js">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License">
</p>

---

一款现代化的跨平台 DrawIO 编辑器应用，基于 Electron、Next.js 15 和 HeroUI v3 构建。支持 AI 辅助绘图、版本控制和精美的 Material Design 界面。

## 功能特性

- **AI 智能编辑** - 通过对话让 AI 帮你创建、修改和理解图表
- **版本控制** - 完整的版本历史记录，支持差异对比和一键回滚
- **跨平台运行** - 支持 Windows、macOS、Linux 以及浏览器模式
- **现代化界面** - 基于 HeroUI v3 的 Material Design 设计风格
- **多语言支持** - 支持中文、英文和日文
- **实时通讯** - Socket.IO 驱动的 AI 与编辑器双向通信
- **深色模式** - 支持系统级主题自动切换

## 技术栈

| 类别          | 技术                                          |
| ------------- | --------------------------------------------- |
| **前端框架**  | Next.js 15 (App Router) + React 19            |
| **UI 组件库** | HeroUI v3 (Beta) - 基于 React Aria Components |
| **样式方案**  | Tailwind CSS v4                               |
| **桌面框架**  | Electron 38.x                                 |
| **AI 集成**   | Vercel AI SDK，支持多服务商                   |
| **数据存储**  | SQLite (Electron) / IndexedDB (浏览器)        |
| **开发语言**  | TypeScript                                    |

## 快速开始

### 环境要求

- Node.js 20.x 或更高版本
- pnpm（推荐）或 npm

### 安装

```bash
# 克隆仓库
git clone https://github.com/your-username/drawio2go.git
cd drawio2go

# 安装依赖
pnpm install
```

### 开发模式

**网页版（浏览器）：**

```bash
pnpm run dev
```

在浏览器中打开 [http://localhost:3000](http://localhost:3000)

**桌面版（Electron）：**

```bash
pnpm run electron:dev
```

### 生产构建

```bash
# 构建 Next.js 应用
pnpm run build

# 构建 Electron 安装包（输出到 dist/ 目录）
pnpm run electron:build
```

## 项目结构

```
drawio2go/
├── app/                    # Next.js App Router
│   ├── components/         # React 组件
│   │   ├── chat/          # AI 聊天模块
│   │   ├── settings/      # 设置面板
│   │   ├── version/       # 版本管理
│   │   └── toast/         # 通知组件
│   ├── lib/               # 工具库与服务
│   │   └── storage/       # 统一存储层
│   ├── hooks/             # React Hooks
│   ├── i18n/              # 国际化配置
│   ├── api/               # API 路由
│   └── styles/            # 样式模块
├── electron/              # Electron 主进程
└── server.js              # Socket.IO + Next.js 服务器
```

## 配置说明

### AI 服务商配置

1. 展开侧边栏，切换到**设置**标签页
2. 配置你的 AI 服务商：
   - **Anthropic Claude** - 从 [anthropic.com](https://anthropic.com) 获取 API Key
   - **OpenAI** - 从 [openai.com](https://openai.com) 获取 API Key
   - **DeepSeek** - 从 [deepseek.com](https://deepseek.com) 获取 API Key
   - **OpenAI Compatible** - 自定义端点，适用于本地模型（如 LM Studio）

### 支持的 AI 模型

- Claude 3.5 Sonnet / Claude 3 Opus
- GPT-4o / GPT-4 Turbo
- DeepSeek V3 / DeepSeek Reasoner
- 任何 OpenAI 兼容的模型

## 使用指南

### 界面概览

- **编辑区域** - DrawIO 主画布，用于图表编辑
- **顶栏** - 项目选择器、保存/加载按钮、侧边栏开关
- **侧边栏** - 标签页界面，包含聊天、设置和版本历史

### AI 聊天

1. 点击顶栏右侧图标展开侧边栏
2. 选择**聊天**标签页
3. 描述你想创建或修改的内容
4. AI 将直接在图表上执行修改

### 版本管理

1. 在侧边栏选择**版本**标签页
2. 查看带缩略图的版本时间线
3. 使用智能差异对比功能查看版本变化
4. 一键恢复到任意历史版本

## 开发指南

### 常用命令

```bash
pnpm run dev          # 启动开发服务器
pnpm run build        # 构建生产版本
pnpm run lint         # 运行 ESLint + TypeScript 检查
pnpm run test         # 运行测试
pnpm run format       # 使用 Prettier 格式化代码
```

### 架构说明

- 使用 **pnpm** 作为包管理器
- 必须使用 `pnpm run dev`（而非 `next dev`）以支持 Socket.IO
- HeroUI v3 需要 Tailwind CSS v4
- 组件使用 `onPress` 而非 `onClick`（React Aria 规范）

## 参与贡献

欢迎提交 PR！请在提交前阅读贡献指南。

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 开源协议

本项目基于 MIT 协议开源 - 详见 [LICENSE](LICENSE) 文件。

## 致谢

- [DrawIO](https://www.drawio.com/) - 图表编辑引擎
- [HeroUI](https://heroui.com/) - UI 组件库
- [Vercel AI SDK](https://sdk.vercel.ai/) - AI 集成框架
- [Electron](https://www.electronjs.org/) - 桌面应用框架
