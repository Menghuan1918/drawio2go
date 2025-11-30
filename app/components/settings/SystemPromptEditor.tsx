"use client";

import { useState } from "react";
import {
  Button,
  Popover,
  Label,
  Description,
  TextArea,
  TextField,
} from "@heroui/react";
import { DEFAULT_SYSTEM_PROMPT } from "@/app/lib/config-utils";
import { useAppTranslation } from "@/app/i18n/hooks";

interface SystemPromptEditorProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * 系统提示词编辑器组件
 * 提供弹窗界面编辑系统提示词，支持恢复默认值
 */
export default function SystemPromptEditor({
  value,
  onChange,
}: SystemPromptEditorProps) {
  const { t } = useAppTranslation("settings");
  const [isOpen, setIsOpen] = useState(false);
  const [tempValue, setTempValue] = useState(value);

  const handleOpen = () => {
    setTempValue(value);
    setIsOpen(true);
  };

  const handleSave = () => {
    onChange(tempValue);
    setIsOpen(false);
  };

  const handleReset = () => {
    setTempValue(DEFAULT_SYSTEM_PROMPT);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  return (
    <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
      <div className="w-full mt-6">
        <Label>{t("systemPrompt.label")}</Label>
        <Button
          variant="secondary"
          size="sm"
          className="mt-3 w-full"
          onPress={handleOpen}
        >
          {t("systemPrompt.button")}
        </Button>
        <Description className="mt-3">
          {t("systemPrompt.description")}
        </Description>
      </div>
      <Popover.Content className="modal-overlay-popover" placement="bottom">
        <Popover.Dialog className="modal-content prompt-modal">
          <Popover.Heading className="modal-title">
            {t("systemPrompt.title")}
          </Popover.Heading>
          <TextField className="w-full">
            <Label>{t("systemPrompt.contentLabel")}</Label>
            <TextArea
              value={tempValue}
              onChange={(e) => setTempValue(e.target.value)}
              placeholder={t("systemPrompt.placeholder")}
              className="prompt-textarea"
              rows={15}
            />
          </TextField>
          <div className="modal-actions">
            <Button variant="ghost" size="sm" onPress={handleClose}>
              {t("systemPrompt.cancel")}
            </Button>
            <Button variant="secondary" size="sm" onPress={handleReset}>
              {t("systemPrompt.reset")}
            </Button>
            <Button variant="primary" size="sm" onPress={handleSave}>
              {t("systemPrompt.save")}
            </Button>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
