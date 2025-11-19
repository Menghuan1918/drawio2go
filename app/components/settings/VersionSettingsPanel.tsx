"use client";

import { Description, Label, Switch } from "@heroui/react";

export interface VersionSettingsPanelProps {
  settings: {
    autoVersionOnAIEdit: boolean;
  };
  onChange: (settings: { autoVersionOnAIEdit: boolean }) => void;
}

/**
 * 版本管理设置面板
 * 控制 AI 编辑操作前的自动版本快照策略
 */
export function VersionSettingsPanel({
  settings,
  onChange,
}: VersionSettingsPanelProps) {
  const { autoVersionOnAIEdit } = settings;

  return (
    <div className="settings-panel flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h3 className="section-title">版本管理设置</h3>
        <p className="section-description">配置 AI 编辑相关的自动版本策略</p>
      </div>

      <div className="flex flex-col gap-2">
        {/* HeroUI Switch v3 暂未提供 onValueChange，使用 onChange 保持语义一致 */}
        <Switch
          isSelected={autoVersionOnAIEdit}
          onChange={(isSelected) =>
            onChange({ autoVersionOnAIEdit: Boolean(isSelected) })
          }
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Label className="text-sm text-foreground">AI 编辑自动版本</Label>
        </Switch>
        <Description className="text-sm text-default-500">
          AI 批量编辑或覆写 XML 前自动创建子版本快照
        </Description>
      </div>
    </div>
  );
}
