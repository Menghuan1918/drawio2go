"use client";

import { Button } from "@heroui/react";
import {
  Settings,
  PenTool,
  BrainCircuit,
  Sparkles,
  GitBranch,
  Info,
} from "lucide-react";

import { useAppTranslation } from "@/app/i18n/hooks";

/**
 * 设置标签类型
 */
export type SettingsTab =
  | "general"
  | "drawio"
  | "models"
  | "agent"
  | "version"
  | "about";

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
  const { t } = useAppTranslation("settings");

  return (
    <div className="settings-nav">
      <Button
        variant="tertiary"
        isIconOnly
        className={`settings-nav-item ${activeTab === "general" ? "active" : ""}`}
        onPress={() => onTabChange("general")}
        aria-label={t("nav.general", { defaultValue: "General" })}
      >
        <Settings size={24} />
      </Button>
      <Button
        variant="tertiary"
        isIconOnly
        className={`settings-nav-item ${activeTab === "drawio" ? "active" : ""}`}
        onPress={() => onTabChange("drawio")}
        aria-label={t("nav.drawio", { defaultValue: "DrawIO" })}
      >
        <PenTool size={24} />
      </Button>
      <Button
        variant="tertiary"
        isIconOnly
        className={`settings-nav-item ${activeTab === "models" ? "active" : ""}`}
        onPress={() => onTabChange("models")}
        aria-label={t("nav.models", { defaultValue: "Models" })}
      >
        <BrainCircuit size={24} />
      </Button>
      <Button
        variant="tertiary"
        isIconOnly
        className={`settings-nav-item ${activeTab === "agent" ? "active" : ""}`}
        onPress={() => onTabChange("agent")}
        aria-label={t("nav.agent", { defaultValue: "Agent" })}
      >
        <Sparkles size={24} />
      </Button>
      <Button
        variant="tertiary"
        isIconOnly
        className={`settings-nav-item ${activeTab === "version" ? "active" : ""}`}
        onPress={() => onTabChange("version")}
        aria-label={t("nav.version", { defaultValue: "Version" })}
      >
        <GitBranch size={24} />
      </Button>
      <Button
        variant="tertiary"
        isIconOnly
        className={`settings-nav-item ${activeTab === "about" ? "active" : ""}`}
        onPress={() => onTabChange("about")}
        aria-label={t("nav.about", { defaultValue: "About" })}
      >
        <Info size={24} />
      </Button>
    </div>
  );
}
