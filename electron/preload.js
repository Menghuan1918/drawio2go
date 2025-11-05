const { contextBridge, ipcRenderer } = require("electron");

// 暴露安全的 API 到渲染进程
contextBridge.exposeInMainWorld("electron", {
  // 选择文件夹
  selectFolder: () => ipcRenderer.invoke("select-folder"),

  // 保存图表
  saveDiagram: (xml, defaultPath) =>
    ipcRenderer.invoke("save-diagram", xml, defaultPath),

  // 加载图表
  loadDiagram: () => ipcRenderer.invoke("load-diagram"),

  // 打开外部链接
  openExternal: (url) => ipcRenderer.invoke("open-external", url),

  // 通用文件对话框和文件操作
  showSaveDialog: (options) => ipcRenderer.invoke("show-save-dialog", options),
  showOpenDialog: (options) => ipcRenderer.invoke("show-open-dialog", options),
  writeFile: (filePath, data) => ipcRenderer.invoke("write-file", filePath, data),
  readFile: (filePath) => ipcRenderer.invoke("read-file", filePath),

  // 启用 DrawIO 选区监听
  enableSelectionWatcher: () => ipcRenderer.invoke("enable-selection-watcher"),
});
