# 里程碑 1：卡片布局重构

**状态**：⏳ 待开始
**预计耗时**：45 分钟
**依赖**：无

## 目标

使用 HeroUI v3 Card 组件重构设置页面布局，实现清晰的视觉分组和层次结构。

## 任务清单

### 1. 导入 HeroUI Card 组件

- [ ] 在 `app/components/SettingsSidebar.tsx` 中导入 Card 组件：
  ```typescript
  import {
    Button,
    TextField,
    Label,
    Input,
    Description,
    TextArea,
    Card, // 新增
    Separator, // 新增
  } from "@heroui/react";
  ```

### 2. 重构"文件路径配置"区块

- [ ] 将现有的 `<div className="settings-section">` 替换为 Card 组件：
  ```tsx
  <Card.Root className="settings-card" variant="outlined">
    <Card.Header>
      <Card.Title>文件路径配置</Card.Title>
      <Card.Description>设置 DrawIO 文件的默认保存位置</Card.Description>
    </Card.Header>
    <Card.Content className="space-y-4">
      {/* 现有的文件路径配置内容 */}
      <TextField className="w-full">
        <Label>默认启动路径</Label>
        <div className="flex gap-2 mt-2">
          <Input
            value={defaultPath}
            onChange={(e) => setDefaultPath(e.target.value)}
            placeholder="/path/to/folder"
            className="flex-1"
          />
          <Button
            variant="secondary"
            size="sm"
            className="button-small-optimized button-secondary"
            onPress={handleSelectFolder}
          >
            浏览
          </Button>
        </div>
        <Description className="mt-2">
          保存文件时将优先使用此路径,仅在 Electron 环境下生效
        </Description>
      </TextField>
    </Card.Content>
  </Card.Root>
  ```

### 3. 重构"LLM 配置"区块

- [ ] 将 LLM 配置区块改造为 Card 组件：

  ```tsx
  <Card.Root className="settings-card" variant="outlined">
    <Card.Header>
      <Card.Title>LLM 配置</Card.Title>
      <Card.Description>配置 AI 助手的连接参数和行为</Card.Description>
    </Card.Header>
    <Card.Content className="space-y-4">
      {/* 请求地址 */}
      <TextField className="w-full">{/* ... */}</TextField>

      <Separator />

      {/* 供应商选择 */}
      <TextField className="w-full">{/* ... */}</TextField>

      <Separator />

      {/* 其他配置项... */}
    </Card.Content>
  </Card.Root>
  ```

### 4. 添加 Separator 分隔符

- [ ] 在 LLM 配置的各个设置项之间添加 Separator：

  ```tsx
  {/* 请求地址 */}
  <TextField>...</TextField>

  <Separator />

  {/* 供应商选择 */}
  <TextField>...</TextField>

  <Separator />

  {/* 请求密钥 */}
  <TextField>...</TextField>

  {/* ... 其他设置项 */}
  ```

### 5. 调整容器布局

- [ ] 修改 `.sidebar-content` 的布局样式：
  ```tsx
  <div className="sidebar-content space-y-6">
    {/* 卡片之间使用 space-y-6 (24px) 间距 */}
    <Card.Root>...</Card.Root>
    <Card.Root>...</Card.Root>
  </div>
  ```

### 6. 添加卡片样式类

- [ ] 在 `app/styles/layout/sidebar.css` 中添加卡片样式：

  ```css
  /* 设置卡片样式 */
  .settings-card {
    transition: all 0.3s var(--ease-out-cubic);
  }

  .settings-card:hover {
    box-shadow: var(--shadow-md);
  }

  /* 卡片内容间距 */
  .settings-card .space-y-4 > * + * {
    margin-top: 1rem;
  }
  ```

## 验收标准

- [ ] 文件路径配置使用 Card 组件包裹
- [ ] LLM 配置使用 Card 组件包裹
- [ ] Card.Header 正确显示标题和描述
- [ ] Card.Content 包含所有设置项
- [ ] 卡片之间间距为 24px (space-y-6)
- [ ] 设置项之间间距为 16px (space-y-4)
- [ ] Separator 正确分隔不同设置项
- [ ] 卡片 hover 时有阴影效果
- [ ] 所有现有功能保持正常（保存、取消、弹窗等）

## 测试步骤

1. 启动开发服务器 `pnpm run dev`
2. 打开设置侧边栏
3. 检查卡片布局：
   - 文件路径配置卡片
   - LLM 配置卡片
4. 验证卡片结构：
   - Card.Header 显示标题和描述
   - Card.Content 包含设置项
5. 测试间距：
   - 卡片之间 24px
   - 设置项之间 16px
6. 测试交互：
   - 卡片 hover 阴影效果
   - 所有输入框正常工作
   - 保存/取消按钮正常
7. 测试响应式：
   - 调整侧边栏宽度（300-800px）
   - 卡片自适应宽度

## 设计要点

### Card 组件使用

- **variant="outlined"**：使用边框样式，符合 Material Design
- **Card.Header**：包含标题和描述，提供清晰的区块说明
- **Card.Content**：包含具体设置项，使用 `space-y-4` 控制间距

### Separator 使用

- **位置**：在不同类型的设置项之间
- **作用**：视觉分隔，不添加额外间距
- **样式**：使用默认样式，自动适配主题

### 间距规范

- **卡片间距**：24px (space-y-6) - 清晰分组
- **设置项间距**：16px (space-y-4) - 适度分隔
- **标签与输入框**：8px (gap-2) - 紧密关联

## 注意事项

- 保持所有现有功能不变（状态管理、事件处理）
- 仅修改布局结构，不改变逻辑
- 确保 Card 组件正确导入（HeroUI v3 复合组件模式）
- 使用 Tailwind CSS 类名控制间距（space-y-\*）
- 测试所有交互功能（输入、按钮、弹窗）

## 破坏性变更

- ⚠️ 移除 `.settings-section` 类名，替换为 Card 组件
- ⚠️ 移除 `.section-title` 和 `.section-description` 类名
- ⚠️ 使用 Card.Title 和 Card.Description 替代

## 回滚方案

如果遇到问题，可以：

1. 保留原有的 `.settings-section` 结构
2. 仅在外层包裹 Card.Root
3. 逐步迁移到完整的 Card 结构

---

**下一步**：完成后继续 [里程碑 2：控件组件化升级](./milestone-2.md)
