"use client";

import { TextField, Label, Input, Description, Button } from "@heroui/react";

interface FileSettingsPanelProps {
  defaultPath: string;
  onChange: (path: string) => void;
  onBrowse: () => void;
}

/**
 * 文件设置面板组件
 * 配置 DrawIO 文件的默认保存路径
 */
export default function FileSettingsPanel({
  defaultPath,
  onChange,
  onBrowse,
}: FileSettingsPanelProps) {
  return (
    <div className="settings-panel">
      <h3 className="section-title">文件路径配置</h3>
      <p className="section-description">设置 DrawIO 文件的默认保存位置</p>

      <TextField className="w-full mt-6">
        <Label>默认启动路径</Label>
        <div className="flex gap-3 mt-3">
          <Input
            value={defaultPath}
            onChange={(e) => onChange(e.target.value)}
            placeholder="/path/to/folder"
            className="flex-1"
          />
          <Button
            variant="secondary"
            size="sm"
            className="button-small-optimized button-secondary"
            onPress={onBrowse}
          >
            浏览
          </Button>
        </div>
        <Description className="mt-3">
          保存文件时将优先使用此路径,仅在 Electron 环境下生效
        </Description>
      </TextField>
    </div>
  );
}
