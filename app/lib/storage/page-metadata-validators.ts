import { ErrorCodes } from "@/app/errors/error-codes";
import i18n from "@/app/i18n/client";
import { MAX_SVG_BLOB_BYTES } from "./constants";
import { buildPageMetadataFromXml } from "./page-metadata";

export type BinaryLike =
  | Blob
  | ArrayBuffer
  | ArrayBufferView
  | null
  | undefined;

export interface ResolvePageMetadataOptions {
  xmlContent: string;
  userPageCount?: number;
  userPageNames?: string | null;
}

export interface ResolvedPageMetadata {
  pageCount: number;
  pageNamesJson: string;
}

export function ensurePageCount(value?: number): number {
  if (typeof value !== "number" || Number.isNaN(value) || value < 1) {
    throw new Error(
      `[${ErrorCodes.STORAGE_INVALID_PAGE_COUNT}] ${i18n.t("errors:storage.invalidPageCount")}`,
    );
  }
  return Math.floor(value);
}

export function parsePageNamesJson(
  value: string | undefined | null,
): string[] | undefined {
  if (value == null) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(
      `[${ErrorCodes.STORAGE_INVALID_PAGE_NAMES}] ${i18n.t(
        "errors:storage.invalidPageNames",
        {
          message: error instanceof Error ? error.message : String(error),
        },
      )}`,
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error(
      `[${ErrorCodes.STORAGE_INVALID_PAGE_NAMES}] ${i18n.t("errors:storage.invalidPageNames")}`,
    );
  }
  parsed.forEach((item, index) => {
    if (typeof item !== "string") {
      throw new Error(
        `[${ErrorCodes.STORAGE_PAGE_NAME_NOT_STRING}] ${i18n.t(
          "errors:storage.pageNameNotString",
          {
            index,
          },
        )}`,
      );
    }
  });
  return parsed as string[];
}

export function resolvePageMetadataFromXml(
  options: ResolvePageMetadataOptions,
): ResolvedPageMetadata {
  const { xmlContent, userPageCount, userPageNames } = options;
  const meta = buildPageMetadataFromXml(xmlContent);
  const pageCount = ensurePageCount(userPageCount ?? meta.pageCount);
  const providedNames = parsePageNamesJson(userPageNames);
  const pageNames =
    providedNames?.slice(0, pageCount) ?? meta.pageNames.slice(0, pageCount);

  return {
    pageCount,
    pageNamesJson: JSON.stringify(pageNames),
  };
}

export function assertValidSvgBinary(
  blob: BinaryLike,
  label = "SVG 数据",
): void {
  if (!blob) {
    return;
  }

  let size = 0;
  if (blob instanceof Blob) {
    size = blob.size;
  } else if (blob instanceof ArrayBuffer) {
    size = blob.byteLength;
  } else if (ArrayBuffer.isView(blob)) {
    size = blob.byteLength;
  } else {
    return;
  }

  if (size > MAX_SVG_BLOB_BYTES) {
    const sizeMB = (size / (1024 * 1024)).toFixed(1);
    const maxMB = (MAX_SVG_BLOB_BYTES / (1024 * 1024)).toFixed(1);
    throw new Error(
      `[${ErrorCodes.STORAGE_SVG_TOO_LARGE}] ${i18n.t(
        "errors:storage.svgTooLarge",
        {
          label,
          size: sizeMB,
          max: maxMB,
        },
      )}`,
    );
  }
}
