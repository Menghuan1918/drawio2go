"use client";

import { Button } from "@heroui/react";
import { Folder, Bot } from "lucide-react";

/**
 * 设置标签类型
 */
export type SettingsTab = "file" | "llm";

interface SettingsNavProps {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}

/**
 * 设置侧边栏导航组件
 * 左侧图标导航栏，用于在文件配置和 LLM 配置之间切换
 */
export default function SettingsNav({
  activeTab,
  onTabChange,
}: SettingsNavProps) {
  return (
    <div className="settings-nav">
      <Button
        className={`settings-nav-item ${activeTab === "file" ? "active" : ""}`}
        onPress={() => onTabChange("file")}
        aria-label="文件配置"
      >
        <Folder size={24} />
      </Button>
      <Button
        className={`settings-nav-item ${activeTab === "llm" ? "active" : ""}`}
        onPress={() => onTabChange("llm")}
        aria-label="LLM 配置"
      >
        <Bot size={24} />
      </Button>
    </div>
  );
}
