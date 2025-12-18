# Milestone 5: 清理前端旧代码

## 目标

删除所有前端 Socket.IO 相关的代码文件。

## 前置条件

- 里程碑 4 已完成（页面已切换到新 Hook，旧 Hook 无引用）

## 删除文件

| 文件                           | 行数 | 说明                   |
| ------------------------------ | ---- | ---------------------- |
| `app/hooks/useDrawioSocket.ts` | 642  | Socket.IO 客户端 Hook  |
| `app/types/socket-protocol.ts` | ~100 | Socket.IO 协议类型定义 |

## 删除 API 路由

| 文件                           | 说明                               |
| ------------------------------ | ---------------------------------- |
| `app/api/chat/cancel/route.ts` | 取消聊天 API（新架构用 `stop()`）  |
| `app/api/chat/unload/route.ts` | 卸载清理 API（不再需要服务端清理） |

## 清理引用检查

执行以下搜索，确保无残留引用：

```bash
# 搜索 Socket.IO 相关引用
grep -r "useDrawioSocket" app/
grep -r "socket-protocol" app/
grep -r "socketConnected" app/
grep -r "socket.io" app/
```

## 移除前端依赖

从 `package.json` 中移除：

```bash
pnpm remove socket.io-client
```

## 验收标准

- [ ] `useDrawioSocket.ts` 已删除
- [ ] `socket-protocol.ts` 已删除
- [ ] `app/api/chat/cancel/route.ts` 已删除
- [ ] `app/api/chat/unload/route.ts` 已删除
- [ ] `socket.io-client` 依赖已移除
- [ ] 代码中无 Socket.IO 客户端相关引用
- [ ] `pnpm build` 构建成功
