"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { validateImage, getImageDimensions } from "@/lib/image-utils";
import {
  MAX_IMAGES_PER_MESSAGE,
  MAX_IMAGE_SIZE_MB,
} from "@/lib/attachment-converter";
import { generateUUID } from "@/lib/utils";

export interface AttachmentItem {
  id: string; // UUID
  file: File;
  previewUrl: string; // object URL
  status: "ready" | "error";
  error?: string; // 错误消息（中文）
  width?: number;
  height?: number;
}

const MB_TO_BYTES = 1024 * 1024;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * MB_TO_BYTES;

const ALLOWED_IMAGE_MIME_TYPES = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

function normalizeMimeType(mimeType: string): string {
  return (mimeType || "").trim().toLowerCase();
}

function isAllowedImageMimeType(mimeType: string): boolean {
  return ALLOWED_IMAGE_MIME_TYPES.has(normalizeMimeType(mimeType));
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "图片校验失败，请更换图片或重试";
}

export function useImageAttachments() {
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const attachmentsRef = useRef<AttachmentItem[]>(attachments);
  const objectUrlsRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    const objectUrls = objectUrlsRef.current;
    return () => {
      for (const url of objectUrls.values()) {
        URL.revokeObjectURL(url);
      }
      objectUrls.clear();
    };
  }, []);

  const removeAttachment = useCallback((id: string) => {
    const url = objectUrlsRef.current.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      objectUrlsRef.current.delete(id);
    }
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    for (const url of objectUrlsRef.current.values()) {
      URL.revokeObjectURL(url);
    }
    objectUrlsRef.current.clear();
    setAttachments([]);
  }, []);

  const addFiles = useCallback(async (files: File[]): Promise<AttachmentItem[]> => {
    if (!Array.isArray(files) || files.length === 0) return [];

    const currentCount = attachmentsRef.current.length;
    const remainingSlots = MAX_IMAGES_PER_MESSAGE - currentCount;
    if (remainingSlots <= 0) {
      throw new Error(`最多只能上传 ${MAX_IMAGES_PER_MESSAGE} 张图片`);
    }

    const batch = files.slice(0, remainingSlots);
    const hasOverflow = files.length > remainingSlots;

    const nextItems = await Promise.all(
      batch.map(async (file): Promise<AttachmentItem> => {
        const id = generateUUID("attachment");
        const mimeType = normalizeMimeType(file.type);

        const makeErrorItem = (message: string): AttachmentItem => ({
          id,
          file,
          previewUrl: "",
          status: "error",
          error: message,
        });

        if (!isAllowedImageMimeType(mimeType)) {
          return makeErrorItem("不支持的图片格式");
        }

        if (file.size > MAX_IMAGE_SIZE_BYTES) {
          return makeErrorItem(`图片大小超过限制 (最大 ${MAX_IMAGE_SIZE_MB}MB)`);
        }

        const previewUrl = URL.createObjectURL(file);
        objectUrlsRef.current.set(id, previewUrl);

        try {
          await validateImage(file, mimeType);
          const { width, height } = await getImageDimensions(file);

          return {
            id,
            file,
            previewUrl,
            status: "ready",
            width,
            height,
          };
        } catch (error) {
          return {
            id,
            file,
            previewUrl,
            status: "error",
            error: extractErrorMessage(error),
          };
        }
      }),
    );

    setAttachments((prev) => [...prev, ...nextItems]);

    if (hasOverflow) {
      throw new Error(`最多只能上传 ${MAX_IMAGES_PER_MESSAGE} 张图片`);
    }
    return nextItems;
  }, []);

  const hasAttachments = useMemo(
    () => attachments.length > 0,
    [attachments],
  );

  return {
    attachments,
    addFiles,
    removeAttachment,
    clearAll,
    hasAttachments,
  };
}
