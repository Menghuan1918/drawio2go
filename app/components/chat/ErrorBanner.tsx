"use client";

interface ErrorBannerProps {
  error: string | null;
}

export default function ErrorBanner({ error }: ErrorBannerProps) {
  if (!error) {
    return null;
  }

  return (
    <div className="error-banner">
      <span className="error-icon">⚠️</span>
      <div className="error-content">
        <div className="error-title">无法发送请求</div>
        <div className="error-message">{error}</div>
        <button
          className="error-retry"
          type="button"
          onClick={() => window.location.reload()}
        >
          刷新页面
        </button>
      </div>
    </div>
  );
}
