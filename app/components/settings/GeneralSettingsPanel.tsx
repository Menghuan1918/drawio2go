"use client";

import { useCallback, useMemo } from "react";
import { Button, Description, Input, Label, TextField } from "@heroui/react";
import { FolderOpen } from "lucide-react";

import LanguageSwitcher from "../LanguageSwitcher";
import { useAppTranslation } from "@/app/i18n/hooks";

export interface GeneralSettingsPanelProps {
  defaultPath: string;
  onDefaultPathChange: (path: string) => void;
}

/**
 * 通用设置面板
 * - 语言切换
 * - 默认文件路径（Electron 环境下可用）
 */
export default function GeneralSettingsPanel({
  defaultPath,
  onDefaultPathChange,
}: GeneralSettingsPanelProps) {
  const { t } = useAppTranslation("settings");

  const canSelectFolder = useMemo(
    () => typeof window !== "undefined" && !!window.electron?.selectFolder,
    [],
  );

  const handleSelectPath = useCallback(async () => {
    if (!canSelectFolder) return;

    try {
      const selectedPath = await window.electron?.selectFolder();
      if (selectedPath) {
        onDefaultPathChange(selectedPath);
      }
    } catch (error) {
      console.error(t("errors.selectFolderFailed"), error);
    }
  }, [canSelectFolder, onDefaultPathChange, t]);

  return (
    <div className="settings-panel">
      <h3 className="section-title">{t("general.title")}</h3>
      <p className="section-description">{t("general.description")}</p>

      <LanguageSwitcher className="w-full mt-6" />

      <TextField className="w-full mt-6">
        <Label>{t("general.defaultPath.label")}</Label>
        <div className="flex gap-2 mt-3">
          <Input
            value={defaultPath}
            onChange={(e) => onDefaultPathChange(e.target.value)}
            placeholder={t(
              "general.defaultPath.placeholder",
              "/path/to/folder",
            )}
            className="flex-1"
          />
          <Button
            variant="secondary"
            size="sm"
            onPress={handleSelectPath}
            isDisabled={!canSelectFolder}
          >
            <FolderOpen className="h-4 w-4" />
            {t("general.defaultPath.selectButton")}
          </Button>
        </div>
        <Description className="mt-3">
          {t("general.defaultPath.description")}
        </Description>
      </TextField>
    </div>
  );
}
