# Electron 桌面应用

## 概述

基于 Electron 38.x 构建的跨平台桌面应用，提供文件系统访问和原生桌面功能。

### 环境检测

在 React 组件中检测 Electron 环境：

```typescript
const isElectron = typeof window !== "undefined" && (window as any).electron;

if (isElectron) {
  // Electron 特定功能
  const folderPath = await window.electron.selectFolder();
}
```

### 文件操作流程

- **保存流程**:
  1. 检查是否有默认路径
  2. 有默认路径：自动生成文件名保存
  3. 无默认路径：弹出保存对话框
  4. 格式：`diagram_YYYY-MM-DDTHH-MM-SS.drawio`
- **加载流程**:
  1. 弹出文件选择对话框
  2. 读取文件内容
  3. 返回 XML 内容给前端

## 文件结构

```
electron/
├── main.js      # Electron 主进程入口
└── preload.js   # 预加载脚本，安全暴露 IPC API
```

## 核心功能

### 1. 主进程 (main.js)

#### 窗口配置

- **尺寸**: 1200x800 像素
- **图标**: `/public/icon.png`
- **Web 首选项**:
  - 开发模式: `webSecurity: false`, `sandbox: false`
  - 生产模式: `webSecurity: true`, `sandbox: true`

#### IPC API (通过 preload.js 暴露)

- `window.electron.selectFolder()`: 选择文件夹
- `window.electron.saveDiagram(xml, path)`: 保存文件
- `window.electron.loadDiagram()`: 加载文件
- `window.electron.openExternal(url)`: 打开外部链接

#### 安全策略

- **CSP 配置**: 仅允许 `embed.diagrams.net` iframe
- **开发模式**: 宽松的安全策略，便于调试
- **生产模式**: 严格的安全限制

### 2. 预加载脚本 (preload.js)

#### 安全桥接

通过 `contextBridge` 安全地暴露主进程 API：

```javascript
contextBridge.exposeInMainWorld("electron", {
  selectFolder: () => ipcRenderer.invoke("select-folder"),
  saveDiagram: (xml, path) => ipcRenderer.invoke("save-diagram", xml, path),
  loadDiagram: () => ipcRenderer.invoke("load-diagram"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
});
```

## 开发配置

### 开发模式

- 自动打开开发者工具
- 禁用安全限制便于调试
- 支持 DrawIO iframe 显示

### 生产构建

- 启用完整安全限制
- CSP 仅允许必要的域名
- 优化的性能和安全性

## 环境检测

在 React 组件中检测 Electron 环境：

```typescript
const isElectron = typeof window !== "undefined" && (window as any).electron;

if (isElectron) {
  // Electron 特定功能
  const folderPath = await window.electron.selectFolder();
}
```

## 文件操作

### 保存流程

1. 检查是否有默认路径
2. 有默认路径：自动生成文件名保存
3. 无默认路径：弹出保存对话框
4. 格式：`diagram_YYYY-MM-DDTHH-MM-SS.drawio`

### 加载流程

1. 弹出文件选择对话框
2. 读取文件内容
3. 返回 XML 内容给前端

## 构建配置

### electron-builder 配置

- **App ID**: `com.drawio2go.app`
- **产品名称**: DrawIO2Go
- **目标平台**:
  - Windows: NSIS
  - macOS: DMG
  - Linux: AppImage

### 构建命令

```bash
npm run electron:build  # 构建桌面应用
```

## 常见问题

### DrawIO iframe 不显示

**原因**: Electron 安全策略阻止外部 iframe

**解决方案**:

- 开发模式：设置 `webSecurity: false`
- 生产模式：配置 CSP 允许 `embed.diagrams.net`

**调试步骤**:

1. 打开 DevTools (开发模式自动打开)
2. 检查 Console: 查找 `✅ DrawIO iframe 初始化成功！`
3. 检查 Network: 确认 `embed.diagrams.net` 请求成功
4. 常见错误: `Refused to frame`, `ERR_BLOCKED_BY_CLIENT`

**生产环境**:

- ⚠️ 启用 `webSecurity: true`, `sandbox: true`
- ✅ CSP 仅允许 `frame-src https://embed.diagrams.net`
- 💡 可选: 自托管 DrawIO 静态文件

### 调试技巧

1. 开发模式自动打开 DevTools
2. 检查 Console 中的错误信息
3. 验证 CSP 配置是否正确
4. 确认网络请求是否成功
