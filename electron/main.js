const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const { safeStorage } = require("electron");
const { randomUUID } = require("crypto");
const path = require("path");
const fs = require("fs");
const https = require("https");
const { fork } = require("child_process");
const net = require("net");
const SQLiteManager = require("./storage/sqlite-manager");
const mcpServer = require("./mcp/mcp-server");
const { getRandomAvailablePort } = require("./mcp/mcp-port-utils");
const { toErrorString } = require("./utils/to-error-string");

let mainWindow;
let storageManager = null;
let serverProcess = null; // 内嵌服务器子进程
let serverPort = 3000; // 服务器端口
let updateCheckTimeoutId = null;
let updateCheckIntervalId = null;
// 更可靠的开发模式检测：检查是否打包或者环境变量
const isDev = !app.isPackaged || process.env.NODE_ENV === "development";

let serverShutdownPromise = null;
let appQuitInProgress = false;

const cleanupUpdateTimers = () => {
  if (updateCheckTimeoutId) {
    clearTimeout(updateCheckTimeoutId);
    updateCheckTimeoutId = null;
  }
  if (updateCheckIntervalId) {
    clearInterval(updateCheckIntervalId);
    updateCheckIntervalId = null;
  }
};

async function gracefulServerShutdown(trigger) {
  if (isDev) return;
  if (!serverProcess) return;
  if (serverShutdownPromise) return serverShutdownPromise;

  const proc = serverProcess;

  serverShutdownPromise = (async () => {
    if (proc.exitCode != null) {
      console.log(
        `[Electron] 内嵌服务器已退出（exitCode=${proc.exitCode}），跳过关闭（触发: ${trigger}）`,
      );
      return;
    }

    console.log(`[Electron] 正在关闭内嵌服务器（触发: ${trigger}）...`);

    let exited = false;
    let onExit = null;
    const exitPromise = new Promise((resolve) => {
      onExit = (code, signal) => {
        exited = true;
        resolve({ code, signal });
      };
      proc.once("exit", onExit);
    });

    try {
      proc.kill("SIGTERM");
    } catch (error) {
      console.warn("[Electron] 发送 SIGTERM 失败，继续退出流程：", error);
      if (onExit) proc.removeListener("exit", onExit);
      return;
    }

    const forceKillTimeout = setTimeout(() => {
      if (exited) return;
      try {
        console.warn("[Electron] 服务器 5 秒未退出，发送 SIGKILL 强制结束...");
        proc.kill("SIGKILL");
      } catch (error) {
        console.warn("[Electron] 发送 SIGKILL 失败：", error);
      }
    }, 5000);
    forceKillTimeout.unref();

    let waitExitTimeout = null;
    const waitExitPromise = new Promise((resolve) => {
      waitExitTimeout = setTimeout(() => resolve({ timedOut: true }), 6500);
      waitExitTimeout.unref();
    });

    const result = await Promise.race([exitPromise, waitExitPromise]);

    clearTimeout(forceKillTimeout);
    if (waitExitTimeout) clearTimeout(waitExitTimeout);

    if (result && result.timedOut) {
      console.warn(
        "[Electron] 等待服务器退出超时（6.5 秒），继续退出流程（可能仍有残留进程）",
      );
      if (onExit) proc.removeListener("exit", onExit);
      return;
    }

    const { code, signal } = result || {};
    console.log(
      `[Electron] 内嵌服务器已退出（code=${code}, signal=${signal}）`,
    );
  })().finally(() => {
    serverShutdownPromise = null;
  });

  return serverShutdownPromise;
}

async function gracefulAppShutdown(trigger) {
  await gracefulServerShutdown(trigger);

  // 关闭 MCP 服务器
  try {
    await mcpServer.stop();
    console.log("[Electron] MCP 服务器已关闭");
  } catch (error) {
    console.error("[Electron] 关闭 MCP 服务器失败：", error);
  }

  if (storageManager) {
    try {
      storageManager.close();
      storageManager = null;
      console.log("[Electron] 数据库已关闭");
    } catch (error) {
      console.error("[Electron] 关闭数据库失败：", error);
    }
  }

  cleanupUpdateTimers();
}

/**
 * 将二进制字段统一转换为 Buffer，避免 SQLite 写入失败
 * @param payload 包含 preview_image / preview_svg / pages_svg 的对象
 */
function convertBlobFields(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const normalized = { ...payload };
  if (normalized.preview_image) {
    normalized.preview_image = Buffer.from(normalized.preview_image);
  }
  if (normalized.preview_svg) {
    normalized.preview_svg = Buffer.from(normalized.preview_svg);
  }
  if (normalized.pages_svg) {
    normalized.pages_svg = Buffer.from(normalized.pages_svg);
  }
  return normalized;
}

function resolveUserDataPathSafe(relativePath) {
  const userDataPath = app.getPath("userData");
  const base = path.resolve(userDataPath);
  const baseWithSep = base.endsWith(path.sep) ? base : `${base}${path.sep}`;

  const target = path.resolve(base, relativePath);
  if (!target.startsWith(baseWithSep)) {
    throw new Error("非法文件路径：仅允许访问 userData 目录下的文件");
  }
  return target;
}

/**
 * 查找可用端口（避免端口冲突）
 * @param {number} startPort 起始端口
 * @returns {Promise<number>} 可用端口
 */
function findAvailablePort(startPort = 3000) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        resolve(findAvailablePort(startPort + 1));
      } else {
        reject(err);
      }
    });
    server.listen(startPort, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

/**
 * 启动内嵌的 Next.js HTTP 服务器
 * @returns {Promise<number>} 服务器端口
 */
async function startEmbeddedServer() {
  if (isDev) {
    // 开发模式：假设外部已启动服务器
    console.log("[Electron] 开发模式，使用外部服务器 http://localhost:3000");
    return 3000;
  }

  // 生产模式：启动内嵌服务器
  const port = await findAvailablePort(3000);

  // 确定 server.js 和工作目录路径
  // asarUnpack 会将 server.js 和 .next 解压到 app.asar.unpacked 目录
  const serverPath = app.isPackaged
    ? path
        .join(__dirname, "../server.js")
        .replace("app.asar", "app.asar.unpacked")
    : path.join(__dirname, "../server.js");

  const serverCwd = app.isPackaged
    ? path.join(__dirname, "..").replace("app.asar", "app.asar.unpacked")
    : path.join(__dirname, "..");

  // node_modules 在 app.asar 中，需要设置 NODE_PATH 让子进程能找到
  const asarNodeModules = app.isPackaged
    ? path.join(__dirname, "../node_modules")
    : null;

  console.log(`[Electron] 启动内嵌服务器: ${serverPath} on port ${port}`);
  console.log(`[Electron] 服务器工作目录: ${serverCwd}`);
  if (asarNodeModules) {
    console.log(`[Electron] NODE_PATH: ${asarNodeModules}`);
  }

  return new Promise((resolve, reject) => {
    // 设置环境变量
    const env = {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      // 设置 NODE_PATH 让 server.js 能找到 app.asar 中的 node_modules
      ...(asarNodeModules && { NODE_PATH: asarNodeModules }),
    };

    // 使用 fork 启动服务器（共享 Electron 的 Node.js 运行时）
    serverProcess = fork(serverPath, [], {
      env,
      cwd: serverCwd,
      stdio: ["pipe", "pipe", "pipe", "ipc"],
    });

    let resolved = false;

    // 监听服务器输出
    serverProcess.stdout.on("data", (data) => {
      const message = data.toString();
      console.log(`[Server] ${message.trim()}`);

      // 检测服务器是否已启动
      if (!resolved && message.includes("Ready on")) {
        resolved = true;
        console.log(`[Electron] 服务器已就绪，端口: ${port}`);
        resolve(port);
      }
    });

    serverProcess.stderr.on("data", (data) => {
      console.error(`[Server Error] ${data.toString().trim()}`);
    });

    serverProcess.on("error", (err) => {
      console.error("[Electron] 服务器启动失败:", err);
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    serverProcess.on("exit", (code, signal) => {
      console.log(`[Electron] 服务器进程退出，code=${code}, signal=${signal}`);
      serverProcess = null;
    });

    // 超时检测（30秒）
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error("服务器启动超时（30秒）"));
      }
    }, 30000);
  });
}

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

  // 加载应用（统一使用 HTTP URL）
  const url = `http://localhost:${serverPort}`;

  console.log(`加载 URL: ${url} (开发模式: ${isDev})`);

  mainWindow.loadURL(url).catch((err) => {
    console.error("加载 URL 失败:", err);
    if (isDev) {
      console.error("请确保 Next.js 开发服务器正在运行 (npm run dev)");
    } else {
      console.error("内嵌服务器可能未正常启动");
    }
  });

  // 开发模式下打开开发者工具
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // 监听加载失败
  mainWindow.webContents.on(
    "did-fail-load",
    (event, errorCode, errorDescription) => {
      console.error(`页面加载失败: ${errorCode} - ${errorDescription}`);
      if (isDev && errorCode === -102) {
        // ERR_CONNECTION_REFUSED
        console.error(
          "无法连接到 Next.js 开发服务器。请确保运行了 'npm run dev'",
        );
      }
    },
  );

  mainWindow.on("close", (event) => {
    // 如果退出流程已经在进行中，直接返回不阻止
    if (appQuitInProgress) {
      return;
    }

    console.log("[Electron] close 事件：窗口即将关闭，开始优雅退出流程");

    // 阻止窗口立即关闭
    event.preventDefault();

    // 标记退出流程开始
    appQuitInProgress = true;

    // 通知渲染进程开始清理
    notifyBackendCleanup("started");

    // 设置强制退出超时（7 秒）
    const forceExitTimeout = setTimeout(() => {
      console.error("[Electron] 退出流程超过 7 秒，强制退出");
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.destroy();
      }
      app.exit(1);
    }, 7000);
    forceExitTimeout.unref();

    // 执行清理流程
    gracefulAppShutdown("close-button")
      .catch((error) => {
        console.error("[Electron] 退出流程异常：", error);
        notifyBackendCleanup("failed");
      })
      .finally(() => {
        clearTimeout(forceExitTimeout);
        console.log("[Electron] 退出流程完成，销毁窗口并退出应用");
        notifyBackendCleanup("completed");

        // 销毁窗口并退出应用
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.destroy();
        }
        app.quit();
      });
  });

  mainWindow.on("closed", () => {
    mainWindow = null;

    // 清理更新检查定时器（防止窗口销毁后继续发送 IPC）
    if (updateCheckTimeoutId) {
      clearTimeout(updateCheckTimeoutId);
      updateCheckTimeoutId = null;
    }
    if (updateCheckIntervalId) {
      clearInterval(updateCheckIntervalId);
      updateCheckIntervalId = null;
    }
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
              "style-src * 'unsafe-inline';",
          ],
        },
      });
    });
  }

  // 监听控制台日志，帮助调试
  mainWindow.webContents.on(
    "console-message",
    (event, level, message, _line, _sourceId) => {
      console.log(`[Renderer Console] ${message}`);
    },
  );

  // 自动检查更新：窗口加载完成后启动（避免影响启动体验）
  mainWindow.webContents.once("did-finish-load", () => {
    scheduleAutoUpdateChecks();
  });
}

/**
 * 初始化 MCP 工具执行桥接
 * 通过 IPC 将工具调用转发到渲染进程执行
 */
function initMcpToolBridge() {
  mcpServer.setToolExecutor(async (toolName, args) => {
    return new Promise((resolve, reject) => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        reject(new Error("Main window not available"));
        return;
      }

      const requestId = randomUUID();
      const timeout = setTimeout(() => {
        ipcMain.removeAllListeners(`mcp-tool-response-${requestId}`);
        reject(new Error("Tool execution timeout (30s)"));
      }, 30000);

      ipcMain.once(`mcp-tool-response-${requestId}`, (_event, result) => {
        clearTimeout(timeout);
        if (result.success) {
          resolve(result.data);
        } else {
          reject(new Error(result.error || "Tool execution failed"));
        }
      });

      mainWindow.webContents.send("mcp-tool-request", {
        requestId,
        toolName,
        args,
      });
    });
  });
}

app.whenReady().then(async () => {
  try {
    try {
      const available =
        safeStorage &&
        typeof safeStorage.isEncryptionAvailable === "function" &&
        safeStorage.isEncryptionAvailable();
      console.log(
        `[Electron] safeStorage 加密可用: ${available ? "是" : "否"}`,
      );
    } catch (error) {
      console.warn("[Electron] safeStorage 可用性检测失败：", error);
    }

    // 初始化存储
    storageManager = new SQLiteManager();
    storageManager.initialize();

    // 启动内嵌服务器（生产模式）
    serverPort = await startEmbeddedServer();
    console.log(`[Electron] 服务器端口: ${serverPort}`);

    // 创建窗口
    createWindow();

    // 初始化 MCP 工具桥接
    initMcpToolBridge();
  } catch (error) {
    console.error("[Electron] 启动失败:", error);
    dialog.showErrorBox(
      "启动失败",
      `无法启动应用服务器: ${toErrorString(error)}`,
    );
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    gracefulServerShutdown("window-all-closed").catch((error) => {
      console.warn("[Electron] window-all-closed：关闭内嵌服务器失败：", error);
    });
    app.quit();
  }
});

/**
 * 通知渲染进程后端清理状态
 * @param {"started" | "completed" | "failed"} status
 */
function notifyBackendCleanup(status) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  try {
    mainWindow.webContents.send("backend:cleanup", { status });
  } catch (error) {
    console.error("[Electron] 发送 backend:cleanup 失败:", error);
  }
}

app.on("before-quit", (event) => {
  if (appQuitInProgress) return;
  appQuitInProgress = true;

  event.preventDefault();

  console.log(
    "[Electron] before-quit：开始退出流程（优雅关闭服务器 → 关闭数据库）",
  );

  // 通知渲染进程开始清理
  notifyBackendCleanup("started");

  const forceExitTimeout = setTimeout(() => {
    console.error("[Electron] 退出流程超过 7 秒，强制退出（exit=1）");
    app.exit(1);
  }, 7000);
  forceExitTimeout.unref();

  gracefulAppShutdown("before-quit")
    .catch((error) => {
      console.error("[Electron] 退出流程异常：", error);
      notifyBackendCleanup("failed");
    })
    .finally(() => {
      clearTimeout(forceExitTimeout);
      console.log("[Electron] 退出流程完成");
      notifyBackendCleanup("completed");
      app.exit(0);
    });
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
      message: toErrorString(error),
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
      message: toErrorString(error),
    };
  }
});

// IPC 处理：打开外部链接
ipcMain.handle("open-external", async (event, url) => {
  await shell.openExternal(url);
});

// ==================== Update Check (GitHub Releases) ====================

function normalizeVersion(rawVersion) {
  if (typeof rawVersion !== "string") return "";
  return rawVersion.trim().replace(/^[vV]/, "");
}

function parseSemver(rawVersion) {
  const normalized = normalizeVersion(rawVersion);
  const [versionCore, versionPreRelease = ""] = normalized.split("-", 2);
  const [majorRaw = "0", minorRaw = "0", patchRaw = "0"] =
    versionCore.split(".");

  const major = Number.parseInt(majorRaw, 10) || 0;
  const minor = Number.parseInt(minorRaw, 10) || 0;
  const patch = Number.parseInt(patchRaw, 10) || 0;

  const preRelease = versionPreRelease
    ? versionPreRelease.split(".").filter(Boolean)
    : [];

  return { major, minor, patch, preRelease };
}

function compareNumbers(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function isNumericIdentifier(identifier) {
  return /^\d+$/.test(identifier);
}

function comparePreReleaseIdentifiers(a, b) {
  if (a === b) return 0;

  const aIsNum = isNumericIdentifier(a);
  const bIsNum = isNumericIdentifier(b);

  if (aIsNum && bIsNum) {
    return compareNumbers(Number.parseInt(a, 10), Number.parseInt(b, 10));
  }

  // 数字标识符优先级低于非数字
  if (aIsNum && !bIsNum) return -1;
  if (!aIsNum && bIsNum) return 1;

  return a < b ? -1 : 1;
}

function comparePreRelease(preA, preB) {
  const aHasPre = preA.length > 0;
  const bHasPre = preB.length > 0;

  // 无 pre-release 的版本优先级更高
  if (!aHasPre && !bHasPre) return 0;
  if (!aHasPre && bHasPre) return 1;
  if (aHasPre && !bHasPre) return -1;

  const maxLen = Math.max(preA.length, preB.length);
  for (let i = 0; i < maxLen; i += 1) {
    const ida = preA[i];
    const idb = preB[i];

    if (ida === undefined) return -1;
    if (idb === undefined) return 1;

    const cmp = comparePreReleaseIdentifiers(ida, idb);
    if (cmp !== 0) return cmp;
  }

  return 0;
}

/**
 * 比较两个 semver 版本号
 * @returns {-1 | 0 | 1} a < b 返回 -1，a > b 返回 1
 */
function compareSemver(a, b) {
  const va = parseSemver(a);
  const vb = parseSemver(b);

  const majorCmp = compareNumbers(va.major, vb.major);
  if (majorCmp !== 0) return majorCmp;

  const minorCmp = compareNumbers(va.minor, vb.minor);
  if (minorCmp !== 0) return minorCmp;

  const patchCmp = compareNumbers(va.patch, vb.patch);
  if (patchCmp !== 0) return patchCmp;

  return comparePreRelease(va.preRelease, vb.preRelease);
}

function fetchGitHubLatestRelease() {
  const currentVersion = normalizeVersion(app.getVersion());
  const requestOptions = {
    hostname: "api.github.com",
    path: "/repos/Menghuan1918/drawio2go/releases/latest",
    method: "GET",
    headers: {
      "User-Agent": `DrawIO2Go/${currentVersion || "0.0.0"} (Electron)`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  };

  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const req = https.request(requestOptions, (res) => {
      let raw = "";

      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        raw += chunk;
      });

      res.on("end", () => {
        if (res.statusCode !== 200) {
          console.error(
            `[Update] GitHub API 返回非 200：${res.statusCode} ${res.statusMessage || ""}`.trim(),
          );
          settle(null);
          return;
        }

        try {
          const json = JSON.parse(raw);
          const tagName = json?.tag_name;
          const htmlUrl = json?.html_url;
          const releaseNotes = json?.body;

          if (typeof tagName !== "string" || typeof htmlUrl !== "string") {
            console.error("[Update] GitHub Release 响应缺少必要字段");
            settle(null);
            return;
          }

          settle({ tagName, htmlUrl, releaseNotes });
        } catch (error) {
          console.error("[Update] 解析 GitHub Release JSON 失败:", error);
          settle(null);
        }
      });
    });

    req.on("error", (error) => {
      console.error("[Update] GitHub Release 请求失败:", error);
      settle(null);
    });

    // 超时：静默失败（记录日志）
    req.setTimeout(8000, () => {
      console.error("[Update] GitHub Release 请求超时（8s）");
      req.destroy(new Error("timeout"));
      settle(null);
    });

    req.end();
  });
}

/**
 * @returns {Promise<null | { hasUpdate: boolean, currentVersion: string, latestVersion: string, releaseUrl: string, releaseNotes?: string }>}
 */
async function checkForUpdates() {
  const currentVersion = normalizeVersion(app.getVersion());
  const release = await fetchGitHubLatestRelease();
  if (!release) return null;

  const latestVersion = normalizeVersion(release.tagName);
  if (!latestVersion) {
    console.error("[Update] 最新 Release tag_name 无效");
    return null;
  }

  const hasUpdate = compareSemver(currentVersion, latestVersion) < 0;
  return {
    hasUpdate,
    currentVersion,
    latestVersion,
    releaseUrl: release.htmlUrl,
    releaseNotes:
      typeof release.releaseNotes === "string" && release.releaseNotes.trim()
        ? release.releaseNotes
        : undefined,
  };
}

async function runUpdateCheckAndNotify() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const result = await checkForUpdates();
  if (!result) return;

  try {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send("update:available", result);
  } catch (error) {
    console.error("[Update] 发送 update:available 失败:", error);
  }
}

function scheduleAutoUpdateChecks() {
  // 防止多次注册（例如 macOS 激活重新创建窗口）
  if (updateCheckTimeoutId) {
    clearTimeout(updateCheckTimeoutId);
    updateCheckTimeoutId = null;
  }
  if (updateCheckIntervalId) {
    clearInterval(updateCheckIntervalId);
    updateCheckIntervalId = null;
  }

  // 首次检查延迟 5 秒（避免影响启动体验）
  updateCheckTimeoutId = setTimeout(() => {
    updateCheckTimeoutId = null;
    runUpdateCheckAndNotify();
  }, 5000);

  // 每小时检查一次
  updateCheckIntervalId = setInterval(() => {
    runUpdateCheckAndNotify();
  }, 3600000);
}

ipcMain.handle("update:check", async () => {
  return checkForUpdates();
});

ipcMain.handle("update:openReleasePage", async (_event, url) => {
  if (typeof url !== "string" || !url.trim()) {
    throw new Error("无效的 Release URL");
  }
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
    return { success: false, error: toErrorString(error) };
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

// IPC 处理：读取 userData 目录下的二进制文件（用于附件 file_path → ArrayBuffer）
ipcMain.handle("fs:readFile", async (_event, relativePath) => {
  try {
    if (typeof relativePath !== "string" || !relativePath.trim()) {
      throw new Error("无效的文件路径");
    }

    const absPath = resolveUserDataPathSafe(relativePath);
    const data = fs.readFileSync(absPath);
    return data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    );
  } catch (error) {
    console.error("读取二进制文件错误:", error);
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
      frame.url?.includes("embed.diagrams.net"),
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
              const cellInfos = [];

              if (Array.isArray(cells)) {
                cells.forEach(cell => {
                  if (cell && cell.id) {
                    cellInfos.push({
                      id: cell.id,
                      type: cell.vertex ? 'vertex' : (cell.edge ? 'edge' : 'unknown'),
                      value: cell.value,
                      style: cell.style,
                      label: cell.value ? cell.value.toString() : '',
                      geometry: cell.geometry ? {
                        x: cell.geometry.x,
                        y: cell.geometry.y,
                        width: cell.geometry.width,
                        height: cell.geometry.height
                      } : undefined
                    });
                  }
                });
              }

              window.parent?.postMessage(
                JSON.stringify({
                  event: "drawio-selection",
                  count: cellInfos.length,
                  cells: cellInfos
                }),
                "*"
              );
            } catch (error) {
              console.error("DrawIO selection notify error", error);
              // 降级处理：发送原始的 count 格式
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
              } catch (fallbackError) {
                console.error("DrawIO selection fallback error", fallbackError);
              }
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
      })()`,
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
      message: toErrorString(error) || "执行脚本失败",
    };
  }
});

// ==================== Storage IPC Handlers ====================

// 初始化
ipcMain.handle("storage:initialize", async () => {
  // 已在 app.whenReady() 中初始化
  return;
});

// Settings
ipcMain.handle("storage:getSetting", async (event, key) => {
  return storageManager.getSetting(key);
});

ipcMain.handle("storage:setSetting", async (event, key, value) => {
  return storageManager.setSetting(key, value);
});

ipcMain.handle("storage:deleteSetting", async (event, key) => {
  return storageManager.deleteSetting(key);
});

ipcMain.handle("storage:getAllSettings", async () => {
  return storageManager.getAllSettings();
});

// Projects
ipcMain.handle("storage:getProject", async (event, uuid) => {
  return storageManager.getProject(uuid);
});

ipcMain.handle("storage:createProject", async (event, project) => {
  return storageManager.createProject(project);
});

ipcMain.handle("storage:updateProject", async (event, uuid, updates) => {
  return storageManager.updateProject(uuid, updates);
});

ipcMain.handle("storage:deleteProject", async (event, uuid) => {
  return storageManager.deleteProject(uuid);
});

ipcMain.handle("storage:getAllProjects", async () => {
  return storageManager.getAllProjects();
});

// XMLVersions
ipcMain.handle("storage:getXMLVersion", async (event, id, projectUuid) => {
  return storageManager.getXMLVersion(id, projectUuid);
});

ipcMain.handle("storage:createXMLVersion", async (event, version) => {
  const normalized = convertBlobFields(version);
  return storageManager.createXMLVersion(normalized);
});

ipcMain.handle(
  "storage:getXMLVersionsByProject",
  async (event, projectUuid) => {
    return storageManager.getXMLVersionsByProject(projectUuid);
  },
);

ipcMain.handle(
  "storage:getXMLVersionSVGData",
  async (event, id, projectUuid) => {
    return storageManager.getXMLVersionSVGData(id, projectUuid);
  },
);

ipcMain.handle("storage:updateXMLVersion", async (event, id, updates) => {
  const normalizedUpdates = convertBlobFields(updates ?? {});
  return storageManager.updateXMLVersion(id, normalizedUpdates);
});

ipcMain.handle("storage:deleteXMLVersion", async (event, id, projectUuid) => {
  return storageManager.deleteXMLVersion(id, projectUuid);
});

// Conversations
ipcMain.handle("storage:getConversation", async (event, id) => {
  return storageManager.getConversation(id);
});

ipcMain.handle("storage:createConversation", async (event, conversation) => {
  return storageManager.createConversation(conversation);
});

ipcMain.handle("storage:updateConversation", async (event, id, updates) => {
  return storageManager.updateConversation(id, updates);
});

ipcMain.handle(
  "storage:setConversationStreaming",
  async (event, id, isStreaming) => {
    return storageManager.setConversationStreaming(id, isStreaming);
  },
);

ipcMain.handle("storage:deleteConversation", async (event, id) => {
  return storageManager.deleteConversation(id);
});

ipcMain.handle("storage:batchDeleteConversations", async (_event, ids) => {
  return storageManager.batchDeleteConversations(ids);
});

ipcMain.handle("storage:exportConversations", async (_event, ids) => {
  return storageManager.exportConversations(ids);
});

ipcMain.handle(
  "storage:getConversationsByProject",
  async (event, projectUuid) => {
    return storageManager.getConversationsByProject(projectUuid);
  },
);

// Messages
ipcMain.handle(
  "storage:getMessagesByConversation",
  async (event, conversationId) => {
    return storageManager.getMessagesByConversation(conversationId);
  },
);

ipcMain.handle("storage:createMessage", async (event, message) => {
  return storageManager.createMessage(message);
});

ipcMain.handle("storage:deleteMessage", async (event, id) => {
  return storageManager.deleteMessage(id);
});

ipcMain.handle("storage:createMessages", async (event, messages) => {
  return storageManager.createMessages(messages);
});

// Attachments
ipcMain.handle("storage:getAttachment", async (_event, id) => {
  return storageManager.getAttachment(id);
});

ipcMain.handle("storage:createAttachment", async (_event, attachment) => {
  return storageManager.createAttachment(attachment);
});

ipcMain.handle("storage:deleteAttachment", async (_event, id) => {
  return storageManager.deleteAttachment(id);
});

ipcMain.handle("storage:getAttachmentsByMessage", async (_event, messageId) => {
  return storageManager.getAttachmentsByMessage(messageId);
});

ipcMain.handle(
  "storage:getAttachmentsByConversation",
  async (_event, conversationId) => {
    return storageManager.getAttachmentsByConversation(conversationId);
  },
);

// ==================== MCP IPC Handlers ====================

// 启动 MCP 服务器
ipcMain.handle("mcp:start", async (_event, config) => {
  const { host, port } = config || {};

  if (!host || typeof host !== "string") {
    throw new Error("Invalid host");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid port");
  }

  // 检查是否已在运行
  const status = mcpServer.getStatus();
  if (status.running) {
    throw new Error("MCP server is already running");
  }

  await mcpServer.start(host, port);
  const newStatus = mcpServer.getStatus();
  return { success: true, host: newStatus.host, port: newStatus.port };
});

// 停止 MCP 服务器
ipcMain.handle("mcp:stop", async () => {
  const status = mcpServer.getStatus();
  if (!status.running) {
    return { success: true, message: "Server was not running" };
  }

  await mcpServer.stop();
  return { success: true };
});

// 查询 MCP 服务器状态
ipcMain.handle("mcp:status", async () => {
  return mcpServer.getStatus();
});

// 获取随机可用端口
ipcMain.handle("mcp:getRandomPort", async () => {
  return getRandomAvailablePort(8000, 9000);
});
