"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  getStorage,
  persistWipVersion,
  prepareXmlContext,
} from "@/app/lib/storage";
import {
  getStoredCurrentProjectId,
  persistCurrentProjectId,
} from "@/app/lib/storage/current-project";
import type { Project } from "@/app/lib/storage";
import { createDefaultDiagramXml } from "@/app/lib/storage/default-diagram-xml";
import { generateProjectUUID, withTimeout } from "@/app/lib/utils";
import { createLogger } from "@/app/lib/logger";
import { ErrorCodes } from "@/app/errors/error-codes";
import i18n from "@/app/i18n/client";

const logger = createLogger("useCurrentProject");
const getStorageTimeoutMessage = (seconds: number) =>
  `[${ErrorCodes.STORAGE_TIMEOUT}] ${i18n.t("errors:storage.timeout", { seconds })}`;

/**
 * 当前工程管理 Hook
 *
 * 功能：
 * - 通过统一存储层读取/写入当前工程 ID（仅统一存储，不再使用 localStorage）
 * - 从统一存储层加载工程信息
 * - 如无工程，自动创建默认工程 "New Project"
 * - 提供工程切换功能
 * - 添加超时保护和 React 严格模式兼容
 */
export function useCurrentProject() {
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // 使用 ref 防止 React 严格模式双重挂载导致的重复加载
  const loadingRef = useRef(false);
  const mountedRef = useRef(true);

  /**
   * 创建默认工程 "New Project"
   */
  const createDefaultProject = useCallback(async (): Promise<Project> => {
    const storage = await getStorage();

    const uuid = generateProjectUUID();
    const now = Date.now();
    logger.info("开始创建默认工程", uuid);

    const newProject: Project = {
      uuid,
      name: "New Project",
      description: "默认工程",
      created_at: now,
      updated_at: now,
    };

    await storage.createProject(newProject);

    const defaultXml = createDefaultDiagramXml();
    const xmlContext = prepareXmlContext(defaultXml);

    const { versionId } = await persistWipVersion(uuid, xmlContext, {
      name: "初始版本",
      description: "默认空白画布",
      timestamp: now,
    });

    await storage.updateProject(uuid, {
      active_xml_version_id: versionId,
    });
    logger.info("默认工程创建完成并已激活", { projectUuid: uuid, versionId });

    return newProject;
  }, []);

  /**
   * 加载当前工程
   */
  const loadCurrentProject = useCallback(async () => {
    // 防止 React 严格模式双重挂载导致的重复加载
    if (loadingRef.current) {
      logger.warn("检测到重复加载请求，跳过本次执行");
      return;
    }
    loadingRef.current = true;

    try {
      setLoading(true);
      const storage = await withTimeout(
        getStorage(),
        5000,
        getStorageTimeoutMessage(5),
      );

      // 1. 检查统一存储层中的当前工程 ID
      let projectId = await withTimeout(
        getStoredCurrentProjectId(storage),
        3000,
        getStorageTimeoutMessage(3),
      );

      // 2. 如果没有，检查是否有任何工程
      if (!projectId) {
        const allProjects = await withTimeout(
          storage.getAllProjects(),
          5000,
          getStorageTimeoutMessage(5),
        );

        if (allProjects.length === 0) {
          // 3. 没有任何工程，创建默认工程
          const defaultProject = await withTimeout(
            createDefaultProject(),
            10000,
            getStorageTimeoutMessage(10),
          );
          projectId = defaultProject.uuid;
          await persistCurrentProjectId(projectId, storage);
          setCurrentProject(defaultProject);
          setLoading(false);
          logger.info("已创建默认工程并设为当前工程", projectId);
          return defaultProject;
        } else {
          // 4. 有工程，使用第一个
          projectId = allProjects[0].uuid;
          await persistCurrentProjectId(projectId, storage);
        }
      }

      // 5. 加载工程信息
      const project = await withTimeout(
        storage.getProject(projectId),
        5000,
        getStorageTimeoutMessage(5),
      );

      if (!project) {
        // 工程不存在，创建默认工程
        logger.warn("未找到项目，创建默认工程以恢复", { projectId });
        const defaultProject = await withTimeout(
          createDefaultProject(),
          10000,
          getStorageTimeoutMessage(10),
        );
        await persistCurrentProjectId(defaultProject.uuid, storage);
        setCurrentProject(defaultProject);
        setLoading(false);
        logger.info("已回退到默认工程", defaultProject.uuid);
        return defaultProject;
      }

      setCurrentProject(project);
      setLoading(false);
      logger.info("当前工程加载完成", project.uuid);
      return project;
    } catch (err) {
      const error = err as Error;
      logger.error("加载当前工程失败", error);
      setError(error);
      setLoading(false);
      throw error;
    } finally {
      loadingRef.current = false;
    }
  }, [createDefaultProject]);

  /**
   * 切换工程
   */
  const switchProject = useCallback(async (projectId: string) => {
    try {
      const storage = await getStorage();
      const project = await storage.getProject(projectId);
      if (!project) {
        throw new Error(
          i18n.t("errors:storage.projectNotFound", { projectId }),
        );
      }

      await persistCurrentProjectId(projectId, storage);
      setCurrentProject(project);
      return project;
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    }
  }, []);

  /**
   * 刷新当前工程信息
   */
  const refreshCurrentProject = useCallback(async () => {
    if (!currentProject) return;
    const storage = await getStorage();
    const updated = await storage.getProject(currentProject.uuid);
    if (updated) {
      setCurrentProject(updated);
    }
  }, [currentProject]);

  // 初始化时加载当前工程
  useEffect(() => {
    mountedRef.current = true;

    loadCurrentProject().catch((err) => {
      logger.error("初始化加载当前工程失败", err);
    });

    return () => {
      mountedRef.current = false;
      loadingRef.current = false;
    };
  }, [loadCurrentProject]);

  return {
    currentProject,
    loading,
    error,
    switchProject,
    refreshCurrentProject,
    loadCurrentProject,
  };
}
