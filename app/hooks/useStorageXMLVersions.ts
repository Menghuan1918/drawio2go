"use client";

import { useState, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  getStorage,
  DEFAULT_PROJECT_UUID,
  WIP_VERSION,
  DEFAULT_FIRST_VERSION,
} from "@/app/lib/storage";
import type { XMLVersion } from "@/app/lib/storage";
import {
  computeVersionPayload,
  materializeVersionXml,
} from "@/app/lib/storage/xml-version-engine";

/**
 * XML 版本管理 Hook
 *
 * 临时实现：固定使用 semantic_version="1.0.0"
 * 未来扩展：支持多版本管理
 */
export function useStorageXMLVersions() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

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
    ): Promise<string> => {
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

        // 恢复 WIP 的完整 XML（WIP 始终是关键帧，直接使用）
        const wipXml = wipVersion.xml_content;

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

        // 保存新历史版本
        const newVersion = await storage.createXMLVersion({
          id: uuidv4(),
          project_uuid: projectUuid,
          semantic_version: semanticVersion,
          xml_content: payload.xml_content,
          preview_image: undefined,
          name: semanticVersion, // name 使用版本号
          description,
          metadata: null,
          is_keyframe: payload.is_keyframe,
          diff_chain_depth: payload.diff_chain_depth,
          source_version_id: payload.source_version_id,
        });

        setLoading(false);
        return newVersion.id;
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
   * 获取推荐的下一个版本号（minor 递增策略）
   *
   * @param projectUuid 项目 UUID
   * @returns 推荐的版本号（如 "1.1.0"）
   */
  const getRecommendedVersion = useCallback(
    async (projectUuid: string): Promise<string> => {
      setLoading(true);
      setError(null);

      try {
        const storage = await getStorage();

        // 获取所有历史版本（排除 WIP）
        const versions = await storage.getXMLVersionsByProject(projectUuid);
        const historicalVersions = versions
          .filter((v) => v.semantic_version !== WIP_VERSION)
          .map((v) => v.semantic_version)
          .sort((a, b) => {
            // 语义化版本排序
            const aParts = a.split(".").map(Number);
            const bParts = b.split(".").map(Number);
            for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
              const aNum = aParts[i] || 0;
              const bNum = bParts[i] || 0;
              if (aNum !== bNum) return bNum - aNum;
            }
            return 0;
          });

        if (historicalVersions.length === 0) {
          // 没有历史版本，推荐 1.0.0
          setLoading(false);
          return DEFAULT_FIRST_VERSION;
        }

        // 获取最大版本号并递增 minor 版本
        const latestVersion = historicalVersions[0];
        const parts = latestVersion.split(".").map(Number);

        if (parts.length >= 3) {
          // x.y.z 格式：递增 y，重置 z 为 0
          const [major, minor] = parts;
          setLoading(false);
          return `${major}.${minor + 1}.0`;
        } else if (parts.length === 4) {
          // x.y.z.h 格式：递增 z，重置 h 为 0
          const [major, minor, patch] = parts;
          setLoading(false);
          return `${major}.${minor}.${patch + 1}.0`;
        } else {
          // 异常情况，返回默认值
          setLoading(false);
          return DEFAULT_FIRST_VERSION;
        }
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
    (version: string): { valid: boolean; error?: string } => {
      // 检查格式：x.y.z 或 x.y.z.h
      const versionRegex = /^\d+\.\d+\.\d+(\.\d+)?$/;
      if (!versionRegex.test(version)) {
        return {
          valid: false,
          error: "版本号格式错误，应为 x.y.z 或 x.y.z.h 格式",
        };
      }

      // 不允许使用保留的 WIP 版本号
      if (version === WIP_VERSION) {
        return {
          valid: false,
          error: "0.0.0 是系统保留版本号，请使用其他版本号",
        };
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
    getXMLVersion,
    createHistoricalVersion,
    rollbackToVersion,
    getRecommendedVersion,
    validateVersion,
    isVersionExists,
  };
}
