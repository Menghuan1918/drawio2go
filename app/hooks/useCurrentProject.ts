"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  getStorage,
  DEFAULT_XML_VERSION,
  ZERO_SOURCE_VERSION_ID,
} from "@/app/lib/storage";
import {
  getStoredCurrentProjectId,
  persistCurrentProjectId,
} from "@/app/lib/storage/current-project";
import type { Project, CreateXMLVersionInput } from "@/app/lib/storage";

/**
 * 为 Promise 添加超时保护
 * @param promise 原始 Promise
 * @param timeoutMs 超时时间（毫秒）
 * @param timeoutMessage 超时错误消息
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new Error(timeoutMessage));
      }, timeoutMs);
    }),
  ]);
}

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
    console.log("🔄 [createDefaultProject] 开始创建默认工程");
    console.log("🔄 [createDefaultProject] 步骤 1: 获取存储实例");
    const storage = await getStorage();
    console.log("✅ [createDefaultProject] 步骤 1: 存储实例获取成功");

    const uuid = `project-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const now = Date.now();
    console.log(`🔄 [createDefaultProject] 步骤 2: 生成工程 UUID = ${uuid}`);

    const newProject: Project = {
      uuid,
      name: "New Project",
      description: "默认工程",
      created_at: now,
      updated_at: now,
    };

    console.log("🔄 [createDefaultProject] 步骤 3: 创建工程记录");
    await storage.createProject(newProject);
    console.log("✅ [createDefaultProject] 步骤 3: 工程记录创建成功");

    // 创建空白 XML 版本
    const emptyXML = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="drawio2go" agent="DrawIO2Go" version="24.7.17">
  <diagram name="Page-1" id="page1">
    <mxGraphModel dx="1434" dy="844" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

    const xmlVersionId = uuidv4();
    const xmlVersion: CreateXMLVersionInput = {
      id: xmlVersionId,
      project_uuid: uuid,
      semantic_version: DEFAULT_XML_VERSION,
      name: "初始版本",
      description: "默认空白画布",
      source_version_id: ZERO_SOURCE_VERSION_ID,
      xml_content: emptyXML,
      is_keyframe: true,
      diff_chain_depth: 0,
      metadata: null,
    };

    console.log(
      `🔄 [createDefaultProject] 步骤 4: 创建 XML 版本，ID = ${xmlVersionId}`,
    );
    const createdVersion = await storage.createXMLVersion(xmlVersion);
    console.log(
      `✅ [createDefaultProject] 步骤 4: XML 版本创建成功，ID = ${createdVersion.id}`,
    );

    // 更新工程的激活版本
    console.log("🔄 [createDefaultProject] 步骤 5: 更新工程的激活版本");
    await storage.updateProject(uuid, {
      active_xml_version_id: createdVersion.id,
    });
    console.log("✅ [createDefaultProject] 步骤 5: 激活版本更新成功");
    console.log("✅ [createDefaultProject] 默认工程创建完成");

    return newProject;
  }, []);

  /**
   * 加载当前工程
   */
  const loadCurrentProject = useCallback(async () => {
    // 防止 React 严格模式双重挂载导致的重复加载
    if (loadingRef.current) {
      console.log("⚠️ [loadCurrentProject] 已有加载任务在进行中，跳过");
      return;
    }
    loadingRef.current = true;

    console.log("🔄 [loadCurrentProject] 开始加载当前工程");
    try {
      setLoading(true);
      console.log("🔄 [loadCurrentProject] 步骤 0: 获取存储实例");
      const storage = await withTimeout(
        getStorage(),
        5000,
        "获取存储实例超时（5秒）",
      );
      console.log("✅ [loadCurrentProject] 步骤 0: 存储实例获取成功");

      // 1. 检查统一存储层中的当前工程 ID
      console.log("🔄 [loadCurrentProject] 步骤 1: 检查存储的当前工程 ID");
      let projectId = await withTimeout(
        getStoredCurrentProjectId(storage),
        3000,
        "获取当前工程 ID 超时（3秒）",
      );
      console.log(
        `✅ [loadCurrentProject] 步骤 1: 当前工程 ID = ${projectId || "null"}`,
      );

      // 2. 如果没有，检查是否有任何工程
      if (!projectId) {
        console.log(
          "🔄 [loadCurrentProject] 步骤 2: 未找到当前工程 ID，检查所有工程",
        );
        const allProjects = await withTimeout(
          storage.getAllProjects(),
          5000,
          "获取所有工程列表超时（5秒）",
        );
        console.log(
          `✅ [loadCurrentProject] 步骤 2: 找到 ${allProjects.length} 个工程`,
        );

        if (allProjects.length === 0) {
          // 3. 没有任何工程，创建默认工程
          console.log(
            "🔄 [loadCurrentProject] 步骤 3: 没有工程，创建默认工程",
          );
          const defaultProject = await withTimeout(
            createDefaultProject(),
            10000,
            "创建默认工程超时（10秒）",
          );
          console.log(
            `✅ [loadCurrentProject] 步骤 3: 默认工程创建成功，UUID = ${defaultProject.uuid}`,
          );
          projectId = defaultProject.uuid;
          await persistCurrentProjectId(projectId, storage);
          console.log("✅ [loadCurrentProject] 步骤 3: 已持久化当前工程 ID");
          setCurrentProject(defaultProject);
          setLoading(false);
          console.log("✅ [loadCurrentProject] 完成（创建新工程）");
          return defaultProject;
        } else {
          // 4. 有工程，使用第一个
          console.log(
            "🔄 [loadCurrentProject] 步骤 4: 使用第一个工程",
            allProjects[0],
          );
          projectId = allProjects[0].uuid;
          await persistCurrentProjectId(projectId, storage);
          console.log("✅ [loadCurrentProject] 步骤 4: 已持久化当前工程 ID");
        }
      }

      // 5. 加载工程信息
      console.log(
        `🔄 [loadCurrentProject] 步骤 5: 加载工程信息，ID = ${projectId}`,
      );
      const project = await withTimeout(
        storage.getProject(projectId),
        5000,
        "加载工程信息超时（5秒）",
      );
      console.log(
        `✅ [loadCurrentProject] 步骤 5: 工程信息加载${project ? "成功" : "失败（null）"}`,
      );

      if (!project) {
        // 工程不存在，创建默认工程
        console.log(
          "⚠️ [loadCurrentProject] 步骤 6: 工程不存在，创建默认工程",
        );
        const defaultProject = await withTimeout(
          createDefaultProject(),
          10000,
          "创建默认工程超时（10秒）",
        );
        console.log(
          `✅ [loadCurrentProject] 步骤 6: 默认工程创建成功，UUID = ${defaultProject.uuid}`,
        );
        await persistCurrentProjectId(defaultProject.uuid, storage);
        setCurrentProject(defaultProject);
        setLoading(false);
        console.log("✅ [loadCurrentProject] 完成（工程不存在，创建新工程）");
        return defaultProject;
      }

      setCurrentProject(project);
      setLoading(false);
      console.log(
        `✅ [loadCurrentProject] 完成（加载现有工程：${project.name}）`,
      );
      return project;
    } catch (err) {
      const error = err as Error;
      console.error("❌ [loadCurrentProject] 错误:", error);
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
  const switchProject = useCallback(
    async (projectId: string) => {
      try {
        const storage = await getStorage();
        const project = await storage.getProject(projectId);
        if (!project) {
          throw new Error(`工程不存在: ${projectId}`);
        }

        await persistCurrentProjectId(projectId, storage);
        setCurrentProject(project);
        return project;
      } catch (err) {
        const error = err as Error;
        setError(error);
        throw error;
      }
    },
    [],
  );

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
      console.error("Failed to load current project:", err);
    });

    return () => {
      mountedRef.current = false;
      loadingRef.current = false;
      console.log("🔴 [useCurrentProject] 组件卸载");
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
