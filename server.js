const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || "localhost";
const port = parseInt(process.env.PORT, 10) || 3000;

const app = next({
  dev,
  hostname,
  port,
  turbo: dev,
});
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error occurred handling", req.url, err);
      res.statusCode = 500;
      res.end("internal server error");
    }
  });

  const allowedOrigins = (process.env.CORS_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const resolveCorsOrigin = (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.length === 0) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked: ${origin}`), false);
  };

  // 创建 Socket.IO 服务器
  const io = new Server(httpServer, {
    cors: {
      origin: dev ? "*" : resolveCorsOrigin,
      methods: ["GET", "POST"],
    },
  });

  // 存储待处理的工具调用请求
  // key: requestId, value: { resolve, reject }
  const pendingRequests = new Map();

  // 项目房间成员映射
  // projectUuid -> Set<socketId>
  const projectMembers = new Map();
  // socketId -> Set<projectUuid>
  const socketJoinedProjects = new Map();

  const getProjectMemberCount = (projectUuid) =>
    projectMembers.get(projectUuid)?.size ?? 0;

  const normalizeToolErrorPart = (value) => {
    if (value === undefined || value === null) return "";
    if (typeof value === "string") return value.trim();
    if (value instanceof Error) return (value.message || String(value)).trim();
    try {
      return JSON.stringify(value).trim();
    } catch {
      return String(value).trim();
    }
  };

  const combineToolErrorParts = (errorText, messageText) => {
    const errorPart = (errorText || "").trim();
    const messagePart = (messageText || "").trim();

    if (!errorPart && !messagePart) return "";
    if (!errorPart) return messagePart;
    if (!messagePart) return errorPart;

    if (errorPart === messagePart) return errorPart;
    const existingParts = errorPart
      .split(" | ")
      .map((part) => part.trim())
      .filter(Boolean);
    if (existingParts.includes(messagePart)) return errorPart;

    return `${errorPart} | ${messagePart}`;
  };

  const emitToolExecute = (request) => {
    const targetProject = request?.projectUuid || "(unknown-project)";
    const targetConversation =
      request?.conversationId || "(unknown-conversation)";

    const activeMembers = getProjectMemberCount(targetProject);

    if (!targetProject || targetProject === "(unknown-project)") {
      throw new Error("缺少 projectUuid，无法投递工具请求");
    }

    if (activeMembers === 0) {
      throw new Error(`目标项目没有客户端在线: ${targetProject}`);
    }

    console.log(
      `[Socket.IO] 向项目房间投递工具请求: ${request?.toolName ?? "unknown"} -> project=${targetProject}, conversation=${targetConversation}, requestId=${request?.requestId ?? "n/a"}, 在线客户端=${activeMembers}`,
    );

    io.to(targetProject).emit("tool:execute", request);
  };

  io.on("connection", (socket) => {
    console.log("[Socket.IO] 客户端已连接:", socket.id);

    const trackJoin = (projectUuid) => {
      if (!projectUuid) return;

      if (!projectMembers.has(projectUuid)) {
        projectMembers.set(projectUuid, new Set());
      }
      if (!socketJoinedProjects.has(socket.id)) {
        socketJoinedProjects.set(socket.id, new Set());
      }

      projectMembers.get(projectUuid).add(socket.id);
      socketJoinedProjects.get(socket.id).add(projectUuid);

      const memberCount = getProjectMemberCount(projectUuid);
      console.log(
        `[Socket.IO] socket ${socket.id} 已加入项目房间 ${projectUuid}，当前房间在线: ${memberCount}`,
      );
    };

    const trackLeave = (projectUuid) => {
      if (!projectUuid) return;

      const members = projectMembers.get(projectUuid);
      if (members) {
        members.delete(socket.id);
        if (members.size === 0) {
          projectMembers.delete(projectUuid);
        }
      }

      const joined = socketJoinedProjects.get(socket.id);
      if (joined) {
        joined.delete(projectUuid);
        if (joined.size === 0) {
          socketJoinedProjects.delete(socket.id);
        }
      }

      const memberCount = getProjectMemberCount(projectUuid);
      console.log(
        `[Socket.IO] socket ${socket.id} 已离开项目房间 ${projectUuid}，当前房间在线: ${memberCount}`,
      );
    };

    // 监听项目房间加入/离开
    socket.on("join_project", (projectUuid) => {
      const trimmed = typeof projectUuid === "string" ? projectUuid.trim() : "";
      if (!trimmed) {
        console.warn(
          `[Socket.IO] 收到无效的 join_project 请求，socket=${socket.id}`,
        );
        return;
      }

      socket.join(trimmed);
      trackJoin(trimmed);
    });

    socket.on("leave_project", (projectUuid) => {
      const trimmed = typeof projectUuid === "string" ? projectUuid.trim() : "";
      if (!trimmed) return;

      socket.leave(trimmed);
      trackLeave(trimmed);
    });

    // 监听工具执行结果
    socket.on("tool:result", (data) => {
      const { requestId, success, result, error } = data;

      if (dev) {
        console.log(
          `[Socket.IO] 收到工具执行结果: ${requestId}, success: ${success}`,
        );
      }

      const pending = pendingRequests.get(requestId);

      if (pending) {
        if (success) {
          pending.resolve(result);
        } else {
          const errorText = normalizeToolErrorPart(error);
          const messageValue =
            result && typeof result === "object" ? result.message : undefined;
          const messageText = normalizeToolErrorPart(messageValue);

          const combined = combineToolErrorParts(errorText, messageText);
          pending.reject(new Error(combined || "工具执行失败"));
        }
        pendingRequests.delete(requestId);
      } else {
        console.warn(`[Socket.IO] 未找到对应的请求 ID: ${requestId}`);
      }
    });

    socket.on("disconnect", () => {
      const joined = Array.from(socketJoinedProjects.get(socket.id) ?? []);
      joined.forEach((projectUuid) => {
        trackLeave(projectUuid);
      });

      console.log("[Socket.IO] 客户端已断开:", socket.id);
    });

    socket.on("error", (error) => {
      console.error("[Socket.IO] Socket 错误:", error);
    });
  });

  // 将 io 实例和 pendingRequests 挂载到全局，供 API Routes 使用
  global.io = io;
  global.pendingRequests = pendingRequests;
  global.emitToolExecute = emitToolExecute;

  httpServer.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Socket.IO server initialized`);
  });

  // 优雅关闭
  process.on("SIGTERM", () => {
    console.log("> SIGTERM received, shutting down gracefully...");
    httpServer.close(() => {
      console.log("> Server closed");
      process.exit(0);
    });
  });

  process.on("SIGINT", () => {
    console.log("> SIGINT received, shutting down gracefully...");
    httpServer.close(() => {
      console.log("> Server closed");
      process.exit(0);
    });
  });
});
