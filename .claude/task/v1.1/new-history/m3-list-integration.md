# M3: 集成到历史记录列表

## 目标

将缩略图组件集成到 ConversationList，实现左侧缩略图布局。

## 修改文件

`/app/components/chat/ConversationList.tsx`

## 修改内容

### 1. 导入组件

```typescript
import ConversationPreviewThumbnail from "./ConversationPreviewThumbnail";
```

### 2. 修改 renderConversationCard 函数

在 `Card.Content` 内部开头添加缩略图：

```tsx
<Card.Content className="history-card__content">
  {/* 新增：缩略图 */}
  <ConversationPreviewThumbnail
    conversationId={conv.id}
    size="md"
  />

  {selectionMode && (
    <Checkbox ... />
  )}

  <div className="history-card__body">
    ...
  </div>
</Card.Content>
```

### 3. 布局调整

卡片内容区调整为：

```
[缩略图 48px] [选择框?] [标题+时间 flex:1]
```

## 虚拟滚动兼容

- 虚拟滚动项默认 `enabled={true}`
- 已在可视区域内，无需额外处理

## 验收标准

- [ ] 缩略图正确显示在卡片左侧
- [ ] 选择模式下 Checkbox 位置正确
- [ ] 虚拟滚动正常工作
- [ ] 点击卡片行为不受影响
