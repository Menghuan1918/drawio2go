import { ErrorCodes } from "@/app/errors/error-codes";
import i18n from "@/app/i18n/client";
import { XMLVersion } from "@/lib/storage/types";

/**
 * 允许的语义化版本格式：major.minor.patch 或 major.minor.patch.sub
 * 示例："1.0.0"、"2.5.3.4"。
 */
const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?$/;

/**
 * 解析后的版本数据结构。
 */
export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  sub?: number;
}

/**
 * 解析语义化版本号字符串。
 *
 * @param version - 待解析的版本号，如 "1.2.3" 或 "1.2.3.4"。
 * @returns 解析后的版本对象。
 * @throws 当版本号为空或不符合格式时抛出错误。
 */
export function parseVersion(version: string): ParsedVersion {
  const normalized = version?.trim();

  if (!normalized) {
    throw new Error(
      `[${ErrorCodes.VERSION_NUMBER_EMPTY}] ${i18n.t("errors:version.numberEmpty")}`,
    );
  }

  const match = VERSION_PATTERN.exec(normalized);

  if (!match) {
    throw new Error(
      `[${ErrorCodes.VERSION_FORMAT_INVALID}] ${i18n.t("errors:version.formatInvalid", { version })}`,
    );
  }

  const [, major, minor, patch, sub] = match;
  const parsed: ParsedVersion = {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
  };

  if (sub !== undefined) {
    parsed.sub = Number(sub);
  }

  return parsed;
}

/**
 * 判断给定版本号是否为子版本（四段式）。
 *
 * @param version - 待检测的版本号。
 * @returns true 表示为四段式子版本，否则为 false。
 */
export function isSubVersion(version: string): boolean {
  const parsed = tryParseVersion(version);
  return Boolean(parsed && typeof parsed.sub === "number");
}

/**
 * 返回子版本对应的父版本号。
 *
 * @param subVersion - 子版本号，如 "1.0.0.2"。
 * @returns 父版本号（如 "1.0.0"）；若输入不是有效子版本，则返回原始字符串。
 */
export function getParentVersion(subVersion: string): string {
  const parsed = tryParseVersion(subVersion);

  if (!parsed || parsed.sub === undefined) {
    return subVersion;
  }

  return formatParentVersion(parsed);
}

/**
 * 根据父版本筛选所有子版本。
 *
 * @param versions - XML 版本列表。
 * @param parentVersion - 父版本号，如 "1.0.0"。
 * @returns 归属于该父版本的子版本数组，按照原列表顺序返回。
 */
export function filterSubVersions(
  versions: XMLVersion[],
  parentVersion: string,
): XMLVersion[] {
  const parentKey = getParentVersionKey(parentVersion);

  if (!parentKey) {
    return [];
  }

  return versions.filter((version) => {
    const parsed = tryParseVersion(version.semantic_version);
    if (!parsed || parsed.sub === undefined) {
      return false;
    }

    return formatParentVersion(parsed) === parentKey;
  });
}

/**
 * 统计指定父版本下的子版本数量。
 *
 * @param versions - XML 版本列表。
 * @param parentVersion - 父版本号。
 * @returns 子版本的数量。
 */
export function countSubVersions(
  versions: XMLVersion[],
  parentVersion: string,
): number {
  return filterSubVersions(versions, parentVersion).length;
}

/**
 * 为指定父版本生成下一个子版本号。
 *
 * @param versions - XML 版本列表。
 * @param parentVersion - 父版本号。
 * @returns 推荐的下一个子版本号（如 "1.0.0.3"）。
 * @throws 当父版本号无效时抛出错误。
 */
export function getNextSubVersion(
  versions: XMLVersion[],
  parentVersion: string,
): string {
  const parentKey = getParentVersionKey(parentVersion);

  if (!parentKey) {
    throw new Error(
      `[${ErrorCodes.VERSION_FORMAT_INVALID}] ${i18n.t("errors:version.formatInvalid", { version: parentVersion })}`,
    );
  }

  const subVersions = filterSubVersions(versions, parentVersion);
  const maxSub = subVersions.reduce((currentMax, version) => {
    const parsed = tryParseVersion(version.semantic_version);
    if (!parsed || parsed.sub === undefined) {
      return currentMax;
    }

    return Math.max(currentMax, parsed.sub);
  }, 0);

  return `${parentKey}.${maxSub + 1}`;
}

/**
 * 尝试解析版本号，如失败则返回 null。
 */
function tryParseVersion(version: string): ParsedVersion | null {
  try {
    return parseVersion(version);
  } catch {
    return null;
  }
}

/**
 * 将解析结果格式化为父版本（x.y.z）。
 */
function formatParentVersion(parsed: ParsedVersion): string {
  return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
}

/**
 * 获取父版本的比较键，无效时返回 null。
 */
function getParentVersionKey(version: string): string | null {
  const parsed = tryParseVersion(version);
  if (!parsed) {
    return null;
  }

  return formatParentVersion(parsed);
}
