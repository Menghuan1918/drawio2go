"use client";

import { useState, useCallback } from "react";
import {
  getStorage,
  DEFAULT_PROJECT_UUID,
  DEFAULT_XML_VERSION,
} from "@/app/lib/storage";
import type { XMLVersion } from "@/app/lib/storage";

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
   * 保存 XML（创建新版本）
   *
   * @param xml XML 内容
   * @param projectUuid 工程 UUID（默认使用 DEFAULT_PROJECT_UUID）
   * @param previewImage 预览图（可选）
   * @param name 版本名称（可选）
   * @param description 版本描述（可选）
   * @returns 创建的 XML 版本
   */
  const saveXML = useCallback(
    async (
      xml: string,
      projectUuid: string = DEFAULT_PROJECT_UUID,
      previewImage?: Blob,
      name?: string,
      description?: string,
    ): Promise<XMLVersion> => {
      setLoading(true);
      setError(null);

      try {
        const storage = await getStorage();
        const version = await storage.createXMLVersion({
          project_uuid: projectUuid,
          semantic_version: DEFAULT_XML_VERSION,
          xml_content: xml,
          preview_image: previewImage,
          name,
          description,
          source_version_id: 0,
        });

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
   * 获取当前 XML（获取最新版本）
   *
   * @param projectUuid 工程 UUID（默认使用 DEFAULT_PROJECT_UUID）
   */
  const getCurrentXML = useCallback(
    async (projectUuid: string = DEFAULT_PROJECT_UUID): Promise<string | null> => {
      setLoading(true);
      setError(null);

      try {
        const storage = await getStorage();
        const versions = await storage.getXMLVersionsByProject(projectUuid);

        if (versions.length === 0) {
          setLoading(false);
          return null;
        }

        // 返回最新版本的 XML
        const latest = versions[0];
        setLoading(false);
        return latest.xml_content;
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
    async (projectUuid: string = DEFAULT_PROJECT_UUID): Promise<XMLVersion[]> => {
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
    async (id: number): Promise<XMLVersion | null> => {
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

  return {
    loading,
    error,
    saveXML,
    getCurrentXML,
    getAllXMLVersions,
    getXMLVersion,
  };
}
