# M1: 创建 useConversationPreview Hook

## 目标

创建用于加载对话预览图的 Hook，包含缓存机制。

## 新建文件

`/app/hooks/useConversationPreview.ts`

## 接口设计

```typescript
interface UseConversationPreviewOptions {
  enabled?: boolean; // 是否启用加载（配合懒加载）
}

interface UseConversationPreviewResult {
  previewUrl: string | null; // SVG data URL
  isLoading: boolean;
  error: Error | null;
  hasAiEdit: boolean; // 是否有 AI 修改过
}

function useConversationPreview(
  conversationId: string | null,
  options?: UseConversationPreviewOptions,
): UseConversationPreviewResult;
```

## 核心逻辑

1. **查找最后 AI 修改的版本 ID**
   - 调用 `getMessages(conversationId)` 获取消息列表
   - 倒序遍历找最后一条有 `xml_version_id` 的消息
   - 如果没找到，返回 `hasAiEdit: false`

2. **加载 SVG 预览数据**
   - 调用 `getXMLVersionSVGData(xmlVersionId)` 获取 `preview_svg`
   - 使用 `decompressBlob()` 解压
   - 转换为 data URL

3. **LRU 缓存机制**
   - 模块级缓存 Map
   - 容量上限 50 条
   - 缓存键: `conversationId`
   - 缓存值: `{ xmlVersionId, previewUrl, timestamp }`

4. **Object URL 管理**
   - 缓存淘汰时调用 `URL.revokeObjectURL()` 释放内存

## 依赖

- `useStorageConversations` - 获取消息
- `useStorageXMLVersions` - 获取 SVG 数据
- `decompressBlob` from `@/app/lib/compression-utils`

## 验收标准

- [ ] Hook 能正确获取对话最后一条 AI 修改的预览图
- [ ] 无 AI 修改时 `hasAiEdit` 返回 false
- [ ] 缓存机制正常工作
- [ ] `enabled=false` 时不触发加载
