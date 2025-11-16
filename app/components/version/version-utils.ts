"use client";

/**
 * 版本组件共享工具方法
 * - BinarySource: 统一的二进制来源类型
 * - createBlobFromSource: 浏览器/Electron 通用的 Blob 构造器
 * - parsePageNames: page_names JSON 字段解析
 */

export type BinarySource =
  | Blob
  | ArrayBuffer
  | ArrayBufferView
  | { data?: number[]; buffer?: ArrayBufferLike | ArrayBufferView }
  | { buffer?: ArrayBufferLike }
  | { data?: number[] }
  | null
  | undefined;

function cloneArrayBufferLike(
  source: ArrayBufferLike,
  byteOffset = 0,
  length?: number,
): ArrayBuffer {
  const view = new Uint8Array(source, byteOffset, length ?? undefined);
  const clone = new Uint8Array(view.byteLength);
  clone.set(view);
  return clone.buffer;
}

export function createBlobFromSource(
  source: BinarySource,
  mimeType: string,
): Blob | null {
  if (!source) return null;
  if (source instanceof Blob) return source;

  if (source instanceof ArrayBuffer) {
    return new Blob([source.slice(0)], { type: mimeType });
  }

  if (ArrayBuffer.isView(source)) {
    const view = source as ArrayBufferView;
    if (view.buffer instanceof ArrayBuffer) {
      const cloned = view.buffer.slice(
        view.byteOffset,
        view.byteOffset + view.byteLength,
      );
      return new Blob([cloned], { type: mimeType });
    }
    const cloned = cloneArrayBufferLike(
      view.buffer as ArrayBufferLike,
      view.byteOffset,
      view.byteLength,
    );
    return new Blob([cloned], { type: mimeType });
  }

  if (
    typeof source === "object" &&
    source !== null &&
    "buffer" in source &&
    source.buffer
  ) {
    const bufferSource = source.buffer;
    if (bufferSource instanceof ArrayBuffer) {
      return new Blob([bufferSource.slice(0)], { type: mimeType });
    }
    if (ArrayBuffer.isView(bufferSource)) {
      const view = bufferSource as ArrayBufferView;
      const cloned = cloneArrayBufferLike(
        view.buffer as ArrayBufferLike,
        view.byteOffset,
        view.byteLength,
      );
      return new Blob([cloned], { type: mimeType });
    }
    const cloned = cloneArrayBufferLike(bufferSource as ArrayBufferLike);
    return new Blob([cloned], { type: mimeType });
  }

  if (
    typeof source === "object" &&
    source !== null &&
    "data" in source &&
    Array.isArray(source.data)
  ) {
    const cloned = Uint8Array.from(source.data ?? []);
    return new Blob([cloned.buffer], { type: mimeType });
  }

  return null;
}

export function parsePageNames(raw?: string | null) {
  if (!raw) return [] as string[];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((name, index) => {
      if (typeof name === "string" && name.trim().length > 0) {
        return name;
      }
      return `Page ${index + 1}`;
    });
  } catch (error) {
    console.warn("page_names 解析失败", error);
    return [];
  }
}
