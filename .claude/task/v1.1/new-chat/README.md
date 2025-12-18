# v1.1 架构简化：AI 前端化 + 移除 Socket.IO

## 目标

将 AI 相关功能全部迁移到前端，删除 Socket.IO 双向通讯，简化为纯 BFF 代理模式。

## 决策

- **API Key**：前端每次请求携带，BFF 只做转发
- **BFF 职责**：纯代理转发，不做任何业务逻辑
- **Electron**：保留内嵌服务器，保持离线能力

## 架构变化

```
【当前】                              【目标】
前端 → BFF → AI                       前端 (useChat + onToolCall)
         ↓                                  ↓
    Socket.IO ←→ 前端工具              BFF (纯代理转发)
                                            ↓
                                        AI 提供商
```

## 里程碑

| #   | 文件                              | 说明                 |
| --- | --------------------------------- | -------------------- |
| 1   | `milestone-1-bff-proxy.md`        | 创建 BFF 纯代理端点  |
| 2   | `milestone-2-frontend-tools.md`   | 前端工具定义和执行器 |
| 3   | `milestone-3-chat-hook.md`        | 创建新聊天 Hook      |
| 4   | `milestone-4-switch-hook.md`      | 切换到新 Hook        |
| 5   | `milestone-5-cleanup-frontend.md` | 清理前端旧代码       |
| 6   | `milestone-6-simplify-backend.md` | 简化后端             |
| 7   | `milestone-7-electron.md`         | 更新 Electron        |

## 预期收益

1. 移除 ~900 行 Socket.IO 相关代码
2. 工具调用无需服务器中转，减少延迟
3. 单向数据流，更易调试
4. Web 和 Electron 共用相同的 BFF
