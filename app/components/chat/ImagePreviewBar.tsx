"use client";

import { Button } from "@heroui/react";
import { Image as ImageIcon, X } from "lucide-react";
import Image from "next/image";
import type { AttachmentItem } from "@/app/hooks/useImageAttachments";

interface ImagePreviewBarProps {
  attachments: AttachmentItem[];
  onRemove: (id: string) => void;
}

const MB_TO_BYTES = 1024 * 1024;

function formatFileSize(bytes: number): string {
  const mb = bytes / MB_TO_BYTES;
  if (mb >= 0.1) {
    return `${mb.toFixed(1)} MB`;
  }
  const kb = bytes / 1024;
  return `${Math.max(1, Math.round(kb))} KB`;
}

export default function ImagePreviewBar({
  attachments,
  onRemove,
}: ImagePreviewBarProps) {
  if (!Array.isArray(attachments) || attachments.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="图片预览"
      className="flex w-full items-stretch gap-2 overflow-x-auto py-2"
    >
      {attachments.map((item) => {
        const isError = item.status === "error";
        const fileLabel = `${item.file.name} (${formatFileSize(item.file.size)})`;

        return (
          <div
            key={item.id}
            className={[
              "relative flex shrink-0 items-center gap-2 rounded-md border px-2 py-2",
              "bg-[var(--surface,#fff)]",
              isError
                ? "border-[var(--danger,#ef4444)]"
                : "border-[var(--border-default,var(--border,#e5e7eb))]",
            ].join(" ")}
            data-status={item.status}
          >
            <div
              className={[
                "h-16 w-16 overflow-hidden rounded-md",
                "bg-[var(--background,#fff)]",
                isError ? "ring-1 ring-[var(--danger,#ef4444)]" : "",
              ].join(" ")}
            >
              {item.previewUrl ? (
                <Image
                  src={item.previewUrl}
                  alt={item.file.name || "上传的图片"}
                  width={64}
                  height={64}
                  unoptimized
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[var(--foreground-secondary,#6b7280)]">
                  <ImageIcon size={20} aria-hidden />
                </div>
              )}
            </div>

            <div className="min-w-0 max-w-[220px]">
              <p
                className="truncate text-sm text-[var(--foreground,#0f172a)]"
                title={fileLabel}
              >
                {fileLabel}
              </p>

              {isError ? (
                <p className="mt-0.5 text-xs leading-snug text-[var(--danger,#ef4444)]">
                  {item.error ?? "图片不可用"}
                </p>
              ) : null}
            </div>

            <Button
              size="sm"
              variant="tertiary"
              isIconOnly
              className={[
                "ml-1 self-start",
                "h-7 w-7 min-w-0",
                "hover:bg-[color-mix(in_oklch,var(--danger,#ef4444)_18%,transparent)]",
                "hover:text-[var(--danger,#ef4444)]",
              ].join(" ")}
              aria-label={`移除图片：${item.file.name || "未命名"}`}
              onPress={() => onRemove(item.id)}
            >
              <X size={14} aria-hidden />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
