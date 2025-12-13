import type { Metadata } from "next";
import "./globals.css";
import I18nProvider from "@/app/components/I18nProvider";
import { AlertDialogProvider } from "@/app/components/alert";
import { ToastProvider } from "@/app/components/toast";
import { defaultLocale } from "@/app/i18n/config";

export const metadata: Metadata = {
  title: "DrawIO2Go - Electron DrawIO Editor",
  description: "基于 Electron + Next.js + HeroUI 构建的 DrawIO 编辑器",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang={defaultLocale} suppressHydrationWarning>
      <head>
        {/* 主题初始化脚本 - 在首次渲染前执行，避免闪烁 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const theme = localStorage.getItem('theme') ||
                    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

                  const html = document.documentElement;
                  if (theme === 'dark') {
                    html.classList.add('dark');
                    html.setAttribute('data-theme', 'drawio2go-dark');
                  } else {
                    html.classList.add('light');
                    html.setAttribute('data-theme', 'drawio2go');
                  }
                } catch (e) {
                  // 如果出错，默认使用浅色主题
                  document.documentElement.classList.add('light');
                  document.documentElement.setAttribute('data-theme', 'drawio2go');
                }
              })();
            `,
          }}
        />
      </head>
      <body className="bg-background text-foreground antialiased transition-colors duration-300">
        {/* 国际化上下文：同步 i18n 状态并维护 <html lang> */}
        <I18nProvider>
          <AlertDialogProvider>
            <ToastProvider>{children}</ToastProvider>
          </AlertDialogProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
