"use client";

import { TextField, Label, Input, Description, Button } from "@heroui/react";
import { useAppTranslation } from "@/app/i18n/hooks";

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
  const { t } = useAppTranslation("settings");

  return (
    <div className="settings-panel">
      <h3 className="section-title">{t("file.title")}</h3>
      <p className="section-description">{t("file.description")}</p>

      <TextField className="w-full mt-6">
        <Label>{t("file.defaultPath.label")}</Label>
        <div className="flex gap-3 mt-3">
          <Input
            value={defaultPath}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t("file.defaultPath.placeholder", "/path/to/folder")}
            className="flex-1"
          />
          <Button variant="secondary" size="sm" onPress={onBrowse}>
            {t("file.defaultPath.browse")}
          </Button>
        </div>
        <Description className="mt-3">
          {t("file.defaultPath.note")}
        </Description>
      </TextField>
    </div>
  );
}
