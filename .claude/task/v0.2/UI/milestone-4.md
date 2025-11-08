# 里程碑 4：样式优化与动画

**状态**：⏳ 待开始
**预计耗时**：30 分钟
**依赖**：里程碑 1, 2, 3

## 目标

统一样式规范，优化间距、颜色和动画效果，确保所有元素符合 Material Design 风格和 #3388BB 主题。

## 任务清单

### 1. 统一间距规范

- [ ] 在 `app/styles/layout/sidebar.css` 中定义间距变量：

  ```css
  /* 设置页面间距规范 */
  :root {
    --settings-card-gap: 1.5rem; /* 24px - 卡片间距 */
    --settings-item-gap: 1rem; /* 16px - 设置项间距 */
    --settings-label-gap: 0.5rem; /* 8px - 标签与输入框间距 */
    --settings-section-padding: 1.25rem; /* 20px - 卡片内边距 */
  }

  /* 应用间距 */
  .sidebar-content {
    display: flex;
    flex-direction: column;
    gap: var(--settings-card-gap);
    padding: 1rem 1.5rem 2rem;
  }

  .settings-card .space-y-4 > * + * {
    margin-top: var(--settings-item-gap);
  }
  ```

### 2. 优化卡片样式

- [ ] 增强卡片的视觉效果：

  ```css
  /* 卡片样式优化 */
  .settings-card {
    border-radius: var(--radius-lg);
    border: 1px solid var(--border-primary);
    background: var(--bg-primary);
    transition: all 0.3s var(--ease-out-cubic);
    overflow: hidden;
  }

  .settings-card:hover {
    border-color: var(--primary-color);
    box-shadow: var(--shadow-md);
    transform: translateY(-2px);
  }

  /* 卡片头部 */
  .settings-card [class*="card__header"] {
    padding: var(--settings-section-padding);
    border-bottom: 1px solid var(--border-light);
    background: linear-gradient(to bottom, var(--bg-primary), transparent);
  }

  /* 卡片内容 */
  .settings-card [class*="card__content"] {
    padding: var(--settings-section-padding);
  }

  /* 卡片标题 */
  .settings-card [class*="card__title"] {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--primary-color);
    margin-bottom: 0.25rem;
  }

  /* 卡片描述 */
  .settings-card [class*="card__description"] {
    font-size: 0.875rem;
    color: var(--gray-primary);
  }
  ```

### 3. 统一输入框样式

- [ ] 优化所有输入框的样式：

  ```css
  /* 统一输入框样式 */
  .settings-card input[type="text"],
  .settings-card input[type="password"],
  .settings-card textarea {
    border-radius: 0.75rem;
    border: 1px solid var(--border-primary);
    background: var(--bg-primary);
    padding: 0.625rem 0.875rem;
    font-size: 0.875rem;
    transition: all 0.2s var(--ease-out-cubic);
  }

  .settings-card input:focus,
  .settings-card textarea:focus {
    outline: none;
    border-color: var(--primary-color);
    box-shadow: 0 0 0 3px rgba(51, 136, 187, 0.1);
    background: white;
  }

  .settings-card input:hover:not(:focus),
  .settings-card textarea:hover:not(:focus) {
    border-color: var(--border-hover);
  }
  ```

### 4. 优化按钮样式

- [ ] 统一按钮的样式和动画：

  ```css
  /* 主按钮样式 */
  .button-primary {
    background: var(--primary-color);
    color: var(--primary-foreground);
    border: none;
    border-radius: 0.75rem;
    padding: 0.625rem 1.25rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s var(--ease-out-cubic);
    box-shadow: 0 2px 4px rgba(51, 136, 187, 0.2);
  }

  .button-primary:hover {
    background: var(--primary-hover);
    box-shadow: 0 4px 8px rgba(51, 136, 187, 0.3);
    transform: translateY(-1px);
  }

  .button-primary:active {
    transform: translateY(0);
    box-shadow: 0 1px 2px rgba(51, 136, 187, 0.2);
  }

  /* 次要按钮样式 */
  .button-secondary {
    background: var(--bg-secondary);
    color: var(--primary-color);
    border: 1px solid var(--border-primary);
    border-radius: 0.75rem;
    padding: 0.625rem 1.25rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s var(--ease-out-cubic);
  }

  .button-secondary:hover {
    background: var(--primary-light);
    border-color: var(--primary-color);
    box-shadow: var(--shadow-sm);
  }

  /* 小按钮优化 */
  .button-small-optimized {
    padding: 0.5rem 1rem;
    font-size: 0.8125rem;
  }
  ```

### 5. 优化浮动按钮

- [ ] 增强浮动操作按钮的视觉效果：

  ```css
  /* 浮动操作按钮 */
  .floating-actions {
    position: fixed;
    bottom: 60px;
    right: 24px;
    z-index: 110;
    display: flex;
    gap: 0.75rem;
    animation: float-in 0.3s var(--ease-out-cubic);
  }

  @keyframes float-in {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .floating-actions .sidebar-button {
    min-width: 80px;
    box-shadow: 0 4px 12px rgba(51, 136, 187, 0.25);
  }

  .floating-actions .sidebar-button:hover {
    box-shadow: 0 6px 16px rgba(51, 136, 187, 0.35);
  }
  ```

### 6. 优化弹窗样式

- [ ] 统一弹窗的样式和动画：

  ```css
  /* 弹窗遮罩 */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fade-in 0.2s ease-out;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* 弹窗内容 */
  .modal-content {
    background: white;
    border-radius: var(--radius-lg);
    box-shadow: 0 20px 40px rgba(51, 136, 187, 0.3);
    max-width: 90vw;
    max-height: 90vh;
    overflow: auto;
    animation: slide-up 0.3s var(--ease-out-cubic);
  }

  @keyframes slide-up {
    from {
      opacity: 0;
      transform: translateY(20px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  /* 弹窗标题 */
  .modal-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--primary-color);
    margin-bottom: 1rem;
  }

  /* 弹窗操作按钮 */
  .modal-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-light);
  }
  ```

### 7. 添加加载状态样式

- [ ] 优化加载和测试状态的样式：

  ```css
  /* 测试加载状态 */
  .test-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 2rem;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--primary-light);
    border-top-color: var(--primary-color);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* 测试结果 */
  .test-result {
    padding: 1.5rem;
    border-radius: 0.75rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .test-success {
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid rgba(34, 197, 94, 0.3);
  }

  .test-error {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  .test-icon {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    font-weight: bold;
  }

  .test-success .test-icon {
    background: var(--success-color);
    color: white;
  }

  .test-error .test-icon {
    background: var(--error-color);
    color: white;
  }
  ```

### 8. 优化 Separator 样式

- [ ] 统一分隔符的样式：
  ```css
  /* Separator 样式 */
  .settings-card [class*="separator"] {
    height: 1px;
    background: var(--border-light);
    margin: var(--settings-item-gap) 0;
    opacity: 0.6;
  }
  ```

### 9. 添加响应式优化

- [ ] 确保在不同侧边栏宽度下的显示效果：

  ```css
  /* 响应式优化 */
  @media (max-width: 400px) {
    .sidebar-content {
      padding: 0.75rem 1rem 1.5rem;
    }

    .settings-card [class*="card__header"],
    .settings-card [class*="card__content"] {
      padding: 1rem;
    }

    .floating-actions {
      right: 16px;
      bottom: 52px;
    }

    .floating-actions .sidebar-button {
      min-width: 70px;
      font-size: 0.75rem;
    }
  }
  ```

## 验收标准

- [ ] 所有卡片使用统一的圆角和边框
- [ ] 卡片 hover 时有阴影和位移效果
- [ ] 所有输入框 focus 时有蓝色边框和阴影
- [ ] 按钮 hover 时有阴影和位移效果
- [ ] 浮动按钮出现时有动画
- [ ] 弹窗打开时有淡入和滑入动画
- [ ] 加载状态有旋转动画
- [ ] 测试结果有颜色区分（成功/失败）
- [ ] Separator 有适当的透明度
- [ ] 所有动画流畅，无卡顿
- [ ] 响应式布局在不同宽度下正常

## 测试步骤

1. 启动开发服务器 `pnpm run dev`
2. 打开设置侧边栏
3. 测试卡片样式：
   - 观察卡片圆角和边框
   - hover 卡片查看阴影效果
   - 检查卡片标题颜色（#3388BB）
4. 测试输入框：
   - 点击输入框查看 focus 效果
   - hover 输入框查看边框变化
5. 测试按钮：
   - hover 主按钮查看阴影和位移
   - hover 次要按钮查看背景变化
   - 点击按钮查看 active 效果
6. 测试浮动按钮：
   - 修改设置触发浮动按钮
   - 观察出现动画
7. 测试弹窗：
   - 打开系统提示词弹窗
   - 观察淡入和滑入动画
   - 打开测试连接弹窗
   - 观察加载动画和结果样式
8. 测试响应式：
   - 调整侧边栏宽度（300-800px）
   - 验证布局适配

## 设计要点

### 动画原则

- **流畅性**：所有动画使用 ease-out 缓动
- **一致性**：相同类型的元素使用相同的动画
- **性能**：使用 transform 和 opacity，避免 layout 变化
- **时长**：快速交互 0.2s，复杂动画 0.3s

### 颜色使用

- **主题色**：#3388BB 用于标题、按钮、边框
- **成功色**：#22c55e 用于成功状态
- **错误色**：#ef4444 用于错误状态
- **灰色**：#6b7280 用于描述文本

### 间距规范

- **卡片间距**：24px (1.5rem)
- **设置项间距**：16px (1rem)
- **标签间距**：8px (0.5rem)
- **卡片内边距**：20px (1.25rem)

## 注意事项

- 所有动画使用 CSS 变量定义的缓动函数
- 确保动画不影响性能（使用 transform 和 opacity）
- 测试深色模式下的颜色对比度
- 验证所有交互状态（hover, focus, active, disabled）
- 确保响应式布局在极端宽度下不破坏

## 破坏性变更

- ⚠️ 完全重写卡片、输入框、按钮的样式
- ⚠️ 移除旧的样式类名，使用新的统一样式
- ⚠️ 动画可能在低性能设备上影响体验

## 性能优化

- 使用 `will-change` 提示浏览器优化动画
- 避免在动画中使用 `box-shadow`（使用 transform 替代）
- 使用 `contain` 属性隔离重绘区域

---

**下一步**：完成后继续 [里程碑 5：集成测试与调优](./milestone-5.md)
