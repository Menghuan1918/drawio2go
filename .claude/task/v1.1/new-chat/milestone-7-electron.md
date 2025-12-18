# Milestone 7: 更新 Electron

## 目标

简化 Electron 主进程，移除 Socket.IO 相关代码，保留内嵌服务器能力。

## 前置条件

- 里程碑 6 已完成（`server.js` 已简化为纯 HTTP 服务器）

## 修改文件

- `electron/main.js`

## 移除内容

1. Socket.IO 相关的服务器启动参数
2. Socket 连接状态检查
3. 任何 Socket.IO 相关的 IPC handler

## 保留内容

1. Next.js 服务器 fork 逻辑（生产环境）
2. 开发环境连接外部服务器的逻辑
3. 所有存储相关的 IPC handler
4. 文件操作 IPC handler
5. 更新检查功能
6. DrawIO 选区监听

## 验证场景

| 环境     | 预期行为                                     |
| -------- | -------------------------------------------- |
| 开发环境 | Electron 连接到 `localhost:3000`（外部服务） |
| 生产环境 | Electron fork 内嵌服务器并连接               |

## 清理引用检查

```bash
grep -r "socket" electron/
grep -r "Socket" electron/
```

## 验收标准

- [ ] Electron 开发环境正常运行
- [ ] Electron 生产环境正常运行
- [ ] 聊天功能在 Electron 中正常工作
- [ ] 工具调用正常执行
- [ ] 无 Socket.IO 相关代码
- [ ] 所有 IPC 功能正常（存储、文件操作等）
