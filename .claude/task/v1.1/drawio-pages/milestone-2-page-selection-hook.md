# M2: 页面选择状态管理 Hook

## 目标

创建 React Hook 管理页面选择状态，处理页面列表变化时的状态同步。

## 新建文件

- `app/hooks/usePageSelection.ts`

## 任务清单

- [ ] 创建 `UsePageSelectionOptions` 接口
  - `xml: string | null` - 当前 XML 内容

- [ ] 创建 `UsePageSelectionResult` 接口
  - `pages: PageInfo[]` - 可用页面列表
  - `selectedPageIds: Set<string>` - 选中的页面 ID 集合
  - `setSelectedPageIds: (ids: Set<string>) => void` - 设置选中页面
  - `isAllSelected: boolean` - 是否全选
  - `selectedPageIndices: number[]` - 选中页面索引数组
  - `selectAll: () => void` - 重置为全选

- [ ] 实现 `usePageSelection` Hook
  - 使用 `extractPagesFromXml` 解析页面列表
  - 默认全选所有页面
  - 页面列表变化时智能更新选中状态
    - 保留仍存在的选中项
    - 新增页面自动选中
    - 如果没有任何选中，回退到全选

- [ ] 导出到 `app/hooks/index.ts`

## 验收标准

- XML 变化时正确更新页面列表
- 选中状态在页面增删时保持合理
- `selectedPageIndices` 返回正确的索引数组

## 依赖

- M1: `extractPagesFromXml` 函数
