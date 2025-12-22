# M4: 样式完善

## 目标

为缩略图组件添加完整样式，确保与现有历史记录卡片风格一致。

## 修改文件

`/app/styles/components/history-view.css`

## 新增样式

### 1. 卡片内容区调整

```css
.history-card__content {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  min-height: 72px; /* 确保高度一致 */
}
```

### 2. 缩略图容器

```css
.thumbnail-container {
  flex-shrink: 0;
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
}

.thumbnail-container--sm {
  width: 36px;
  height: 36px;
}
.thumbnail-container--md {
  width: 48px;
  height: 48px;
}
.thumbnail-container--lg {
  width: 64px;
  height: 64px;
}

.thumbnail-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: white;
}
```

### 3. 占位符样式

```css
.thumbnail-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: var(--radius);
  background: var(--bg-secondary);
  border: 1px dashed var(--border);
  color: var(--foreground-tertiary);
}

.thumbnail-placeholder--sm {
  width: 36px;
  height: 36px;
}
.thumbnail-placeholder--md {
  width: 48px;
  height: 48px;
}
.thumbnail-placeholder--lg {
  width: 64px;
  height: 64px;
}

.thumbnail-placeholder__icon {
  width: 20px;
  height: 20px;
  opacity: 0.5;
}
```

### 4. 骨架屏样式

```css
.thumbnail-skeleton {
  flex-shrink: 0;
  border-radius: var(--radius);
}

.thumbnail-skeleton--sm {
  width: 36px;
  height: 36px;
}
.thumbnail-skeleton--md {
  width: 48px;
  height: 48px;
}
.thumbnail-skeleton--lg {
  width: 64px;
  height: 64px;
}
```

### 5. 响应式适配（可选）

```css
@media (max-width: 576px) {
  .thumbnail-container,
  .thumbnail-placeholder {
    width: 36px;
    height: 36px;
  }
}
```

## 验收标准

- [ ] 缩略图样式与卡片风格一致
- [ ] 深色模式下正常显示
- [ ] 响应式布局正常
