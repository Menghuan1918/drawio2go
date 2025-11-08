"use client";

interface EmptyStateProps {
  type: "loading" | "no-config" | "no-messages";
}

export default function EmptyState({ type }: EmptyStateProps) {
  const getEmptyStateContent = () => {
    switch (type) {
      case "loading":
        return {
          icon: "⏳",
          text: "正在加载 LLM 配置",
          hint: "请稍候...",
        };
      case "no-config":
        return {
          icon: "⚙️",
          text: "尚未配置 AI 供应商",
          hint: "请在设置中保存连接参数后重试",
        };
      case "no-messages":
        return {
          icon: "💬",
          text: "开始与 AI 助手对话",
          hint: "输入消息开始聊天",
        };
      default:
        return {
          icon: "💬",
          text: "开始与 AI 助手对话",
          hint: "输入消息开始聊天",
        };
    }
  };

  const { icon, text, hint } = getEmptyStateContent();

  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <p className="empty-text">{text}</p>
      <p className="empty-hint">{hint}</p>
    </div>
  );
}
