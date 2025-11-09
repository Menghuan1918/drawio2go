"use client";

import { useState, useEffect, useCallback } from "react";
import { getStorage, DEFAULT_PROJECT_UUID } from "@/app/lib/storage";
import type { Project } from "@/app/lib/storage";

/**
 * 工程管理 Hook
 *
 * 支持多工程管理：获取、创建、更新工程
 */
export function useStorageProjects() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [defaultProject, setDefaultProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);

  /**
   * 获取所有工程列表
   */
  const getAllProjects = useCallback(async (): Promise<Project[]> => {
    try {
      const storage = await getStorage();
      const allProjects = await storage.getAllProjects();
      setProjects(allProjects);
      return allProjects;
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    }
  }, []);

  /**
   * 获取特定工程
   */
  const getProject = useCallback(
    async (uuid: string): Promise<Project | null> => {
      try {
        const storage = await getStorage();
        const project = await storage.getProject(uuid);
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
   * 创建新工程
   */
  const createProject = useCallback(
    async (name: string, description?: string): Promise<Project> => {
      try {
        const storage = await getStorage();
        const uuid = `project-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const now = Date.now();

        const newProject: Project = {
          uuid,
          name,
          description,
          created_at: now,
          updated_at: now,
        };

        await storage.createProject(newProject);
        await getAllProjects(); // 刷新列表
        return newProject;
      } catch (err) {
        const error = err as Error;
        setError(error);
        throw error;
      }
    },
    [getAllProjects],
  );

  /**
   * 更新工程信息
   */
  const updateProject = useCallback(
    async (
      uuid: string,
      updates: Partial<Omit<Project, "uuid" | "created_at" | "updated_at">>,
    ): Promise<void> => {
      try {
        const storage = await getStorage();
        await storage.updateProject(uuid, updates);
        await getAllProjects(); // 刷新列表
        if (uuid === DEFAULT_PROJECT_UUID) {
          await getDefaultProject(); // 刷新默认工程
        }
      } catch (err) {
        const error = err as Error;
        setError(error);
        throw error;
      }
    },
    [getAllProjects, getDefaultProject],
  );

  /**
   * 更新默认工程
   */
  const updateDefaultProject = useCallback(
    async (
      updates: Partial<Omit<Project, "uuid" | "created_at" | "updated_at">>,
    ): Promise<void> => {
      await updateProject(DEFAULT_PROJECT_UUID, updates);
    },
    [updateProject],
  );

  // 初始化时加载所有工程
  useEffect(() => {
    Promise.all([getAllProjects(), getDefaultProject()])
      .then(() => {
        setLoading(false);
      })
      .catch((err) => {
        setError(err);
        setLoading(false);
      });
  }, [getAllProjects, getDefaultProject]);

  return {
    loading,
    error,
    projects,
    defaultProject,
    getAllProjects,
    getProject,
    createProject,
    updateProject,
    getDefaultProject,
    updateDefaultProject,
  };
}
