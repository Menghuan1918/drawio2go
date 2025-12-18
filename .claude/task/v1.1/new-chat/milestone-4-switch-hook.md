# Milestone 4: 切换到新 Hook

## 目标

更新 `app/page.tsx`，使用新的 `useAIChat` Hook 替代 `useDrawioSocket`。

## 前置条件

- 里程碑 2 已完成（前端工具定义和执行器）
- 里程碑 3 已完成（`useAIChat` Hook 已创建）

## 修改文件

- `app/page.tsx`

## 修改内容

### 1. 替换 Hook 导入

```diff
- import { useDrawioSocket } from '@/hooks/useDrawioSocket';
+ import { useAIChat } from '@/hooks/useAIChat';
```

### 2. 替换 Hook 使用

```diff
- const {
-   messages,
-   isConnected,
-   isLoading,
-   sendMessage,
-   cancelChat,
-   // ... 其他 Socket.IO 相关状态
- } = useDrawioSocket({ ... });

+ const {
+   messages,
+   input,
+   setInput,
+   append,
+   stop,
+   isLoading,
+   error,
+ } = useAIChat({
+   drawioRef,
+   config: llmConfig,
+   projectUuid,
+   conversationId,
+ });
```

### 3. 移除的状态和逻辑

| 移除项             | 原因                     |
| ------------------ | ------------------------ |
| `socketConnected`  | 不再需要 WebSocket 连接  |
| `isConnected`      | HTTP 请求无连接状态概念  |
| `chatRunId`        | 前端自行管理请求生命周期 |
| `pendingToolCalls` | 工具在前端同步执行       |
| Socket 重连逻辑    | 不再需要                 |
| 连接状态 UI 指示器 | 不再需要                 |

### 4. 调整事件处理

```diff
- const handleSend = () => {
-   sendMessage(input, projectUuid);
- };
- const handleCancel = () => {
-   cancelChat();
- };

+ const handleSend = () => {
+   append({ role: 'user', content: input });
+   setInput('');
+ };
+ const handleCancel = () => {
+   stop();
+ };
```

## 验收标准

- [ ] 页面正常加载，无控制台错误
- [ ] 聊天功能正常工作
- [ ] 工具调用正常执行
- [ ] 取消按钮正常工作
- [ ] 自动版本快照正常工作
- [ ] 旧 Hook (`useDrawioSocket`) 不再被任何文件导入
