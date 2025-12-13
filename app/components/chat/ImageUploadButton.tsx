"use client";

import { useCallback, useRef, type ChangeEvent } from "react";
import { Button } from "@heroui/react";
import { ImagePlus } from "lucide-react";

interface ImageUploadButtonProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  maxFiles?: number;
}

export default function ImageUploadButton({
  onFiles,
  disabled = false,
  maxFiles,
}: ImageUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handlePick = useCallback(() => {
    if (disabled) return;
    inputRef.current?.click();
  }, [disabled]);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const list = event.target.files;
      if (!list || list.length === 0) return;

      const picked = Array.from(list);
      const files =
        typeof maxFiles === "number" && maxFiles > 0
          ? picked.slice(0, maxFiles)
          : picked;

      onFiles(files);

      // 允许重复选择同一文件
      event.target.value = "";
    },
    [maxFiles, onFiles],
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleChange}
        disabled={disabled}
        aria-hidden
        tabIndex={-1}
      />

      <Button
        size="sm"
        variant="tertiary"
        isIconOnly
        className="chat-icon-button"
        aria-label="上传图片"
        isDisabled={disabled}
        onPress={handlePick}
      >
        <ImagePlus size={18} aria-hidden />
      </Button>
    </>
  );
}
