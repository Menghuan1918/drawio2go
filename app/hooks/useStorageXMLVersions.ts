"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { RefObject } from "react";
import { ErrorCodes } from "@/app/errors/error-codes";
import i18n from "@/app/i18n/client";
import {
  getStorage,
  DEFAULT_PROJECT_UUID,
  WIP_VERSION,
  DEFAULT_FIRST_VERSION,
} from "@/app/lib/storage";
import type { XMLVersion, XMLVersionSVGData } from "@/app/lib/storage";
import type { DrawioEditorRef } from "@/app/components/DrawioEditorNative";
import {
  exportAllPagesSVG,
  serializeSVGsToBlob,
  type SvgExportProgress,
} from "@/app/lib/svg-export-utils";
import { compressBlob } from "@/app/lib/compression-utils";
import {
  filterSubVersions,
  getNextSubVersion,
  getParentVersion,
  isSubVersion,
} from "@/app/lib/version-utils";
import { runStorageTask, withTimeout } from "@/app/lib/utils";
import {
  persistHistoricalVersion,
  persistWipVersion,
  prepareXmlContext,
} from "@/app/lib/storage/writers";
import { materializeVersionXml } from "@/app/lib/storage/xml-version-engine";

const DEFAULT_STORAGE_TIMEOUT = 8000;
const getStorageTimeoutMessage = (
  seconds: number = DEFAULT_STORAGE_TIMEOUT / 1000,
) =>
  `[${ErrorCodes.STORAGE_TIMEOUT}] ${i18n.t("errors:storage.timeout", { seconds })}`;
const DEFAULT_TIMEOUT_MESSAGE = getStorageTimeoutMessage();

const withStorageTimeout = <T>(
  promise: Promise<T>,
  message: string = DEFAULT_TIMEOUT_MESSAGE,
) => withTimeout(promise, DEFAULT_STORAGE_TIMEOUT, message);

/**
 * XML 版本管理 Hook
 *
 * 临时实现：固定使用 semantic_version="1.0.0"
 * 未来扩展：支持多版本管理
 */
export type CreateHistoricalVersionOptions = {
  onExportProgress?: (progress: SvgExportProgress) => void;
};

export type CreateHistoricalVersionResult = {
  versionId: string;
  pageCount: number;
  svgAttached: boolean;
};

export function useStorageXMLVersions() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  /**
   * SVG 数据缓存上限：防止 Map 无限增长导致内存泄漏
   * 采用简单 LRU：命中时更新顺序，超限时淘汰最旧记录
   */
  const MAX_SVG_CACHE_SIZE = 50;
  const svgCacheRef = useRef<Map<string, XMLVersionSVGData>>(new Map());
  /**
   * 在内存中缓存最近一次加载的版本列表，按项目隔离以规避跨项目竞态
   */
  const versionsCacheRef = useRef<{
    projectUuid: string;
    versions: XMLVersion[];
    updatedAt: number;
  } | null>(null);
  const subscribersRef = useRef<
    Map<string, Set<(versions: XMLVersion[]) => void>>
  >(new Map());
  const resolveStorage = useCallback(
    () => withStorageTimeout(getStorage()),
    [],
  );

  const updateVersionsCache = useCallback(
    (projectUuid: string, versions: XMLVersion[]) => {
      versionsCacheRef.current = {
        projectUuid,
        versions,
        updatedAt: Date.now(),
      };
      const subscribers = subscribersRef.current.get(projectUuid);
      if (subscribers) {
        subscribers.forEach((callback) => {
          try {
            callback(versions);
          } catch (error) {
            console.warn("[useStorageXMLVersions] 订阅回调执行失败", error);
          }
        });
      }
    },
    [],
  );

  const loadVersionsForProject = useCallback(
    async (
      projectUuid: string,
      storage?: Awaited<ReturnType<typeof getStorage>>,
    ) => {
      const resolvedStorage = storage ?? (await resolveStorage());
      const versions = await withStorageTimeout(
        resolvedStorage.getXMLVersionsByProject(projectUuid),
      );
      updateVersionsCache(projectUuid, versions);
      return { storage: resolvedStorage, versions };
    },
    [resolveStorage, updateVersionsCache],
  );

  const subscribeVersions = useCallback(
    (
      projectUuid: string,
      onChange: (versions: XMLVersion[]) => void,
      onError?: (error: Error) => void,
    ) => {
      const existing = subscribersRef.current.get(projectUuid) ?? new Set();
      existing.add(onChange);
      subscribersRef.current.set(projectUuid, existing);

      let active = true;
      const cached = versionsCacheRef.current;
      if (cached && cached.projectUuid === projectUuid) {
        onChange(cached.versions);
      } else {
        loadVersionsForProject(projectUuid)
          .then(({ versions }) => {
            if (active) {
              onChange(versions);
            }
          })
          .catch((error) => {
            console.error("[useStorageXMLVersions] 初始化订阅失败", error);
            setError(error as Error);
            if (active && onError) {
              onError(error);
            }
          });
      }

      return () => {
        active = false;
        const current = subscribersRef.current.get(projectUuid);
        if (!current) return;
        current.delete(onChange);
        if (current.size === 0) {
          subscribersRef.current.delete(projectUuid);
        }
      };
    },
    [loadVersionsForProject],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleVersionEvent = (event: Event) => {
      const detail =
        (event as CustomEvent<{ projectUuid?: string }>).detail ?? {};
      const projectUuid =
        detail.projectUuid ?? versionsCacheRef.current?.projectUuid;
      if (!projectUuid) return;
      loadVersionsForProject(projectUuid).catch((error) => {
        console.error("[useStorageXMLVersions] 刷新版本缓存失败", error);
        setError(error as Error);
      });
    };

    window.addEventListener("version-updated", handleVersionEvent);
    window.addEventListener("wip-updated", handleVersionEvent);

    return () => {
      window.removeEventListener("version-updated", handleVersionEvent);
      window.removeEventListener("wip-updated", handleVersionEvent);
    };
  }, [loadVersionsForProject]);

  /**
   * 保存 XML 到 WIP 版本（活跃工作区）
   *
   * 始终保存到 semantic_version="0.0.0" 的 WIP 版本
   * 如果 WIP 版本已存在，则更新；否则创建新的
   *
   * @param xml XML 内容
   * @param projectUuid 工程 UUID（默认使用 DEFAULT_PROJECT_UUID）
   * @param previewImage 预览图（可选）
   * @param name 版本名称（可选）
   * @param description 版本描述（可选）
   * @returns WIP 版本的 ID
   */
  const saveXML = useCallback(
    async (
      xml: string,
      projectUuid: string = DEFAULT_PROJECT_UUID,
      previewImage?: Blob,
      name?: string,
      description?: string,
    ): Promise<string> => {
      return runStorageTask(
        async () => {
          const { versionId } = await persistWipVersion(projectUuid, xml, {
            previewImage,
            name: name || "WIP",
            description: description || "活跃工作区",
          });
          await loadVersionsForProject(projectUuid);
          return versionId;
        },
        { setLoading, setError },
      );
    },
    [loadVersionsForProject],
  );

  /**
   * 获取当前 XML（获取最新版本）
   *
   * @param projectUuid 工程 UUID（默认使用 DEFAULT_PROJECT_UUID）
   */
  const getCurrentXML = useCallback(
    async (
      projectUuid: string = DEFAULT_PROJECT_UUID,
    ): Promise<string | null> => {
      return runStorageTask(
        async () => {
          const { storage, versions } =
            await loadVersionsForProject(projectUuid);

          if (versions.length === 0) {
            return null;
          }

          const wipVersion = versions.find(
            (v) => v.semantic_version === WIP_VERSION,
          );
          const latest = wipVersion || versions[0];
          const resolved = await materializeVersionXml(latest, (id) =>
            withStorageTimeout(storage.getXMLVersion(id, projectUuid)),
          );
          return resolved;
        },
        { setLoading, setError },
      );
    },
    [loadVersionsForProject],
  );

  /**
   * 获取所有 XML 版本
   *
   * @param projectUuid 工程 UUID（默认使用 DEFAULT_PROJECT_UUID）
   */
  const getAllXMLVersions = useCallback(
    async (
      projectUuid: string = DEFAULT_PROJECT_UUID,
    ): Promise<XMLVersion[]> => {
      return runStorageTask(
        async () => {
          const { versions } = await loadVersionsForProject(projectUuid);
          return versions;
        },
        { setLoading, setError },
      );
    },
    [loadVersionsForProject],
  );

  /**
   * 获取指定主版本的所有子版本（基于最近一次缓存的版本列表）
   *
   * @param parentVersion 父版本号，如 "1.0.0"
   */
  const getSubVersions = useCallback(
    (projectUuid: string, parentVersion: string): XMLVersion[] => {
      const normalized = parentVersion?.trim();
      if (!normalized) return [];

      const cache = versionsCacheRef.current;
      if (!cache || cache.projectUuid !== projectUuid) {
        return [];
      }

      return filterSubVersions(cache.versions, normalized);
    },
    [],
  );

  /**
   * 获取指定版本
   */
  const getXMLVersion = useCallback(
    async (id: string, projectUuid?: string): Promise<XMLVersion | null> => {
      return runStorageTask(
        async () => {
          const storage = await resolveStorage();
          const resolvedProjectUuid =
            projectUuid ?? versionsCacheRef.current?.projectUuid;

          if (!resolvedProjectUuid) {
            throw new Error(
              `[${ErrorCodes.VERSION_CROSS_PROJECT_ERROR}] ${i18n.t("errors:version.securityProjectIdMissing")}`,
            );
          }

          return await withStorageTimeout(
            storage.getXMLVersion(id, resolvedProjectUuid),
          );
        },
        { setLoading, setError },
      );
    },
    [resolveStorage],
  );

  const getXMLVersionSVGData = useCallback(
    async (
      id: string,
      projectUuid?: string,
    ): Promise<XMLVersionSVGData | null> => {
      const cached = svgCacheRef.current.get(id);
      if (cached) {
        // 命中后移到队尾，维持 LRU 顺序
        svgCacheRef.current.delete(id);
        svgCacheRef.current.set(id, cached);
        return cached;
      }

      return runStorageTask(
        async () => {
          const storage = await resolveStorage();
          const resolvedProjectUuid =
            projectUuid ?? versionsCacheRef.current?.projectUuid;
          if (!resolvedProjectUuid) {
            throw new Error(
              `[${ErrorCodes.VERSION_CROSS_PROJECT_ERROR}] ${i18n.t("errors:version.securityProjectIdMissing")}`,
            );
          }
          const svgData = await withStorageTimeout(
            storage.getXMLVersionSVGData(id, resolvedProjectUuid),
          );
          if (svgData) {
            svgCacheRef.current.set(id, svgData);
            if (svgCacheRef.current.size > MAX_SVG_CACHE_SIZE) {
              const oldestKey = svgCacheRef.current.keys().next().value;
              if (oldestKey) {
                svgCacheRef.current.delete(oldestKey);
              }
            }
          }
          return svgData;
        },
        { setError },
      );
    },
    [resolveStorage],
  );

  /**
   * 获取指定版本的 SVG 大字段并与版本对象合并
   */
  const loadVersionSVGFields = useCallback(
    async (version: XMLVersion): Promise<XMLVersion> => {
      if (version.preview_svg || version.pages_svg) return version;
      const svgData = await getXMLVersionSVGData(
        version.id,
        version.project_uuid,
      );
      if (!svgData) return version;
      return { ...version, ...svgData } as XMLVersion;
    },
    [getXMLVersionSVGData],
  );

  /**
   * 从 WIP 创建历史版本快照
   *
   * @param projectUuid 项目 UUID
   * @param semanticVersion 版本号（如 "1.0.0"）
   * @param description 版本描述
   * @returns 新版本的 ID
   */
  const createHistoricalVersion = useCallback(
    async (
      projectUuid: string,
      semanticVersion: string,
      description?: string,
      editorRef?: RefObject<DrawioEditorRef | null>,
      options?: CreateHistoricalVersionOptions,
    ): Promise<CreateHistoricalVersionResult> => {
      return runStorageTask(
        async () => {
          const { storage, versions } =
            await loadVersionsForProject(projectUuid);
          const wipVersion = versions.find(
            (v) => v.semantic_version === WIP_VERSION,
          );

          if (!wipVersion) {
            throw new Error(
              `[${ErrorCodes.VERSION_WIP_NOT_FOUND}] ${i18n.t("errors:version.wipNotFound")}`,
            );
          }

          let wipXml = wipVersion.xml_content;
          try {
            if (editorRef?.current) {
              const exportedXml = await editorRef.current.exportDiagram();
              if (exportedXml && exportedXml.trim().length > 0) {
                wipXml = exportedXml;
              } else {
                console.warn(
                  "[useStorageXMLVersions] 实时导出 XML 为空，改用存储的 WIP XML",
                );
              }
            }
          } catch (exportErr) {
            console.error(
              "SVG 导出前导出 XML 失败，使用存储的 WIP XML",
              exportErr,
            );
          }

          const context = prepareXmlContext(wipXml);

          let previewSvg: Blob | undefined;
          let pagesSvgBlob: Blob | undefined;
          let svgPageNames: string[] | null = null;
          let exportError: Error | null = null;

          if (editorRef?.current) {
            try {
              const svgPages = await exportAllPagesSVG(
                editorRef.current,
                context.normalizedXml,
                {
                  onProgress: options?.onExportProgress,
                },
              );

              if (svgPages.length > 0) {
                const previewSource = new Blob([svgPages[0].svg], {
                  type: "image/svg+xml",
                });
                previewSvg = await compressBlob(previewSource);
                pagesSvgBlob = await serializeSVGsToBlob(svgPages);
                svgPageNames = svgPages.map((p) => p.name);
              }
            } catch (err) {
              exportError = err as Error;
              console.warn(
                "[useStorageXMLVersions] 导出 SVG 失败，已降级为仅存储 XML，错误:",
                exportError,
              );
            }
          }

          const persisted = await persistHistoricalVersion(
            projectUuid,
            context,
            semanticVersion,
            {
              description,
              previewSvg,
              pagesSvg: pagesSvgBlob,
              pageNamesOverride: svgPageNames,
            },
          );

          await loadVersionsForProject(projectUuid, storage);

          if (exportError) {
            console.info(
              "[useStorageXMLVersions] 版本已保存，但 SVG 未包含在记录中（导出失败）",
            );
          }

          return {
            versionId: persisted.versionId,
            pageCount: persisted.pageCount,
            svgAttached: Boolean(previewSvg && pagesSvgBlob),
          };
        },
        { setLoading, setError },
      );
    },
    [loadVersionsForProject],
  );

  /**
   * 回滚到指定历史版本
   * 将历史版本的内容覆盖到 WIP
   *
   * @param projectUuid 项目 UUID
   * @param versionId 目标版本 ID
   * @returns WIP 版本的 ID
   */
  const rollbackToVersion = useCallback(
    async (projectUuid: string, versionId: string): Promise<string> => {
      return runStorageTask(
        async () => {
          const storage = await resolveStorage();

          const targetVersion = await withStorageTimeout(
            storage.getXMLVersion(versionId, projectUuid),
          );
          if (!targetVersion) {
            throw new Error(
              `[${ErrorCodes.VERSION_RESTORE_FAILED}] ${i18n.t("errors:version.targetNotFound")}`,
            );
          }

          if (targetVersion.project_uuid !== projectUuid) {
            console.error("[rollbackToVersion] 拒绝跨项目回滚", {
              versionId,
              requestedProject: projectUuid,
              versionProject: targetVersion.project_uuid,
            });
            throw new Error(
              `[${ErrorCodes.VERSION_CROSS_PROJECT_ROLLBACK}] ${i18n.t(
                "errors:version.crossProjectRollback",
                {
                  versionId,
                  projectUuid,
                  targetProject: targetVersion.project_uuid,
                },
              )}`,
            );
          }

          const targetXml = await materializeVersionXml(targetVersion, (id) =>
            withStorageTimeout(storage.getXMLVersion(id, projectUuid)),
          );

          const wipVersionId = await saveXML(
            targetXml,
            projectUuid,
            undefined,
            "WIP",
            `回滚自版本 ${targetVersion.semantic_version}`,
          );

          return wipVersionId;
        },
        { setLoading, setError },
      );
    },
    [resolveStorage, saveXML],
  );

  /**
   * 获取推荐的下一个版本号
   *
   * @param projectUuid 项目 UUID
   * @param parentVersion 可选父版本：提供后返回子版本建议，否则返回主版本建议
   * @returns 推荐的版本号（如 "1.1.0" 或 "1.0.0.1"）
   */
  const getRecommendedVersion = useCallback(
    async (projectUuid: string, parentVersion?: string): Promise<string> => {
      return runStorageTask(
        async () => {
          const { versions } = await loadVersionsForProject(projectUuid);

          const normalizedParent = parentVersion?.trim();
          let recommended: string;

          if (normalizedParent) {
            recommended = getNextSubVersion(versions, normalizedParent);
          } else {
            const historicalVersions = versions
              .filter((v) => v.semantic_version !== WIP_VERSION)
              .map((v) => v.semantic_version)
              .filter((semanticVersion) => !isSubVersion(semanticVersion))
              .sort((a, b) => {
                const aParts = a.split(".").map(Number);
                const bParts = b.split(".").map(Number);
                for (
                  let i = 0;
                  i < Math.max(aParts.length, bParts.length);
                  i += 1
                ) {
                  const aNum = aParts[i] || 0;
                  const bNum = bParts[i] || 0;
                  if (aNum !== bNum) return bNum - aNum;
                }
                return 0;
              });

            if (historicalVersions.length === 0) {
              recommended = DEFAULT_FIRST_VERSION;
            } else {
              const latestVersion = historicalVersions[0];
              const parts = latestVersion.split(".").map(Number);

              if (parts.length === 3) {
                const [major, minor] = parts;
                recommended = `${major}.${minor + 1}.0`;
              } else {
                recommended = DEFAULT_FIRST_VERSION;
              }
            }
          }

          return recommended;
        },
        { setLoading, setError },
      );
    },
    [loadVersionsForProject],
  );

  /**
   * 验证版本号格式
   *
   * @param version 版本号字符串
   * @returns 是否有效及错误信息
   */
  const validateVersion = useCallback(
    (
      projectUuid: string,
      version: string,
    ): { valid: boolean; error?: string } => {
      const normalized = version.trim();
      if (!normalized) {
        return {
          valid: false,
          error: `[${ErrorCodes.VERSION_NUMBER_EMPTY}] ${i18n.t("errors:version.numberEmpty")}`,
        };
      }

      // 检查格式：x.y.z 或 x.y.z.h
      const versionRegex = /^\d+\.\d+\.\d+(\.\d+)?$/;
      if (!versionRegex.test(normalized)) {
        return {
          valid: false,
          error: `[${ErrorCodes.VERSION_FORMAT_INVALID}] ${i18n.t("errors:version.formatInvalid", { version: normalized })}`,
        };
      }

      // 不允许使用保留的 WIP 版本号
      if (normalized === WIP_VERSION) {
        return {
          valid: false,
          error: `[${ErrorCodes.VERSION_RESERVED}] ${i18n.t("errors:version.reserved")}`,
        };
      }

      if (isSubVersion(normalized)) {
        const parts = normalized.split(".");
        const sub = Number(parts[3]);

        if (!Number.isSafeInteger(sub)) {
          return {
            valid: false,
            error: `[${ErrorCodes.VERSION_SUB_INVALID}] ${i18n.t("errors:version.subInvalid")}`,
          };
        }

        if (sub < 1 || sub > 999) {
          return {
            valid: false,
            error: `[${ErrorCodes.VERSION_SUB_RANGE}] ${i18n.t("errors:version.subRange", { min: 1, max: 999 })}`,
          };
        }

        const parent = getParentVersion(normalized);
        const cache = versionsCacheRef.current;
        if (!cache || cache.projectUuid !== projectUuid) {
          return {
            valid: false,
            error: `[${ErrorCodes.VERSION_CACHE_INVALID}] ${i18n.t("errors:version.cacheInvalid")}`,
          };
        }

        const parentExists = cache.versions.some(
          (v) => v.semantic_version === parent,
        );

        if (!parentExists) {
          return {
            valid: false,
            error: `[${ErrorCodes.VERSION_PARENT_NOT_FOUND}] ${i18n.t("errors:version.parentNotFound", { parent })}`,
          };
        }
      }

      return { valid: true };
    },
    [],
  );

  /**
   * 检查版本号是否已存在
   *
   * @param projectUuid 项目 UUID
   * @param version 版本号
   * @returns 是否已存在
   */
  const isVersionExists = useCallback(
    async (projectUuid: string, version: string): Promise<boolean> => {
      return runStorageTask(
        async () => {
          const { versions } = await loadVersionsForProject(projectUuid);
          return versions.some((v) => v.semantic_version === version);
        },
        { setLoading, setError },
      );
    },
    [loadVersionsForProject],
  );

  return {
    loading,
    error,
    saveXML,
    getCurrentXML,
    getAllXMLVersions,
    getSubVersions,
    getXMLVersion,
    getXMLVersionSVGData,
    loadVersionSVGFields,
    createHistoricalVersion,
    rollbackToVersion,
    getRecommendedVersion,
    validateVersion,
    isVersionExists,
    subscribeVersions,
  };
}
