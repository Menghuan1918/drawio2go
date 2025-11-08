const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = 3000;

const app = next({ dev, hostname, port });
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

  // 创建 Socket.IO 服务器
  const io = new Server(httpServer, {
    cors: {
      origin: dev ? "*" : "http://localhost:3000",
      methods: ["GET", "POST"],
    },
  });

  // 存储待处理的工具调用请求
  // key: requestId, value: { resolve, reject }
  const pendingRequests = new Map();

  io.on("connection", (socket) => {
    console.log("[Socket.IO] 客户端已连接:", socket.id);

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
          pending.reject(new Error(error || "工具执行失败"));
        }
        pendingRequests.delete(requestId);
      } else {
        console.warn(`[Socket.IO] 未找到对应的请求 ID: ${requestId}`);
      }
    });

    socket.on("disconnect", () => {
      console.log("[Socket.IO] 客户端已断开:", socket.id);
    });

    socket.on("error", (error) => {
      console.error("[Socket.IO] Socket 错误:", error);
    });
  });

  // 将 io 实例和 pendingRequests 挂载到全局，供 API Routes 使用
  global.io = io;
  global.pendingRequests = pendingRequests;

  httpServer.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Socket.IO server initialized`);
  });
});
