<img width="250px" src="public/icon/logo.svg" align="left"/>

# DrawIO2Go

<strong>AI 加持，人机共绘</strong>

![Electron](https://img.shields.io/badge/Electron-38.x-47848F?logo=electron&logoColor=white)
![Nextjs](https://img.shields.io/badge/Next.js-15-black?logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Windows](https://img.shields.io/badge/-Windows-blue?logo=windows&logoColor=white)
![MacOS](https://img.shields.io/badge/-macOS-black?&logo=apple&logoColor=white)
![Linux](https://img.shields.io/badge/-Linux-yellow?logo=linux&logoColor=white)

<p align="center">
  简体中文 | <a href="./README.md">English</a><br><br>
  <a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FMenghuan1918%2Fdrawio2go"><img src="https://vercel.com/button" alt="Deploy with Vercel"/>
</p>

---

一款现代化的 DrawIO 编辑器应用，致力于在AI加持下构建更好的**人机协同**建模工具。以用户为中心，提升人机功效，探索如何让更好与AI取长补短。提供开箱即用的应用(Windows/Linux/Mac OS)或作为网页部署。

https://github.com/user-attachments/assets/40fe5c3b-0f37-4fbf-b6ac-60b8734f2d14

<div align="center">
<table width="100%">
  <tr>
    <td width="33.33%" valign="top" align="center">
      <h3>版本管理</h3>
      <p>手动创建版本/AI自动创建版本</p>
      <img src="https://github.com/user-attachments/assets/59d8c33a-af5c-4433-ae94-99827509e632" alt="版本控制" width="60%" />
      <br />
    </td>
    <td width="33.33%" valign="top" align="center">
      <h3>AI加持修改</h3>
      <p>基于XPath的精准删改查工具，效果好省token*</p>
      <img src="https://github.com/user-attachments/assets/db4c17b7-49f9-407d-a046-227092e70708" alt="演示" width="60%" />
      <br />
    </td>
    <td width="33.33%" valign="top" align="center">
      <h3>MCP服务</h3>
      <p>启动带<b>画布内容版本管理</b>的MCP服务，连接其他应用</p>
      <img src="https://github.com/user-attachments/assets/ad6c9e0c-8f71-4776-8522-73ebf89bf813" alt="MCP" />
      <br />
    </td>
  </tr>
  <tr>
    <td width="33.33%" valign="top" align="center">
      <h3>多页面编辑</h3>
      <p>支持多页面drawio编辑，让AI仅编辑你想要修改的部分</p>
      <img src="https://github.com/user-attachments/assets/b999be6b-b41e-4f73-8059-7cd26dafdd8b" alt="pages" width="90%" />
      <br />
    </td>
    <td width="33.33%" valign="top" align="center">
      <h3>版本对比</h3>
      <p>轻松对比/回滚不同修改版本之间的差异</p>
      <img src="https://github.com/user-attachments/assets/149b0247-f6ae-48bd-a8e3-70dce2a3622e" alt="对比页面" width="100%" />
      <br />
      <br />
    </td>
    <td width="33.33%" valign="top" align="center">
      <h3>画布上下文</h3>
      <p>不再需要描述“最右边的几个xxx”，直接鼠标框选，会话会自动解析画布元素到上下文中**</p>
      <img src="https://github.com/user-attachments/assets/07ec5631-21bc-4a11-853a-62058061c49f" alt="上下文" width="100%" />
      <br />
      <br />
    </td>
  </tr>
</table>
</div>
<sub>* 目前LLM API支持Openai/Deepseek/Anthropic/Gemini格式</sub>
<br />
<sub>** 受限于Web API限制，鼠标选中感知功能在Web端不可用。但是Web端依然有基础的压缩画布内容上下文注入功能</sub>
<br />
<br />

以下是一些实际的演示以及其提示词：

<div align="center">
<table width="100%">
  <tr>
    <td width="50%" valign="top" align="center">
      <h3>U-net框架图</h3>
      <p><b>glm-4.6</b> - 绘制一个unet网络</p>
      <img src="https://github.com/user-attachments/assets/5fae95e9-573c-4ced-8841-7b27dd8cc97b" alt="unet" width="100%" />
      <br />
      <br />
    </td>
    <td width="50%" valign="top" align="center">
      <h3>图转drawio</h3>
      <p><b>claude-sonnet-4.5</b> - 传入使用gemini-3-pro-image生成的图片，要求其复刻</p>
      <img src="https://github.com/user-attachments/assets/1b5be219-0dc6-48c8-abdc-f0a2946bf148" alt="image" width="100%" />
      <br />
    </td>
  </tr>
    <tr>
    <td width="50%" valign="top" align="center">
      <h3>UML框架图</h3>
      <p><b>glm-4.7</b> - 绘制一个经典的前后端的WEB应用UML框架图</p>
      <img src="https://github.com/user-attachments/assets/738ef6a9-a703-49d8-b26e-5438130106d1" alt="UML" width="100%" />
      <br />
      <br />
    </td>
    <td width="50%" valign="top" align="center">
      <h3>纯元素绘制</h3>
      <p><b>gemini-3-pro-preview</b> - 画一个笔记本电脑</p>
      <img src="https://github.com/user-attachments/assets/f330468b-c52a-416a-9198-4e2e9b22539c" alt="演示" width="80%" />
      <br />
      <br />
    </td>
  </tr>
</table>
</div>

## 快速开始

### 使用Electron APP

前往[Releases](https://github.com/Menghuan1918/drawio2go/releases)下载安装最新版本

### 部署为网页

环境需要：

- Node.js 22.x 或更高版本
- npm

随后运行以下命令

```bash
# 克隆仓库
git clone https://github.com/your-username/drawio2go.git
cd drawio2go

# 安装依赖
npm install
```

**网页版（浏览器）：**

```bash
npm run dev
```

在浏览器中打开 [http://localhost:3000](http://localhost:3000)

> [!IMPORTANT]
> 请注意，目前暂时还没适配多人使用WEB端（虽然理论上没有问题，但是没有测试）

## 已知问题

- [x] WEB端中，对话可能会无法取消
- [x] 目前一些drawio工具的具体错误无法被捕获
- [x] 对话保存目前有一些问题，可能会导致历史对话加载异常
- [ ] 一些UI显示存在一些问题

## 即将推出的新特征

- [x] Electron中支持将画布中选中的元素传递给AI
- [ ] 多页面drawio支持
- [ ] 完全的图形/文件对话支持
- [ ] 支持自定义drawio控件URL
- [ ] 直接导出为png/svg
- [ ] 增加更多LLM API支持
- [ ] 支持将项目导出为文件

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
└── server.js              # Next.js 自定义 HTTP 服务器
```

## 开发指南

### 常用命令

```bash
npm run dev          # 启动开发服务器
npm run build        # 构建生产版本
npm run lint         # 运行 ESLint + TypeScript 检查 + 复杂度检查
npm run test         # 运行测试
npm run format       # 使用 Prettier 格式化代码
```

### 生产构建

```bash
# 构建 Next.js 应用
npm run build

# 构建 Electron 安装包（输出到 dist/ 目录）
npm run electron:build
```

## 参与贡献

欢迎提交 PR！请在提交前阅读贡献指南。

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 协议

本项目基于 MIT 协议开源

## 感谢

- [next-ai-draw-io](https://github.com/DayuanJiang/next-ai-draw-io) - 灵感来源，优秀的drawio AI生成实现
- [DrawIO](https://www.drawio.com/) - 图表编辑引擎
- [HeroUI](https://heroui.com/) - UI 组件库
- [Vercel AI SDK](https://sdk.vercel.ai/) - AI 集成框架
