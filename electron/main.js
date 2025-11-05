const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");

let mainWindow;
// 更可靠的开发模式检测：检查是否打包或者环境变量
const isDev = !app.isPackaged || process.env.NODE_ENV === "development";

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      // 允许加载外部内容（DrawIO iframe）
      webSecurity: isDev ? false : true, // 开发模式下禁用 web 安全限制
      allowRunningInsecureContent: true,
      webviewTag: true, // 启用 webview 标签支持
      sandbox: isDev ? false : true, // 开发模式下禁用沙盒
    },
  });

  // 加载应用
  const url = isDev
    ? "http://localhost:3000"
    : `file://${path.join(__dirname, "../out/index.html")}`;

  console.log(`加载 URL: ${url} (开发模式: ${isDev})`);

  mainWindow.loadURL(url).catch((err) => {
    console.error("加载 URL 失败:", err);
    if (isDev) {
      console.error("请确保 Next.js 开发服务器正在运行 (npm run dev)");
    }
  });

  // 开发模式下打开开发者工具
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // 监听加载失败
  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription) => {
    console.error(`页面加载失败: ${errorCode} - ${errorDescription}`);
    if (isDev && errorCode === -102) {
      // ERR_CONNECTION_REFUSED
      console.error("无法连接到 Next.js 开发服务器。请确保运行了 'npm run dev'");
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // 设置会话权限，允许 DrawIO iframe 加载
  const { session } = mainWindow.webContents;

  // 允许所有来源的请求（开发模式）
  if (isDev) {
    session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; " +
            "script-src * 'unsafe-inline' 'unsafe-eval'; " +
            "connect-src * 'unsafe-inline'; " +
            "img-src * data: blob: 'unsafe-inline'; " +
            "frame-src *; " +
            "style-src * 'unsafe-inline';"
          ]
        }
      });
    });
  }

  // 监听控制台日志，帮助调试
  mainWindow.webContents.on("console-message", (event, level, message, _line, _sourceId) => {
    console.log(`[Renderer Console] ${message}`);
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC 处理：选择文件夹
ipcMain.handle("select-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// IPC 处理：保存图表到文件
ipcMain.handle("save-diagram", async (event, xml, defaultPath) => {
  try {
    let savePath = defaultPath;

    // 如果没有默认路径，让用户选择
    if (!savePath) {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: "保存 DrawIO 图表",
        defaultPath: "diagram.drawio",
        filters: [
          { name: "DrawIO Files", extensions: ["drawio"] },
          { name: "All Files", extensions: ["*"] },
        ],
      });

      if (result.canceled) {
        return { success: false, message: "用户取消保存" };
      }

      savePath = result.filePath;
    } else {
      // 使用默认路径，生成文件名
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName = `diagram_${timestamp}.drawio`;
      savePath = path.join(savePath, fileName);
    }

    // 写入文件
    fs.writeFileSync(savePath, xml, "utf-8");

    return {
      success: true,
      message: "保存成功",
      filePath: savePath,
    };
  } catch (error) {
    console.error("保存文件错误:", error);
    return {
      success: false,
      message: error.message,
    };
  }
});

// IPC 处理：加载图表文件
ipcMain.handle("load-diagram", async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "打开 DrawIO 图表",
      filters: [
        { name: "DrawIO Files", extensions: ["drawio"] },
        { name: "All Files", extensions: ["*"] },
      ],
      properties: ["openFile"],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, message: "用户取消打开" };
    }

    const filePath = result.filePaths[0];
    const xml = fs.readFileSync(filePath, "utf-8");

    return {
      success: true,
      xml,
      filePath,
    };
  } catch (error) {
    console.error("加载文件错误:", error);
    return {
      success: false,
      message: error.message,
    };
  }
});

// IPC 处理：打开外部链接
ipcMain.handle("open-external", async (event, url) => {
  await shell.openExternal(url);
});

// IPC 处理：通用保存对话框
ipcMain.handle("show-save-dialog", async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  if (!result.canceled && result.filePath) {
    return result.filePath;
  }
  return null;
});

// IPC 处理：通用打开对话框
ipcMain.handle("show-open-dialog", async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths;
  }
  return null;
});

// IPC 处理：写入文件
ipcMain.handle("write-file", async (event, filePath, data) => {
  try {
    fs.writeFileSync(filePath, data, "utf-8");
    return { success: true };
  } catch (error) {
    console.error("写入文件错误:", error);
    return { success: false, error: error.message };
  }
});

// IPC 处理：读取文件
ipcMain.handle("read-file", async (event, filePath) => {
  try {
    const data = fs.readFileSync(filePath, "utf-8");
    return data;
  } catch (error) {
    console.error("读取文件错误:", error);
    throw error;
  }
});

// IPC 处理：启用 DrawIO 选区监听
ipcMain.handle("enable-selection-watcher", async () => {
  if (!mainWindow) {
    return { success: false, message: "窗口尚未就绪" };
  }

  try {
    const mainFrame = mainWindow.webContents?.mainFrame;
    const drawioFrame = mainFrame?.frames?.find((frame) =>
      frame.url?.includes("embed.diagrams.net")
    );

    if (!drawioFrame) {
      return { success: false, message: "未找到 DrawIO 编辑器 iframe" };
    }

    const injectionResult = await drawioFrame.executeJavaScript(
      `(() => {
        if (window.__drawioSelectionWatcherPromise) {
          return window.__drawioSelectionWatcherPromise;
        }

        window.__drawioSelectionWatcherPromise = new Promise((resolve, reject) => {
          const MAX_ATTEMPTS = 50;
          let attempts = 0;

          const notify = (graph) => {
            try {
              const cells = graph.getSelectionCells();
              let count = 0;

              if (Array.isArray(cells)) {
                count = cells.filter(Boolean).length;
              } else if (cells) {
                count = 1;
              }

              window.parent?.postMessage(
                JSON.stringify({ event: "drawio-selection", count }),
                "*"
              );
            } catch (error) {
              console.error("DrawIO selection notify error", error);
            }
          };

          const install = () => {
            attempts += 1;

            if (window.Draw && typeof window.Draw.loadPlugin === "function") {
              try {
                window.Draw.loadPlugin((ui) => {
                  try {
                    const graph = ui?.editor?.graph;

                    if (!graph) {
                      resolve({ success: false, message: "Graph 未准备好" });
                      return;
                    }

                    if (graph.__selectionWatcherInstalled) {
                      resolve({ success: true, message: "already" });
                      notify(graph);
                      return;
                    }

                    graph.__selectionWatcherInstalled = true;

                    const selectionModel = graph.getSelectionModel?.();

                    if (selectionModel?.addListener) {
                      selectionModel.addListener("change", () => notify(graph));
                    }

                    if (ui?.editor?.addListener) {
                      ui.editor.addListener("selectionChanged", () => notify(graph));
                    }

                    notify(graph);
                    resolve({ success: true });
                  } catch (pluginError) {
                    reject(pluginError);
                  }
                });
              } catch (loadError) {
                reject(loadError);
              }
              return;
            }

            if (attempts >= MAX_ATTEMPTS) {
              reject(new Error("Draw.loadPlugin 未在预期时间内就绪"));
              return;
            }

            setTimeout(install, 200);
          };

          install();
        });

        return window.__drawioSelectionWatcherPromise;
      })()`
    );

    if (injectionResult?.success) {
      return { success: true };
    }

    return {
      success: false,
      message: injectionResult?.message || "注入结果未知",
    };
  } catch (error) {
    console.error("启用 DrawIO 选区监听失败:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "执行脚本失败",
    };
  }
});
