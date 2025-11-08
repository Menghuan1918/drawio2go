"use client";

import { useState, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { getStorage, DEFAULT_PROJECT_UUID } from "@/app/lib/storage";
import type {
  Conversation,
  Message,
  CreateMessageInput,
} from "@/app/lib/storage";

/**
 * 对话管理 Hook
 *
 * 管理对话和消息的创建、读取、更新、删除
 */
export function useStorageConversations() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * 创建对话
   *
   * @param xmlVersionId 关联的 XML 版本 ID
   * @param title 对话标题
   * @returns 创建的对话
   */
  const createConversation = useCallback(
    async (
      xmlVersionId: number,
      title: string = "New Chat",
    ): Promise<Conversation> => {
      setLoading(true);
      setError(null);

      try {
        const storage = await getStorage();
        const conversation = await storage.createConversation({
          id: uuidv4(),
          project_uuid: DEFAULT_PROJECT_UUID,
          xml_version_id: xmlVersionId,
          title,
        });

        setLoading(false);
        return conversation;
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
   * 获取对话
   */
  const getConversation = useCallback(
    async (id: string): Promise<Conversation | null> => {
      setLoading(true);
      setError(null);

      try {
        const storage = await getStorage();
        const conversation = await storage.getConversation(id);
        setLoading(false);
        return conversation;
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
   * 更新对话
   */
  const updateConversation = useCallback(
    async (
      id: string,
      updates: Partial<Pick<Conversation, "title" | "xml_version_id">>,
    ): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        const storage = await getStorage();
        await storage.updateConversation(id, updates);
        setLoading(false);
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
   * 删除对话
   */
  const deleteConversation = useCallback(async (id: string): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const storage = await getStorage();
      await storage.deleteConversation(id);
      setLoading(false);
    } catch (err) {
      const error = err as Error;
      setError(error);
      setLoading(false);
      throw error;
    }
  }, []);

  /**
   * 获取所有对话
   */
  const getAllConversations = useCallback(async (): Promise<Conversation[]> => {
    setLoading(true);
    setError(null);

    try {
      const storage = await getStorage();
      const conversations =
        await storage.getConversationsByProject(DEFAULT_PROJECT_UUID);
      setLoading(false);
      return conversations;
    } catch (err) {
      const error = err as Error;
      setError(error);
      setLoading(false);
      throw error;
    }
  }, []);

  /**
   * 获取对话的所有消息
   */
  const getMessages = useCallback(
    async (conversationId: string): Promise<Message[]> => {
      setLoading(true);
      setError(null);

      try {
        const storage = await getStorage();
        const messages =
          await storage.getMessagesByConversation(conversationId);
        setLoading(false);
        return messages;
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
   * 添加消息
   */
  const addMessage = useCallback(
    async (
      conversationId: string,
      role: "user" | "assistant" | "system",
      content: string,
      toolInvocations?: unknown,
    ): Promise<Message> => {
      setLoading(true);
      setError(null);

      try {
        const storage = await getStorage();
        const message = await storage.createMessage({
          id: uuidv4(),
          conversation_id: conversationId,
          role,
          content,
          tool_invocations: toolInvocations
            ? JSON.stringify(toolInvocations)
            : undefined,
        });

        setLoading(false);
        return message;
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
   * 批量添加消息
   */
  const addMessages = useCallback(
    async (messages: CreateMessageInput[]): Promise<Message[]> => {
      setLoading(true);
      setError(null);

      try {
        const storage = await getStorage();
        const created = await storage.createMessages(messages);
        setLoading(false);
        return created;
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
    createConversation,
    getConversation,
    updateConversation,
    deleteConversation,
    getAllConversations,
    getMessages,
    addMessage,
    addMessages,
  };
}
