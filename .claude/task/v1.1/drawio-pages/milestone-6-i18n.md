# M6: 国际化资源

## 目标

添加页面选择器相关的中英文翻译资源。

## 修改文件

- `public/locales/zh-CN/chat.json`
- `public/locales/en-US/chat.json`

## 任务清单

### 中文翻译 (zh-CN)

- [ ] 添加 `pageSelector` 命名空间

```json
{
  "pageSelector": {
    "label": "页面范围",
    "title": "选择操作页面",
    "listLabel": "页面列表",
    "allPages": "全部页面",
    "singlePage": "1 个页面",
    "multiplePages": "{{count}} 个页面",
    "tooltip": "选择 AI 工具操作的页面范围"
  }
}
```

### 英文翻译 (en-US)

- [ ] 添加 `pageSelector` 命名空间

```json
{
  "pageSelector": {
    "label": "Page Scope",
    "title": "Select Pages",
    "listLabel": "Page list",
    "allPages": "All Pages",
    "singlePage": "1 page",
    "multiplePages": "{{count}} pages",
    "tooltip": "Select page scope for AI tool operations"
  }
}
```

## 翻译键说明

| 键              | 用途                                  |
| --------------- | ------------------------------------- |
| `label`         | 按钮的 aria-label                     |
| `title`         | Popover 标题                          |
| `listLabel`     | ListBox 的 aria-label                 |
| `allPages`      | 全选时的按钮文案                      |
| `singlePage`    | 选中 1 个页面时的备用文案             |
| `multiplePages` | 选中多个页面时的文案（带 count 插值） |
| `tooltip`       | 按钮的 tooltip 提示                   |

## 验收标准

- 中英文翻译完整
- 翻译键与组件中使用的 key 一致
- 插值参数（如 `{{count}}`）正确定义

## 依赖

- M3: PageSelectorButton 组件（确定翻译键使用）
