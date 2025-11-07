"use client";

import { useState, useEffect, useCallback } from "react";
import { getStorage } from "@/app/lib/storage";
import type { LLMConfig } from "@/app/types/chat";
import { normalizeLLMConfig } from "@/app/lib/config-utils";

/**
 * 设置管理 Hook
 *
 * 提供设置的读取、保存和删除功能，
 * 自动处理加载状态和错误
 */
export function useStorageSettings() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  /**
   * 获取设置值
   */
  const getSetting = useCallback(
    async (key: string): Promise<string | null> => {
      try {
        const storage = await getStorage();
        return await storage.getSetting(key);
      } catch (err) {
        const error = err as Error;
        setError(error);
        throw error;
      }
    },
    [],
  );

  /**
   * 设置值
   */
  const setSetting = useCallback(
    async (key: string, value: string): Promise<void> => {
      try {
        const storage = await getStorage();
        await storage.setSetting(key, value);
      } catch (err) {
        const error = err as Error;
        setError(error);
        throw error;
      }
    },
    [],
  );

  /**
   * 删除设置
   */
  const deleteSetting = useCallback(async (key: string): Promise<void> => {
    try {
      const storage = await getStorage();
      await storage.deleteSetting(key);
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    }
  }, []);

  /**
   * 获取所有设置
   */
  const getAllSettings = useCallback(async () => {
    try {
      const storage = await getStorage();
      return await storage.getAllSettings();
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    }
  }, []);

  /**
   * 获取 LLM 配置（已规范化）
   */
  const getLLMConfig = useCallback(async (): Promise<LLMConfig | null> => {
    try {
      const value = await getSetting("llmConfig");
      if (!value) {
        return null;
      }
      const parsed = JSON.parse(value);
      // 规范化配置，确保格式正确
      return normalizeLLMConfig(parsed);
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    }
  }, [getSetting]);

  /**
   * 保存 LLM 配置（自动规范化）
   */
  const saveLLMConfig = useCallback(
    async (config: Partial<LLMConfig>): Promise<void> => {
      try {
        // 规范化配置后再保存
        const normalized = normalizeLLMConfig(config);
        await setSetting("llmConfig", JSON.stringify(normalized));
      } catch (err) {
        const error = err as Error;
        setError(error);
        throw error;
      }
    },
    [setSetting],
  );

  /**
   * 获取默认路径
   */
  const getDefaultPath = useCallback(async (): Promise<string | null> => {
    try {
      return await getSetting("defaultPath");
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    }
  }, [getSetting]);

  /**
   * 保存默认路径
   */
  const saveDefaultPath = useCallback(
    async (path: string): Promise<void> => {
      try {
        await setSetting("defaultPath", path);
      } catch (err) {
        const error = err as Error;
        setError(error);
        throw error;
      }
    },
    [setSetting],
  );

  // 初始化时检查存储可用性
  useEffect(() => {
    getStorage()
      .then(() => {
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err);
        setLoading(false);
      });
  }, []);

  return {
    loading,
    error,
    getSetting,
    setSetting,
    deleteSetting,
    getAllSettings,
    getLLMConfig,
    saveLLMConfig,
    getDefaultPath,
    saveDefaultPath,
  };
}
