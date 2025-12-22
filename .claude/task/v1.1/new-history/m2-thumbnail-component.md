# M2: 创建 ConversationPreviewThumbnail 组件

## 目标

创建可复用的缩略图展示组件，支持加载状态、占位符和预览展示。

## 新建文件

`/app/components/chat/ConversationPreviewThumbnail.tsx`

## Props 设计

```typescript
interface ConversationPreviewThumbnailProps {
  conversationId: string;
  enabled?: boolean; // 是否启用加载（默认 true）
  size?: "sm" | "md" | "lg"; // 缩略图尺寸（默认 md）
  className?: string;
}
```

## 尺寸规格

| Size | 宽高 |
| ---- | ---- |
| sm   | 36px |
| md   | 48px |
| lg   | 64px |

## 渲染状态

### 1. 加载中

```tsx
<Skeleton className="thumbnail-skeleton" />
```

### 2. 无预览（无 AI 修改）

```tsx
<div className="thumbnail-placeholder">
  <FileImage className="thumbnail-placeholder__icon" />
</div>
```

- 虚线边框
- 图标居中
- 使用 `lucide-react` 的 `FileImage` 图标

### 3. 有预览

```tsx
<div className="thumbnail-container">
  <img src={previewUrl} alt="" className="thumbnail-image" draggable={false} />
</div>
```

- 白色背景（SVG 默认）
- `object-fit: contain`
- 圆角边框

## 依赖

- `useConversationPreview` (M1)
- `@heroui/react` - Skeleton 组件
- `lucide-react` - FileImage 图标

## 验收标准

- [ ] 三种状态正确渲染
- [ ] 三种尺寸正确展示
- [ ] 无内存泄漏（组件卸载时正确清理）
