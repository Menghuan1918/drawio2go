# M1: 页面元数据提取扩展

## 目标

扩展现有的页面元数据提取功能，支持返回页面 ID。

## 修改文件

- `app/lib/storage/page-metadata.ts`

## 任务清单

- [ ] 新增 `PageInfo` 接口定义

  ```typescript
  interface PageInfo {
    id: string; // diagram 标签的 id 属性
    name: string; // diagram 标签的 name 属性
    index: number; // 页面索引（0-based）
  }
  ```

- [ ] 新增 `extractPagesFromXml(xml)` 函数
  - 解析 XML 中所有 `<diagram>` 标签
  - 提取每个 diagram 的 `id` 和 `name` 属性
  - 返回 `PageInfo[]` 数组
  - 空 XML 返回默认单页：`[{ id: "page-1", name: "Page 1", index: 0 }]`

- [ ] 新增 `extractAttribute(attrs, attrName)` 辅助函数
  - 支持双引号和单引号属性值提取
  - 用于提取 id 和 name 属性

## 验收标准

- 从包含多页的 DrawIO XML 正确提取所有页面信息
- 处理缺失 id/name 属性的情况（自动生成）
- 保持向后兼容，不影响现有的 `buildPageMetadataFromXml` 函数

## 依赖

无
