# M5: ChatSidebar 集成

## 目标

将页面选择功能集成到 ChatSidebar 主组件，连接状态管理和 UI。

## 修改文件

- `app/components/ChatSidebar.tsx`
- `app/components/chat/ChatInputArea.tsx`

## 任务清单

### ChatSidebar 状态集成

- [ ] 新增 `currentXml` 状态
  - 存储当前编辑器的 XML 内容
  - 用于 `usePageSelection` hook 的输入

- [ ] 监听编辑器 XML 变化
  - 组件挂载时获取初始 XML
  - 可选：添加编辑器变化监听（如果有事件机制）

- [ ] 使用 `usePageSelection` hook
  - 传入 `currentXml`
  - 解构获取 pages, selectedPageIds, setSelectedPageIds 等

- [ ] 更新 `frontendToolContext`
  - 注入 `getSelectedPageIndices: () => pageSelection.selectedPageIndices`
  - 设置 `isMcpContext: false`

- [ ] 修改 MCP 工具调用路径（handleToolRequest）
  - 创建独立的 mcpContext
  - 设置 `isMcpContext: true`
  - 设置 `getSelectedPageIndices: () => []`（空数组 = 全部）

### ChatInputArea 布局更新

- [ ] 新增 `pageSelector` prop 定义

  ```typescript
  pageSelector?: {
    pages: PageInfo[];
    selectedPageIds: Set<string>;
    onSelectionChange: (ids: Set<string>) => void;
    isDisabled?: boolean;
  };
  ```

- [ ] 在布局中插入 PageSelectorButton
  - 位置：CanvasContextButton 右侧
  - 条件渲染：`pageSelector && pageSelector.pages.length > 0`

- [ ] 传递 props
  - 从 ChatSidebar 传入 pageSelector 配置
  - 禁用状态与其他输入控件联动

### 布局结构

```tsx
<div className="flex items-center justify-between gap-2">
  <CanvasContextButton ... />

  {/* 新增 */}
  {pageSelector ? (
    <PageSelectorButton
      pages={pageSelector.pages}
      selectedPageIds={pageSelector.selectedPageIds}
      onSelectionChange={pageSelector.onSelectionChange}
      isDisabled={pageSelector.isDisabled}
    />
  ) : null}

  {mcpConfigDialog ? (
    <McpConfigDialog ...>
      <McpButton ... />
    </McpConfigDialog>
  ) : null}
</div>
```

## 验收标准

- 页面选择器正确显示在 UI 中
- 选择状态变化能正确传递到工具上下文
- MCP 调用不受 UI 选择影响
- 编辑器 XML 变化时页面列表自动更新

## 依赖

- M2: `usePageSelection` hook
- M3: `PageSelectorButton` 组件
- M4: 扩展后的 `FrontendToolContext` 接口
