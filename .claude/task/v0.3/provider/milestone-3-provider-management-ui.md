# Milestone 3: 供应商管理UI

## 目标

实现设置侧边栏中的供应商管理界面，包括供应商列表展示、添加/编辑/删除供应商的对话框，使用HeroUI v3复合组件模式。

## 优先级

🟡 **高优先级** - 核心UI功能

## 任务列表

### 1. 更新设置导航

**文件**: `app/components/settings/SettingsNav.tsx`

- [x] 修改 `SettingsTab` 类型定义
  - 从 `"file" | "llm" | "version"` 改为 `"file" | "models" | "agent" | "version"`
- [x] 更新导航按钮配置
  - 将 "llm" tab 重命名为 "models"
  - 新增 "agent" tab（在 models 和 version 之间）
- [x] 更新图标（如需要）
  - models: 使用 `BrainCircuit` 或类似图标
  - agent: 使用 `Sparkles` 或类似图标

### 2. 更新设置侧边栏主组件

**文件**: `app/components/SettingsSidebar.tsx`

- [x] 调整tab切换逻辑以支持新的4个tab
- [x] 将原有的 `LLMSettingsPanel` 替换为 `ModelsSettingsPanel`
- [x] 新增 `AgentSettingsPanel`（本milestone只需占位，详细实现在milestone 5）
- [x] 确保tab切换动画流畅

### 3. 创建供应商管理面板

**文件**: `app/components/settings/ModelsSettingsPanel.tsx`（新建，替代LLMSettingsPanel）

- [x] 从存储层加载供应商列表
- [x] 使用HeroUI v3 `Accordion` 组件（复合组件模式）
  - variant="separated" 实现分隔样式
- [x] 实现供应商列表结构
  - 每个供应商为一个 `Accordion.Item`
  - Header显示：供应商名称 + 模型数量Badge + 操作菜单
  - Content显示：供应商基本信息（类型、API地址、密钥状态）+ 模型列表（预留，详细实现在milestone 4）
- [x] 实现操作菜单（使用 `Dropdown` + `ListBox`）
  - 编辑供应商
  - 删除供应商
- [x] 实现"添加供应商"按钮
  - 使用 `Button` 组件，variant="secondary"
  - 点击打开供应商编辑对话框
- [x] 处理供应商删除的级联逻辑
  - 检查是否为当前活动模型的供应商
  - 显示确认对话框
  - 切换活动模型（如需要）
- [x] 添加空状态提示（无供应商时）

### 4. 创建供应商编辑对话框

**文件**: `app/components/settings/ProviderEditDialog.tsx`（新建）

- [x] 使用HeroUI v3 `Modal` 组件（复合组件模式）
- [x] 实现对话框结构
  - `Modal.Header`: 标题（"添加供应商" / "编辑供应商"）+ 关闭按钮
  - `Modal.Body`: 表单字段
  - `Modal.Footer`: 取消和保存按钮
- [x] 实现表单字段
  - 供应商名称（TextField + Input）
  - 供应商类型（Select + ListBox）
    - 选项：openai-compatible, deepseek, openai-reasoning
  - API地址（TextField + Input）
    - 带描述：建议包含 /v1 路径
  - API密钥（TextField + Input, type="password"）
    - 可选，留空则不使用
- [x] 集成连接测试器（复用现有的 `ConnectionTester` 组件）
- [x] 实现表单验证
  - 供应商名称不能为空
  - API地址格式验证
  - 供应商类型必选
- [x] 实现保存逻辑
  - 新增：调用 `addProvider()` 方法
  - 编辑：调用 `updateProvider()` 方法
  - 保存成功后关闭对话框并刷新列表
- [x] 实现取消逻辑
  - 关闭对话框并清空表单

### 5. 删除旧组件

- [x] **删除** `app/components/settings/LLMSettingsPanel.tsx`

## 涉及文件

- 📝 修改：`app/components/settings/SettingsNav.tsx`
- 📝 修改：`app/components/SettingsSidebar.tsx`
- ✨ 新建：`app/components/settings/ModelsSettingsPanel.tsx`
- ✨ 新建：`app/components/settings/ProviderEditDialog.tsx`
- 🗑️ 删除：`app/components/settings/LLMSettingsPanel.tsx`
- 📖 依赖：`app/hooks/useStorageSettings.ts`（使用存储方法）
- 📖 依赖：`app/components/settings/ConnectionTester.tsx`（复用）

## HeroUI v3 组件使用

### 必须遵循的规范

- ✅ 使用复合组件模式（`Accordion.Item`, `Modal.Header` 等）
- ✅ 使用语义化variant（`primary`, `secondary`, `tertiary`, `danger`）
- ✅ 使用 `onPress` 而不是 `onClick`
- ✅ 使用 `isDisabled` 而不是 `disabled`
- ✅ 所有交互组件添加 `"use client"` 指令
- ❌ 不使用扁平props模式
- ❌ 不使用视觉化variant（`solid`, `bordered`, `flat`）

### 使用的组件

- `Accordion` + `Accordion.Item` + `Accordion.Header` + `Accordion.Content`
- `Modal` + `Modal.Header` + `Modal.Body` + `Modal.Footer`
- `Button`（variant: secondary, primary, ghost, danger）
- `Dropdown` + `Dropdown.Trigger` + `Dropdown.Content`
- `ListBox` + `ListBox.Item`
- `TextField` + `Label` + `Input` + `Description`
- `Select` + `Select.Trigger` + `Select.Content`
- `Badge`（显示模型数量）

## 验收标准

### UI显示

- [x] 供应商列表使用Accordion正确展示
- [x] 每个供应商的Header显示完整信息
- [x] 操作菜单（编辑/删除）正常工作
- [x] 添加供应商按钮位置合理

### 对话框功能

- [x] 供应商编辑对话框正确打开/关闭
- [x] 所有表单字段正常输入
- [x] 供应商类型下拉选择正常
- [x] 连接测试器集成正常

### 数据操作

- [x] 新增供应商成功保存到存储
- [x] 编辑供应商成功更新存储
- [x] 删除供应商时显示确认对话框
- [x] 删除当前活动供应商时正确切换

### 表单验证

- [x] 必填字段验证生效
- [x] API地址格式验证生效
- [x] 验证错误显示清晰

### HeroUI规范

- [x] 所有组件使用复合组件模式
- [x] 所有Button使用语义化variant
- [x] 所有交互使用 `onPress`
- [x] 深色/浅色主题适配正常

## 依赖关系

**前置依赖**:

- ✅ Milestone 1（类型定义）
- ✅ Milestone 2（存储层方法）

**后续依赖**:

- Milestone 4（模型管理UI）将扩展此面板，添加模型列表

## 注意事项

1. **复合组件模式**: 严格遵循HeroUI v3的复合组件模式，不使用扁平props
2. **级联删除**: 删除供应商时必须处理活动模型切换逻辑
3. **空状态**: 无供应商时显示友好的空状态提示
4. **Material Design**: 遵循项目的Material Design规范（4/8/12px圆角，4层阴影）
5. **错误处理**: 所有存储操作都要有适当的错误提示（使用HeroUI Alert组件）

## 预计时间

⏱️ **4-5 小时**
