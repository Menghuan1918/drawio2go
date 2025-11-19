"use client";

import { useState, useCallback, useRef } from "react";
import type { RefObject } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  getStorage,
  DEFAULT_PROJECT_UUID,
  WIP_VERSION,
  DEFAULT_FIRST_VERSION,
  buildPageMetadataFromXml,
} from "@/app/lib/storage";
import type { XMLVersion, XMLVersionSVGData } from "@/app/lib/storage";
import type { DrawioEditorRef } from "@/app/components/DrawioEditorNative";
import {
  computeVersionPayload,
  materializeVersionXml,
} from "@/app/lib/storage/xml-version-engine";
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
      setLoading(true);
      setError(null);

      try {
        const storage = await getStorage();
        const pageMetadata = buildPageMetadataFromXml(xml);
        const pageNamesJson = JSON.stringify(pageMetadata.pageNames);

        // 始终保存到 WIP 版本
        const payload = await computeVersionPayload({
          newXml: xml,
          semanticVersion: WIP_VERSION,
          latestVersion: null, // WIP 不依赖 latestVersion
          resolveVersionById: (id) => storage.getXMLVersion(id),
        });

        if (!payload) {
          throw new Error("无法计算 WIP 版本数据");
        }

        // 检查 WIP 版本是否已存在
        const existingVersions =
          await storage.getXMLVersionsByProject(projectUuid);
        versionsCacheRef.current = {
          projectUuid,
          versions: existingVersions,
          updatedAt: Date.now(),
        };
        const wipVersion = existingVersions.find(
          (v) => v.semantic_version === WIP_VERSION,
        );

        let versionId: string;
        const timestamp = Date.now();

        if (wipVersion) {
          // 更新现有 WIP 版本
          await storage.updateXMLVersion(wipVersion.id, {
            project_uuid: projectUuid,
            semantic_version: WIP_VERSION,
            xml_content: payload.xml_content,
            preview_image: previewImage,
            name: name || "WIP",
            description: description || "活跃工作区",
            metadata: null,
            is_keyframe: payload.is_keyframe,
            diff_chain_depth: payload.diff_chain_depth,
            source_version_id: payload.source_version_id,
            page_count: pageMetadata.pageCount,
            page_names: pageNamesJson,
            created_at: timestamp,
          });
          versionId = wipVersion.id;
        } else {
          // 创建新的 WIP 版本
          const newVersion = await storage.createXMLVersion({
            id: uuidv4(),
            project_uuid: projectUuid,
            semantic_version: WIP_VERSION,
            xml_content: payload.xml_content,
            preview_image: previewImage,
            name: name || "WIP",
            description: description || "活跃工作区",
            metadata: null,
            is_keyframe: payload.is_keyframe,
            diff_chain_depth: payload.diff_chain_depth,
            source_version_id: payload.source_version_id,
            page_count: pageMetadata.pageCount,
            page_names: pageNamesJson,
          });
          versionId = newVersion.id;
        }

        setLoading(false);
        return versionId;
      } catch (err) {
        const error = err as Error;
        setError(error);
        setLoading(false);
        throw error;
      }
    },
    [],
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
      setLoading(true);
      setError(null);

      try {
        const storage = await getStorage();
        const versions = await storage.getXMLVersionsByProject(projectUuid);
        versionsCacheRef.current = {
          projectUuid,
          versions,
          updatedAt: Date.now(),
        };

        if (versions.length === 0) {
          setLoading(false);
          return null;
        }

        // 优先返回 WIP 版本（用户最新编辑）
        // 避免在创建历史快照后错误加载快照而非 WIP
        const wipVersion = versions.find(
          (v) => v.semantic_version === WIP_VERSION,
        );
        const latest = wipVersion || versions[0];
        setLoading(false);
        const resolved = await materializeVersionXml(latest, (id) =>
          storage.getXMLVersion(id),
        );
        return resolved;
      } catch (err) {
        const error = err as Error;
        setError(error);
        setLoading(false);
        throw error;
      }
    },
    [],
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
      setLoading(true);
      setError(null);

      try {
        const storage = await getStorage();
        const versions = await storage.getXMLVersionsByProject(projectUuid);
        versionsCacheRef.current = {
          projectUuid,
          versions,
          updatedAt: Date.now(),
        };
        setLoading(false);
        return versions;
      } catch (err) {
        const error = err as Error;
        setError(error);
        setLoading(false);
        throw error;
      }
    },
    [],
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
    async (id: string): Promise<XMLVersion | null> => {
      setLoading(true);
      setError(null);

      try {
        const storage = await getStorage();
        const version = await storage.getXMLVersion(id);
        setLoading(false);
        return version;
      } catch (err) {
        const error = err as Error;
        setError(error);
        setLoading(false);
        throw error;
      }
    },
    [],
  );

  const getXMLVersionSVGData = useCallback(
    async (id: string): Promise<XMLVersionSVGData | null> => {
      const cached = svgCacheRef.current.get(id);
      if (cached) {
        // 命中后移到队尾，维持 LRU 顺序
        svgCacheRef.current.delete(id);
        svgCacheRef.current.set(id, cached);
        return cached;
      }

      try {
        const storage = await getStorage();
        const svgData = await storage.getXMLVersionSVGData(id);
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
      } catch (err) {
        const error = err as Error;
        setError(error);
        throw error;
      }
    },
    [],
  );

  /**
   * 获取指定版本的 SVG 大字段并与版本对象合并
   */
  const loadVersionSVGFields = useCallback(
    async (version: XMLVersion): Promise<XMLVersion> => {
      if (version.preview_svg || version.pages_svg) return version;
      const svgData = await getXMLVersionSVGData(version.id);
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
      setLoading(true);
      setError(null);

      try {
        const storage = await getStorage();
        // 获取当前 WIP 版本的内容
        const versions = await storage.getXMLVersionsByProject(projectUuid);
        const wipVersion = versions.find(
          (v) => v.semantic_version === WIP_VERSION,
        );

        if (!wipVersion) {
          throw new Error("WIP 版本不存在，无法创建快照");
        }

        // 优先从编辑器实时导出最新 XML，若不可用则回退到存储中的 WIP XML
        let wipXml = wipVersion.xml_content;
        try {
          if (editorRef?.current) {
            const exportedXml = await editorRef.current.exportDiagram();
            if (exportedXml && exportedXml.trim().length > 0) {
              wipXml = exportedXml;
            } else {
              console.warn("⚠️ 实时导出 XML 为空，改用存储的 WIP XML");
            }
          }
        } catch (exportErr) {
          console.error(
            "SVG 导出前导出 XML 失败，使用存储的 WIP XML",
            exportErr,
          );
        }

        // 获取最后一个历史版本作为 source_version
        const historicalVersions = versions
          .filter((v) => v.semantic_version !== WIP_VERSION)
          .sort((a, b) => b.created_at - a.created_at);
        const lastHistoricalVersion = historicalVersions[0];

        // 计算新版本的存储策略（关键帧 or Diff）
        const payload = await computeVersionPayload({
          newXml: wipXml,
          semanticVersion,
          latestVersion: lastHistoricalVersion ?? null,
          resolveVersionById: (id) => storage.getXMLVersion(id),
        });

        if (!payload) {
          throw new Error("无法计算历史版本数据");
        }

        // 默认的页面元数据（从 XML 解析）
        const pageMetadata = buildPageMetadataFromXml(wipXml);

        // 导出 SVG（可选，失败则降级为仅 XML 存储）
        let previewSvg: Blob | undefined;
        let pagesSvgBlob: Blob | undefined;
        let svgPageNames: string[] | null = null;
        let exportError: Error | null = null;

        if (editorRef?.current) {
          try {
            const svgPages = await exportAllPagesSVG(
              editorRef.current,
              wipXml,
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
              "⚠️ 导出 SVG 失败，已降级为仅存储 XML，错误:",
              exportError,
            );
          }
        }

        const finalPageNames = svgPageNames ?? pageMetadata.pageNames;
        const finalPageCount = svgPageNames?.length ?? pageMetadata.pageCount;

        if (!finalPageCount || finalPageCount < 1) {
          throw new Error("未能解析到有效的页面数据，无法创建版本");
        }

        // 保存新历史版本
        const newVersion = await storage.createXMLVersion({
          id: uuidv4(),
          project_uuid: projectUuid,
          semantic_version: semanticVersion,
          xml_content: payload.xml_content,
          preview_image: undefined,
          preview_svg: previewSvg,
          pages_svg: pagesSvgBlob,
          name: semanticVersion, // name 使用版本号
          description,
          metadata: null,
          is_keyframe: payload.is_keyframe,
          diff_chain_depth: payload.diff_chain_depth,
          source_version_id: payload.source_version_id,
          page_count: finalPageCount,
          page_names: JSON.stringify(finalPageNames),
        });

        // 刷新缓存以包含最新创建的版本
        const updatedVersions =
          await storage.getXMLVersionsByProject(projectUuid);
        versionsCacheRef.current = {
          projectUuid,
          versions: updatedVersions,
          updatedAt: Date.now(),
        };

        setLoading(false);
        if (exportError) {
          // 将 SVG 导出失败视为软错误，仅记录日志
          console.info("已完成版本创建，但 SVG 未包含在记录中（导出失败）");
        }
        return {
          versionId: newVersion.id,
          pageCount: finalPageCount,
          svgAttached: Boolean(previewSvg && pagesSvgBlob),
        };
      } catch (err) {
        const error = err as Error;
        setError(error);
        setLoading(false);
        throw error;
      }
    },
    [],
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
      setLoading(true);
      setError(null);

      try {
        const storage = await getStorage();

        // 获取目标版本
        const targetVersion = await storage.getXMLVersion(versionId);
        if (!targetVersion) {
          throw new Error("目标版本不存在");
        }

        // 恢复目标版本的完整 XML
        const targetXml = await materializeVersionXml(targetVersion, (id) =>
          storage.getXMLVersion(id),
        );

        // 将目标版本的内容写入 WIP
        const wipVersionId = await saveXML(
          targetXml,
          projectUuid,
          undefined,
          "WIP",
          `回滚自版本 ${targetVersion.semantic_version}`,
        );

        setLoading(false);
        return wipVersionId;
      } catch (err) {
        const error = err as Error;
        setError(error);
        setLoading(false);
        throw error;
      }
    },
    [saveXML],
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
      setLoading(true);
      setError(null);

      try {
        const storage = await getStorage();
        const versions = await storage.getXMLVersionsByProject(projectUuid);
        versionsCacheRef.current = {
          projectUuid,
          versions,
          updatedAt: Date.now(),
        };

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
            // 推荐策略: 基于最新主版本递增 minor 版本号
            // 例如: 1.2.0 -> 1.3.0
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

        setLoading(false);
        return recommended;
      } catch (err) {
        const error = err as Error;
        setError(error);
        setLoading(false);
        throw error;
      }
    },
    [],
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
          error: "版本号不能为空",
        };
      }

      // 检查格式：x.y.z 或 x.y.z.h
      const versionRegex = /^\d+\.\d+\.\d+(\.\d+)?$/;
      if (!versionRegex.test(normalized)) {
        return {
          valid: false,
          error: "版本号格式错误，应为 x.y.z 或 x.y.z.h 格式",
        };
      }

      // 不允许使用保留的 WIP 版本号
      if (normalized === WIP_VERSION) {
        return {
          valid: false,
          error: "0.0.0 是系统保留版本号，请使用其他版本号",
        };
      }

      if (isSubVersion(normalized)) {
        const parts = normalized.split(".");
        const sub = Number(parts[3]);

        if (!Number.isSafeInteger(sub)) {
          return {
            valid: false,
            error: "子版本号必须为有效整数",
          };
        }

        if (sub < 1 || sub > 999) {
          return {
            valid: false,
            error: "子版本号范围必须在 1-999 之间",
          };
        }

        const parent = getParentVersion(normalized);
        const cache = versionsCacheRef.current;
        if (!cache || cache.projectUuid !== projectUuid) {
          return {
            valid: false,
            error: "当前项目版本缓存失效，请先重新加载版本列表",
          };
        }

        const parentExists = cache.versions.some(
          (v) => v.semantic_version === parent,
        );

        if (!parentExists) {
          return {
            valid: false,
            error: `父版本 ${parent} 不存在，请先创建主版本`,
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
      setLoading(true);
      setError(null);

      try {
        const storage = await getStorage();
        const versions = await storage.getXMLVersionsByProject(projectUuid);
        versionsCacheRef.current = {
          projectUuid,
          versions,
          updatedAt: Date.now(),
        };
        const exists = versions.some((v) => v.semantic_version === version);
        setLoading(false);
        return exists;
      } catch (err) {
        const error = err as Error;
        setError(error);
        setLoading(false);
        throw error;
      }
    },
    [],
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
  };
}
