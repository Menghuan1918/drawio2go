import type { Metadata } from "next";
import "./globals.css";

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
    <html
      lang="zh-CN"
      className="light"
      data-theme="drawio2go"
      suppressHydrationWarning
    >
      <body className="bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
