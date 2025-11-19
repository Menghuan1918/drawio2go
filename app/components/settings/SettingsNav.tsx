"use client";

import { Button } from "@heroui/react";
import { Folder, Bot, GitBranch } from "lucide-react";

/**
 * 设置标签类型
 */
export type SettingsTab = "file" | "llm" | "version";

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
        variant="tertiary"
        isIconOnly
        className={`settings-nav-item ${activeTab === "file" ? "active" : ""}`}
        onPress={() => onTabChange("file")}
        aria-label="文件配置"
      >
        <Folder size={24} />
      </Button>
      <Button
        variant="tertiary"
        isIconOnly
        className={`settings-nav-item ${activeTab === "llm" ? "active" : ""}`}
        onPress={() => onTabChange("llm")}
        aria-label="LLM 配置"
      >
        <Bot size={24} />
      </Button>
      <Button
        variant="tertiary"
        isIconOnly
        className={`settings-nav-item ${activeTab === "version" ? "active" : ""}`}
        onPress={() => onTabChange("version")}
        aria-label="版本"
      >
        <GitBranch size={24} />
      </Button>
    </div>
  );
}
