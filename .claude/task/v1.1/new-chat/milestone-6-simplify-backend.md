# Milestone 6: 简化后端

## 目标

移除后端所有 Socket.IO 代码，将 `server.js` 简化为纯 HTTP 服务器。

## 前置条件

- 里程碑 5 已完成（前端已无 Socket.IO 依赖）

## 修改文件

### server.js (266 行 → ~20 行)

#### 移除内容

1. Socket.IO 服务器初始化
2. `pendingRequests` Map
3. `projectMembers` Map
4. `socketJoinedProjects` Map
5. 所有 Socket 事件处理器：
   - `connection`
   - `join_project`
   - `leave_project`
   - `tool:result`
   - `disconnect`
6. `emitToolExecute` 函数导出
7. `resolvePendingRequest` 函数导出

#### 保留内容

1. Next.js 应用初始化
2. HTTP 服务器创建
3. 请求处理器 (`handle`)
4. 端口监听

#### 目标代码结构

```javascript
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = process.env.PORT || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer(async (req, res) => {
    const parsedUrl = parse(req.url, true);
    await handle(req, res, parsedUrl);
  }).listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
```

## 删除文件

| 文件                       | 说明           |
| -------------------------- | -------------- |
| `app/lib/tool-executor.ts` | 后端工具执行器 |

## 移除后端依赖

```bash
pnpm remove socket.io
```

## 清理引用检查

```bash
# 确保后端无 Socket.IO 残留
grep -r "socket.io" server.js
grep -r "emitToolExecute" app/
grep -r "resolvePendingRequest" app/
grep -r "tool-executor" app/
```

## 验收标准

- [ ] `server.js` 只包含纯 HTTP 服务器逻辑（~20 行）
- [ ] `app/lib/tool-executor.ts` 已删除
- [ ] `socket.io` 依赖已移除
- [ ] `pnpm dev` 正常启动
- [ ] `pnpm build && pnpm start` 正常运行
- [ ] 无 Socket.IO 相关代码残留
