# AlertDialog 组件系统（AGENTS）

## 模块职责

- 提供全局的 `AlertDialogProvider`，统一管理单实例告警/确认对话框状态。
- 封装 HeroUI v3 `AlertDialog` 复合组件，支持警告/危险两种语义状态。
- 处理异步操作：`onAction` 支持 Promise，执行期间自动禁用按钮并显示加载状态。

## 文件

- `AlertDialogProvider.tsx`：Context + Reducer，暴露 `useAlertDialog`（open/close）。
- `GlobalAlertDialog.tsx`：实际 UI 渲染，受控模式，z-index 1450，使用 `app/styles/components/alert-dialog.css` 样式。
- `index.ts`：导出 Provider 与 Hooks。
- 样式：`app/styles/components/alert-dialog.css`（已在 `app/globals.css` 导入）。
- 类型：`app/types/alert-dialog.ts`。

## 使用方式

```tsx
import { useAlertDialog } from "@/app/components/alert";

const { open, close } = useAlertDialog();

open({
  status: "danger", // or "warning"
  title: "删除会话",
  description: "删除后无法恢复",
  actionLabel: "删除",
  cancelLabel: "取消",
  onAction: async () => {
    await doDelete();
  },
  onCancel: () => {},
  isDismissable: false, // 允许/禁止点击遮罩或 ESC 关闭
});
```

## 设计要点

- 事件使用 `onPress`（HeroUI/React Aria 规范），按钮语义 variant 已与状态映射。
- 仅支持单实例；`open` 会覆盖当前弹窗状态。
- 异步失败会保留对话框并恢复按钮，使用户可重试。
- 样式遵循设计令牌：圆角 `var(--radius-lg)`，阴影 `var(--shadow-8)`，遮罩 `var(--glass-effect)`。

## 注意

- Provider 已集成到 `app/layout.tsx`（包装在 `I18nProvider` 内，`ToastProvider` 外）。
- 若需要多语言文案，请传入已翻译的 `title/description/actionLabel/cancelLabel`。
