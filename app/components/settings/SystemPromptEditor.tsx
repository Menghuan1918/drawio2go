"use client";

import { useState } from "react";
import { Button, Popover, Label, Description, TextArea } from "@heroui/react";
import { DEFAULT_SYSTEM_PROMPT } from "@/app/lib/config-utils";

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
        <Label>系统提示词</Label>
        <Button
          variant="secondary"
          size="sm"
          className="button-small-optimized button-secondary mt-3 w-full"
          onPress={handleOpen}
        >
          编辑系统提示词
        </Button>
        <Description className="mt-3">定义 AI 助手的行为和角色</Description>
      </div>
      <Popover.Content className="modal-overlay-popover" placement="bottom">
        <Popover.Dialog className="modal-content prompt-modal">
          <Popover.Heading className="modal-title">
            编辑系统提示词
          </Popover.Heading>
          <TextArea
            value={tempValue}
            onChange={(e) => setTempValue(e.target.value)}
            placeholder="输入系统提示词..."
            className="prompt-textarea"
            rows={15}
          />
          <div className="modal-actions">
            <Button
              variant="ghost"
              size="sm"
              className="sidebar-button"
              onPress={handleClose}
            >
              取消
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="sidebar-button button-secondary"
              onPress={handleReset}
            >
              恢复默认
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="sidebar-button button-primary"
              onPress={handleSave}
            >
              保存
            </Button>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
