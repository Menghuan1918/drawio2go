# DrawIO 页面范围选择器

## 需求概述

在画布上下文按钮右侧新增"页面"选择按钮，用于选择 drawio 工具作用的页面范围（多选）。

## 设计决策

- **按钮位置**：CanvasContextButton 右侧（MCP 按钮左侧）
- **过滤范围**：影响所有 drawio 工具（read、edit_batch、overwrite）
- **显示策略**：无论页面数量，始终显示按钮
- **默认值**：默认全选
- **MCP 特殊处理**：MCP 服务暴露时始终为全部范围

## 里程碑列表

| 里程碑 | 标题                  | 状态    |
| ------ | --------------------- | ------- |
| M1     | 页面元数据提取扩展    | pending |
| M2     | 页面选择状态管理 Hook | pending |
| M3     | 页面选择器 UI 组件    | pending |
| M4     | 工具过滤逻辑实现      | pending |
| M5     | ChatSidebar 集成      | pending |
| M6     | 国际化资源            | pending |

## UI 布局示意

```
┌─────────────────────────────────────────────────────┐
│ [画布上下文] [页面: 全部页面 ▼]        [MCP 接口] │
├─────────────────────────────────────────────────────┤
│                                                     │
│              文本输入框                              │
│                                                     │
├─────────────────────────────────────────────────────┤
│ [新建] [历史] [图片]              [模型 ▼] [发送] │
└─────────────────────────────────────────────────────┘
```

## MCP 与 Chat 区分策略

```
Chat 路径:
  ChatSidebar → frontendToolContext (isMcpContext: false)
    → 工具执行时调用 getSelectedPageIndices() 获取用户选择
    → 按页面范围过滤 XML

MCP 路径:
  MCP Server → IPC → handleToolRequest
    → 创建独立 mcpContext (isMcpContext: true)
    → 工具执行时检测 isMcpContext，跳过页面过滤
    → 操作全部页面
```
