# Common 复用组件说明

此目录存放可跨模块复用的基础 UI 组件（HeroUI v3 + React Aria 复合模式）。所有组件必须：

- 使用 `"use client"` 并遵循 HeroUI v3 事件规范（`onPress` / `isDisabled` / 语义化 variant）。
- 结构、样式优先复用现有模态样式（`ModalOverlay` + `Surface`），保持与 ProviderEditDialog 一致的遮罩与阴影。
- 默认支持受控模式和回调，避免内部状态与上层冲突。

## ConfirmDialog

- 路径：`app/components/common/ConfirmDialog.tsx`
- 作用：替代 `window.confirm` 的通用二次确认对话框。
- 重要行为：`isDismissable` 遮罩点击/ESC 关闭触发取消回调；确认按钮支持 `variant="danger"` 与异步 `onConfirm` 的加载态；按钮顺序为取消在左、确认在右。
- 默认文案：确认/取消（中文），可通过 props 覆盖。

新增组件请在此文件补充用途与关键交互约定，确保后续代理快速对齐规范。

## ModelIcon

- 路径：`app/components/common/ModelIcon.tsx`
- 作用：基于 `app/lib/model-icons.ts` 的模型/供应商图标展示，按模型规则 > 供应商品牌 > 通用 CPU 图标的优先级返回 React Icon。
- 使用：传入 `modelId`/`modelName`/`providerId`/`providerType`（可选），可通过 `size`/`className` 控制外观，默认使用 `currentColor` 适配亮暗主题。
