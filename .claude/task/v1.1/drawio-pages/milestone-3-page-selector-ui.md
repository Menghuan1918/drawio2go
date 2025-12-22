# M3: 页面选择器 UI 组件

## 目标

创建页面选择器按钮组件，支持多选下拉菜单。

## 新建文件

- `app/components/chat/PageSelectorButton.tsx`

## 任务清单

- [ ] 创建 `PageSelectorButtonProps` 接口
  - `pages: PageInfo[]` - 可用页面列表
  - `selectedPageIds: Set<string>` - 选中的页面 ID 集合
  - `onSelectionChange: (ids: Set<string>) => void` - 选中变化回调
  - `isDisabled?: boolean` - 是否禁用

- [ ] 实现 `PageSelectorButton` 组件
  - 使用 HeroUI `Popover` + `ListBox` 组件
  - 图标：`Layers`（lucide-react）
  - 按钮尺寸：`size="sm"`（与 CanvasContextButton 一致）

- [ ] 按钮文案逻辑
  - 全选或无选中：显示「全部页面」
  - 选中 1 个：显示页面名称
  - 选中多个：显示「N 个页面」

- [ ] variant 逻辑
  - 全选时：`variant="secondary"`
  - 部分选择：`variant="primary"`

- [ ] ListBox 配置
  - `selectionMode="multiple"` 多选模式
  - 显示所有页面名称
  - 支持全选快捷操作

## UI 规格

```
┌──────────────────────┐
│ 📑 全部页面 ▼       │  ← 按钮（折叠状态）
└──────────────────────┘

┌──────────────────────┐
│ 选择操作页面          │  ← Popover 标题
├──────────────────────┤
│ ☑ Page 1            │
│ ☑ Page 2            │
│ ☐ Page 3            │
└──────────────────────┘
```

## 验收标准

- 组件渲染正确，样式与 CanvasContextButton 协调
- 多选功能正常工作
- 按钮文案根据选中状态动态变化
- 支持键盘导航（React Aria 内置）

## 依赖

- M1: `PageInfo` 类型定义
