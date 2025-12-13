"use client";

import { useEffect, useState, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/app/i18n/client";
import { defaultLocale } from "@/app/i18n/config";

type I18nProviderProps = {
  children: ReactNode;
  /**
   * 可选的服务端初始语言，用于 SSR/SSG 预渲染。
   */
  locale?: string;
};

// 安全获取 <html lang>，SSR/Electron 下可能不存在 window/document
const getDocumentLang = () => {
  if (typeof document === "undefined") return undefined;
  const lang = document.documentElement.lang;
  return lang?.trim() || undefined;
};

/**
 * 全局 i18n Provider：
 * - 监听语言变化并同步 <html lang>，确保可访问性
 * - 避免首屏访问 localStorage，兼容 SSR/SSG 和 Electron file:// 场景
 */
export function I18nProvider({ children, locale }: I18nProviderProps) {
  // 首次渲染仅使用安全来源（props/i18n/default），避免触发浏览器存储访问
  const [_language, setLanguage] = useState<string>(
    locale ?? i18n.language ?? getDocumentLang() ?? defaultLocale,
  );

  useEffect(() => {
    const initialLang =
      locale ?? i18n.language ?? getDocumentLang() ?? defaultLocale;

    // SSR/SSG 传入的 locale 语言优先级最高（htmlTag 仅作为兜底回退）
    if (initialLang && i18n.language !== initialLang) {
      void i18n.changeLanguage(initialLang);
    }

    // 确保 <html lang> 始终与 i18n 状态保持一致
    if (typeof document !== "undefined") {
      document.documentElement.lang = i18n.language || initialLang;
    }

    const handleLanguageChanged = (nextLang: string) => {
      setLanguage(nextLang);
      if (typeof document !== "undefined") {
        document.documentElement.lang = nextLang;
      }
    };

    i18n.on("languageChanged", handleLanguageChanged);
    return () => {
      i18n.off("languageChanged", handleLanguageChanged);
    };
  }, [locale]);

  const defaultNamespace: string | string[] | undefined = Array.isArray(
    i18n.options.defaultNS,
  )
    ? [...i18n.options.defaultNS]
    : typeof i18n.options.defaultNS === "string"
      ? i18n.options.defaultNS
      : undefined;

  return (
    <I18nextProvider i18n={i18n} defaultNS={defaultNamespace}>
      {children}
    </I18nextProvider>
  );
}

export default I18nProvider;
