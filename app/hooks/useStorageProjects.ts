"use client";

import { useState, useEffect, useCallback } from "react";
import { getStorage, DEFAULT_PROJECT_UUID } from "@/app/lib/storage";
import type { Project } from "@/app/lib/storage";

/**
 * 工程管理 Hook
 *
 * 临时实现：仅查询默认工程
 * 未来扩展：支持多工程管理
 */
export function useStorageProjects() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [defaultProject, setDefaultProject] = useState<Project | null>(null);

  /**
   * 获取默认工程
   */
  const getDefaultProject = useCallback(async (): Promise<Project | null> => {
    try {
      const storage = await getStorage();
      const project = await storage.getProject(DEFAULT_PROJECT_UUID);
      setDefaultProject(project);
      return project;
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    }
  }, []);

  /**
   * 更新默认工程
   */
  const updateDefaultProject = useCallback(
    async (
      updates: Partial<Omit<Project, "uuid" | "created_at" | "updated_at">>,
    ): Promise<void> => {
      try {
        const storage = await getStorage();
        await storage.updateProject(DEFAULT_PROJECT_UUID, updates);
        await getDefaultProject(); // 刷新
      } catch (err) {
        const error = err as Error;
        setError(error);
        throw error;
      }
    },
    [getDefaultProject],
  );

  // 初始化时加载默认工程
  useEffect(() => {
    getDefaultProject()
      .then(() => {
        setLoading(false);
      })
      .catch((err) => {
        setError(err);
        setLoading(false);
      });
  }, [getDefaultProject]);

  return {
    loading,
    error,
    defaultProject,
    getDefaultProject,
    updateDefaultProject,
  };
}
