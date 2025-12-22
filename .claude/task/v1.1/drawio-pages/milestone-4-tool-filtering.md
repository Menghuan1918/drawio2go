# M4: 工具过滤逻辑实现

## 目标

修改 DrawIO 前端工具，支持按页面范围过滤操作。

## 修改文件

- `app/lib/frontend-tools.ts`

## 任务清单

### 扩展 FrontendToolContext 接口

- [ ] 新增 `getSelectedPageIndices?: () => number[]`
  - 返回选中的页面索引数组（0-based）
  - 空数组或 undefined 表示全部页面

- [ ] 新增 `isMcpContext?: boolean`
  - 标记是否为 MCP 调用
  - MCP 调用时跳过页面过滤

### 实现页面过滤辅助函数

- [ ] 新增 `filterXmlByPages(xml: string, pageIndices: number[]): string`
  - 解析 XML 文档
  - 移除不在 pageIndices 中的 `<diagram>` 标签
  - 返回过滤后的 XML 字符串
  - 空 pageIndices 返回原始 XML

### 修改工具执行函数

- [ ] 修改 `executeDrawioReadFrontend`
  - 获取 XML 后，检查 `isMcpContext`
  - 非 MCP 时调用 `getSelectedPageIndices()` 获取范围
  - 使用 `filterXmlByPages` 过滤 XML
  - 后续解析基于过滤后的 XML

- [ ] 修改 `executeDrawioEditBatchFrontend`
  - 编辑操作前验证目标元素是否在选中页面范围内
  - 非选中页面的元素操作返回 `allow_no_match` 兼容响应
  - 或：过滤后只处理选中页面的元素

- [ ] 修改 `executeDrawioOverwriteFrontend`
  - 非 MCP 时，仅覆盖选中页面的内容
  - 保留未选中页面的原有内容
  - 合并生成最终 XML

## 过滤逻辑说明

```
drawio_read:
  原始 XML → filterXmlByPages → 解析 → 返回结果

drawio_edit_batch:
  获取原始 XML → 执行编辑 → 验证目标在选中范围内 → 保存

drawio_overwrite:
  获取原始 XML → 提取未选中页面 → 合并新 XML → 保存
```

## 验收标准

- 非 MCP 场景：工具操作仅影响选中页面
- MCP 场景：工具操作影响全部页面
- 页面过滤不影响 XML 结构完整性
- 编辑操作的原子性保持不变

## 依赖

- M1: 页面元数据提取（用于验证页面范围）
