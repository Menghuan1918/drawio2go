"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@heroui/react";

const THEME_STORAGE_KEY = "theme";

const readStoredTheme = (): "light" | "dark" | undefined => {
  if (typeof window === "undefined") return undefined;
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (value === "light" || value === "dark") return value;
    return undefined;
  } catch {
    return undefined;
  }
};

const writeStoredTheme = (value: "light" | "dark") => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, value);
  } catch {
    // 忽略无痕模式等环境的写入失败
  }
};

/**
 * 主题切换组件
 * 支持浅色/深色模式切换，并持久化到 localStorage
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  // 初始化主题
  useEffect(() => {
    setMounted(true);

    // 从 localStorage 读取保存的主题
    const savedTheme = readStoredTheme();

    if (savedTheme) {
      setTheme(savedTheme);
      applyTheme(savedTheme);
    } else {
      // 如果没有保存的主题，检测系统主题
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      const systemTheme = prefersDark ? "dark" : "light";
      setTheme(systemTheme);
      applyTheme(systemTheme);
    }
  }, []);

  // 监听系统主题变化
  useEffect(() => {
    if (!mounted) return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      // 只在没有手动设置主题时才跟随系统
      if (!readStoredTheme()) {
        const newTheme = e.matches ? "dark" : "light";
        setTheme(newTheme);
        applyTheme(newTheme);
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [mounted]);

  /**
   * 应用主题到 DOM
   */
  const applyTheme = (newTheme: "light" | "dark") => {
    const html = document.documentElement;

    if (newTheme === "dark") {
      html.classList.add("dark");
      html.classList.remove("light");
      html.setAttribute("data-theme", "drawio2go-dark");
    } else {
      html.classList.add("light");
      html.classList.remove("dark");
      html.setAttribute("data-theme", "drawio2go");
    }
  };

  /**
   * 切换主题
   */
  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    writeStoredTheme(newTheme);
    applyTheme(newTheme);
  };

  // 避免 hydration 不匹配
  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="w-9 h-9 p-0"
        aria-label="切换主题"
        isDisabled
      >
        <Sun className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-9 h-9 p-0 transition-all duration-300 hover:bg-accent/10"
      onPress={toggleTheme}
      aria-label={theme === "light" ? "切换到深色模式" : "切换到浅色模式"}
    >
      {theme === "light" ? (
        <Sun className="h-4 w-4 transition-transform duration-300 rotate-0 scale-100" />
      ) : (
        <Moon className="h-4 w-4 transition-transform duration-300 rotate-0 scale-100" />
      )}
    </Button>
  );
}
