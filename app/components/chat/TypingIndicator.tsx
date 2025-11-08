import React from "react";
import "./typing-indicator.css";

/**
 * AI打字机效果指示器组件
 * 显示一个脉冲缩放的圆点，表示AI正在输出内容
 */
export const TypingIndicator: React.FC = () => {
  return (
    <span className="typing-indicator" aria-label="AI正在输入">
      <span className="typing-dot"></span>
    </span>
  );
};
