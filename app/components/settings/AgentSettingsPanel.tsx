"use client";

import SystemPromptEditor from "./SystemPromptEditor";
import { useAppTranslation } from "@/app/i18n/hooks";
import type { AgentSettings } from "@/app/types/chat";

interface AgentSettingsPanelProps {
  agentSettings: AgentSettings;
  onChange: (settings: AgentSettings) => void;
}

export default function AgentSettingsPanel({
  agentSettings,
  onChange,
}: AgentSettingsPanelProps) {
  const { t } = useAppTranslation("settings");

  const handleSystemPromptChange = (systemPrompt: string) => {
    onChange({
      ...agentSettings,
      systemPrompt,
      updatedAt: Date.now(),
    });
  };

  return (
    <div className="agent-settings-panel space-y-6 p-6">
      <div className="panel-header">
        <h3 className="text-lg font-semibold text-foreground">
          {t("agent.title")}
        </h3>
        <p className="text-sm text-default-500 mt-2">
          {t("agent.description")}
        </p>
      </div>

      <div className="system-prompt-section">
        <label className="block text-sm font-medium text-foreground mb-3">
          {t("agent.systemPrompt.label")}
        </label>
        <p className="text-sm text-default-500 mb-4">
          {t("agent.systemPrompt.description")}
        </p>
        <SystemPromptEditor
          value={agentSettings.systemPrompt}
          onChange={handleSystemPromptChange}
        />
      </div>

      <div className="text-xs text-default-400 border-t border-default-200 pt-4 mt-6">
        {t("agent.futureFeatures")}
      </div>
    </div>
  );
}
