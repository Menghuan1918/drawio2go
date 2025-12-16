/**
 * DrawIO Socket.IO Hook
 *
 * 用于在前端建立 Socket.IO 连接，监听后端的工具调用请求并执行
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import type { DrawioEditorRef } from "@/app/components/DrawioEditorNative";
import { io, Socket } from "socket.io-client";
import type {
  ToolCallRequest,
  ToolCallResult,
  ServerToClientEvents,
  ClientToServerEvents,
} from "@/app/types/socket-protocol";
import { getDrawioXML, replaceDrawioXML } from "@/app/lib/drawio-tools";
import { useStorageXMLVersions } from "./useStorageXMLVersions";
import { useStorageSettings } from "./useStorageSettings";
import {
  getNextSubVersion,
  getParentVersion,
  isSubVersion,
  parseVersion,
} from "@/lib/version-utils";
import { DEFAULT_FIRST_VERSION, WIP_VERSION } from "@/app/lib/storage";
import { createLogger } from "@/lib/logger";
import { toErrorString } from "@/lib/error-handler";
import { CLIENT_TOOL_NAMES } from "@/lib/constants/tool-names";
import {
  getActiveChatRun,
  isChatRunCancelled,
} from "@/app/lib/chat-run-registry";

const logger = createLogger("Socket Client");
const { GET_DRAWIO_XML, REPLACE_DRAWIO_XML, EXPORT_DRAWIO } = CLIENT_TOOL_NAMES;
const TOOL_RESULT_EVENT = "tool:result";

type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnecting"
  | "disconnected";

type ToolResultLike = {
  success: boolean;
  error?: unknown;
  message?: unknown;
};

function buildToolCallErrorMessage(
  errorValue: unknown,
  messageValue: unknown,
): string | undefined {
  const errorText =
    errorValue === undefined || errorValue === null
      ? ""
      : toErrorString(errorValue).trim();
  const messageText =
    messageValue === undefined || messageValue === null
      ? ""
      : toErrorString(messageValue).trim();

  if (!errorText && !messageText) return undefined;
  if (!errorText) return messageText;
  if (!messageText) return errorText;

  if (errorText === messageText) return errorText;
  const existingParts = errorText
    .split(" | ")
    .map((part) => part.trim())
    .filter(Boolean);
  if (existingParts.includes(messageText)) return errorText;

  return `${errorText} | ${messageText}`;
}

function resolveToolCallError(result: ToolResultLike): string | undefined {
  if (result.success) return undefined;
  return buildToolCallErrorMessage(result.error, result.message);
}

/**
 * DrawIO Socket.IO Hook
 *
 * @param editorRef 可选 DrawIO 编辑器引用，供自动版本快照导出 XML/SVG
 * @param projectUuid 当前项目 UUID（由上层统一来源传入，避免多处 useCurrentProject 状态不同步）
 * @returns { isConnected: boolean } - Socket.IO 连接状态
 */
export function useDrawioSocket(
  editorRef?: React.RefObject<DrawioEditorRef | null>,
  projectUuid?: string | null,
) {
  const [connectionStatus, setConnectionStatusState] =
    useState<ConnectionStatus>("connecting");
  const connectionStatusRef = useRef<ConnectionStatus>("connecting");
  const socketRef = useRef<Socket<
    ServerToClientEvents,
    ClientToServerEvents
  > | null>(null);
  const { createHistoricalVersion, getAllXMLVersions } =
    useStorageXMLVersions();
  const { getSetting } = useStorageSettings();
  const normalizedProjectUuid = (projectUuid ?? "").trim() || null;
  const projectUuidRef = useRef<string | null>(normalizedProjectUuid);
  const cachedProjectUuidRef = useRef<string | null>(null);
  const latestMainVersionRef = useRef<string | null>(null);
  const latestSubVersionRef = useRef<string | null>(null);
  const isCreatingSnapshotRef = useRef(false);
  const joinedProjectRef = useRef<string | null>(null);

  /**
   * 已取消的工具请求 ID 集合
   * 使用 LRU 风格的清理策略，限制最大条目数为 100
   * 避免 tool:cancel 发送后对应的 tool:execute 从未到达导致 ID 永久留存
   */
  const cancelledToolRequestsRef = useRef<Set<string>>(new Set());
  const MAX_CANCELLED_TOOL_REQUESTS = 100;

  const syncProjectRoom = useCallback((projectUuid: string | null) => {
    const previousProject = joinedProjectRef.current;
    const socketInstance = socketRef.current;

    if (!socketInstance || socketInstance.disconnected) {
      return;
    }

    if (projectUuid && projectUuid !== previousProject) {
      if (previousProject) {
        socketInstance.emit("leave_project", previousProject);
        logger.info("已离开项目房间", {
          socketId: socketInstance.id,
          projectUuid: previousProject,
        });
      }

      socketInstance.emit("join_project", projectUuid);
      joinedProjectRef.current = projectUuid;
      logger.info("已加入项目房间", {
        socketId: socketInstance.id,
        projectUuid,
      });
    }

    if (!projectUuid && previousProject) {
      socketInstance.emit("leave_project", previousProject);
      joinedProjectRef.current = null;
      logger.info("当前项目为空，已离开先前房间", {
        socketId: socketInstance.id,
        projectUuid: previousProject,
      });
    }
  }, []);

  useEffect(() => {
    projectUuidRef.current = normalizedProjectUuid;
  }, [normalizedProjectUuid]);

  useEffect(() => {
    const projectId = normalizedProjectUuid;
    if (cachedProjectUuidRef.current !== projectId) {
      cachedProjectUuidRef.current = projectId;
      latestMainVersionRef.current = null;
      latestSubVersionRef.current = null;
    }
  }, [normalizedProjectUuid]);

  useEffect(() => {
    const getLastSubNumber = (version: string | null): number | null => {
      if (!version) return null;
      try {
        const parsed = parseVersion(version);
        return typeof parsed.sub === "number" ? parsed.sub : null;
      } catch {
        return null;
      }
    };

    const seedVersionCache = async (projectId: string) => {
      if (latestMainVersionRef.current) return;
      const versions = await getAllXMLVersions(projectId);
      const mainVersions = versions.filter(
        (version) =>
          !isSubVersion(version.semantic_version) &&
          version.semantic_version !== WIP_VERSION,
      );

      const latestMain = mainVersions[0]?.semantic_version ?? null;
      latestMainVersionRef.current = latestMain;

      if (!latestMain) {
        latestSubVersionRef.current = null;
        return;
      }

      try {
        const nextSubVersion = getNextSubVersion(versions, latestMain);
        const parsedNext = parseVersion(nextSubVersion);
        const lastSub = (parsedNext.sub ?? 1) - 1;
        latestSubVersionRef.current =
          lastSub > 0 ? `${latestMain}.${lastSub}` : null;
      } catch (error) {
        logger.debug("初始化子版本缓存失败，使用默认子版本起点", {
          projectId,
          parentVersion: latestMain,
          error,
        });
        latestSubVersionRef.current = null;
      }
    };

    const getNextSubVersionIncremental = (parentVersion: string) => {
      const lastSub = latestSubVersionRef.current;
      if (lastSub && getParentVersion(lastSub) === parentVersion) {
        const subNumber = getLastSubNumber(lastSub) ?? 0;
        return `${parentVersion}.${subNumber + 1}`;
      }
      return `${parentVersion}.1`;
    };

    const resetVersionCache = () => {
      latestMainVersionRef.current = null;
      latestSubVersionRef.current = null;
    };

    const handleAutoVersionSnapshot = async (
      request: ToolCallRequest,
      originalToolName?: string,
    ) => {
      try {
        const autoVersionEnabled =
          (await getSetting("autoVersionOnAIEdit")) !== "false";
        const currentProjectId = projectUuidRef.current;

        if (!autoVersionEnabled || !currentProjectId) {
          return;
        }

        if (isCreatingSnapshotRef.current) {
          logger.debug("已有快照任务进行中，跳过本次自动快照", {
            requestId: request.requestId,
            projectId: currentProjectId,
          });
          return;
        }

        isCreatingSnapshotRef.current = true;

        if (cachedProjectUuidRef.current !== currentProjectId) {
          cachedProjectUuidRef.current = currentProjectId;
          resetVersionCache();
        }

        await seedVersionCache(currentProjectId);

        const timestamp = new Date().toLocaleString("zh-CN");
        const baseDescription =
          (request.description && request.description.trim()) ||
          originalToolName ||
          request.toolName;
        const versionDescription = `${baseDescription} (${timestamp})`;

        let latestMainVersion = latestMainVersionRef.current;

        // 没有主版本时，先创建首个主版本（关键帧），再创建子版本
        if (!latestMainVersion) {
          logger.info("未检测到主版本，正在创建首个主版本", {
            projectId: currentProjectId,
            version: DEFAULT_FIRST_VERSION,
          });

          await createHistoricalVersion(
            currentProjectId,
            DEFAULT_FIRST_VERSION,
            "Auto create by AI",
            editorRef,
            { onExportProgress: undefined },
          );

          latestMainVersion = DEFAULT_FIRST_VERSION;
          latestMainVersionRef.current = DEFAULT_FIRST_VERSION;
          logger.info("首个主版本创建成功，准备创建子版本", {
            projectId: currentProjectId,
            parentVersion: latestMainVersion,
          });
        }

        // 确保父版本实体存在
        if (!latestMainVersion) {
          throw new Error(
            "[自动版本] 找不到可用的父版本，无法生成子版本。请刷新版本列表或重试。",
          );
        }

        const nextSubVersion = getNextSubVersionIncremental(latestMainVersion);

        logger.info("准备创建子版本", {
          projectId: currentProjectId,
          parentVersion: latestMainVersion,
          nextVersion: nextSubVersion,
          requestId: request.requestId,
          description: versionDescription,
        });

        await createHistoricalVersion(
          currentProjectId,
          nextSubVersion,
          versionDescription,
          editorRef,
          { onExportProgress: undefined },
        );

        logger.info("已创建版本快照", {
          projectId: currentProjectId,
          version: nextSubVersion,
          requestId: request.requestId,
          description: versionDescription,
        });

        latestMainVersionRef.current = latestMainVersion;
        latestSubVersionRef.current = nextSubVersion;
      } catch (error) {
        logger.error("自动版本创建失败", {
          projectId: projectUuidRef.current,
          error,
        });
        resetVersionCache();
      } finally {
        isCreatingSnapshotRef.current = false;
      }
    };

    // 创建 Socket.IO 客户端
    const socket = io({
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    const applyConnectionStatus = (nextStatus: ConnectionStatus) => {
      const previousStatus = connectionStatusRef.current;
      if (previousStatus === nextStatus) {
        return { changed: false, previousStatus };
      }

      connectionStatusRef.current = nextStatus;
      setConnectionStatusState(nextStatus);
      return { changed: true, previousStatus };
    };

    // 连接事件
    socket.on("connect", () => {
      const { changed, previousStatus } = applyConnectionStatus("connected");
      if (changed) {
        logger.info("Socket 已连接到服务器", {
          socketId: socket.id,
          previousStatus,
        });
      }

      const currentProjectId = projectUuidRef.current;
      if (currentProjectId) {
        syncProjectRoom(currentProjectId);
      } else {
        logger.warn("连接成功但当前没有项目，等待项目就绪后加入房间", {
          socketId: socket.id,
        });
      }
    });

    socket.on("disconnect", (reason: string) => {
      const { changed, previousStatus } = applyConnectionStatus("disconnected");
      if (changed) {
        logger.warn("Socket 已断开连接", {
          reason,
          socketId: socket.id,
          previousStatus,
        });
      }
    });

    socket.on("connect_error", (error: Error) => {
      const { changed, previousStatus } = applyConnectionStatus("disconnected");
      if (changed) {
        logger.error("Socket 连接错误", {
          error: error.message,
          previousStatus,
        });
      }
    });

    socket.on("tool:cancel", (payload) => {
      const currentProjectUuid = projectUuidRef.current;
      if (!currentProjectUuid) return;
      if (payload.projectUuid !== currentProjectUuid) return;

      const cancelledRequests = cancelledToolRequestsRef.current;
      cancelledRequests.add(payload.requestId);

      // LRU 清理：超出最大条目数时删除最早的条目
      if (cancelledRequests.size > MAX_CANCELLED_TOOL_REQUESTS) {
        const iterator = cancelledRequests.values();
        const firstValue = iterator.next().value;
        if (firstValue !== undefined) {
          cancelledRequests.delete(firstValue);
        }
      }

      logger.info("收到工具取消请求", {
        requestId: payload.requestId,
        toolRunId: payload.chatRunId,
        conversationId: payload.conversationId,
        reason: payload.reason,
      });
    });

    // 监听工具执行请求
    socket.on("tool:execute", async (request: ToolCallRequest) => {
      const currentProjectUuid = projectUuidRef.current;

      logger.debug("收到工具调用请求", {
        toolName: request.toolName,
        requestId: request.requestId,
        projectId: currentProjectUuid,
        requestProject: request.projectUuid,
        conversationId: request.conversationId,
        description: request.description,
      });

      if (!request.projectUuid) {
        logger.warn("收到缺少 projectUuid 的工具请求，已忽略以保持兼容", {
          toolName: request.toolName,
          requestId: request.requestId,
        });
        return;
      }

      if (!currentProjectUuid) {
        logger.info("当前未打开任何项目，忽略工具请求", {
          toolName: request.toolName,
          requestId: request.requestId,
          requestProject: request.projectUuid,
        });
        return;
      }

      if (request.projectUuid !== currentProjectUuid) {
        logger.info("收到工具请求但项目不匹配，忽略", {
          toolName: request.toolName,
          requestId: request.requestId,
          requestProject: request.projectUuid,
          currentProject: currentProjectUuid,
        });
        return;
      }

      if (cancelledToolRequestsRef.current.has(request.requestId)) {
        cancelledToolRequestsRef.current.delete(request.requestId);
        socket.emit(TOOL_RESULT_EVENT, {
          requestId: request.requestId,
          success: false,
          error: "tool_cancelled",
        });
        logger.info("工具请求已被取消，已返回取消结果", {
          requestId: request.requestId,
          toolName: request.toolName,
        });
        return;
      }

      const chatRunIdRaw =
        typeof request.chatRunId === "string" ? request.chatRunId.trim() : "";
      if (!chatRunIdRaw) {
        socket.emit(TOOL_RESULT_EVENT, {
          requestId: request.requestId,
          success: false,
          error: "missing_chatRunId",
        });
        logger.warn("收到缺少 chatRunId 的工具请求，已拒绝执行", {
          toolName: request.toolName,
          requestId: request.requestId,
          conversationId: request.conversationId,
        });
        return;
      }

      if (isChatRunCancelled(chatRunIdRaw)) {
        socket.emit(TOOL_RESULT_EVENT, {
          requestId: request.requestId,
          success: false,
          error: "chat_run_cancelled",
        });
        logger.info("收到已取消 run 的工具请求，已拒绝执行", {
          toolName: request.toolName,
          requestId: request.requestId,
          conversationId: request.conversationId,
          chatRunId: chatRunIdRaw,
        });
        return;
      }

      const activeRunId = getActiveChatRun(request.conversationId);
      if (activeRunId !== chatRunIdRaw) {
        socket.emit(TOOL_RESULT_EVENT, {
          requestId: request.requestId,
          success: false,
          error: "chat_run_not_active",
        });
        logger.info("收到非当前活跃 run 的工具请求，已拒绝执行", {
          toolName: request.toolName,
          requestId: request.requestId,
          conversationId: request.conversationId,
          chatRunId: chatRunIdRaw,
          activeRunId,
        });
        return;
      }

      try {
        if (
          request.toolName === REPLACE_DRAWIO_XML ||
          request.toolName === EXPORT_DRAWIO
        ) {
          await handleAutoVersionSnapshot(
            request,
            (request.description && request.description.trim()) ||
              request.toolName,
          );
        }

        let result: {
          success: boolean;
          error?: string;
          message?: string;
          xml?: string;
        };

        // 根据工具名称执行相应函数
        switch (request.toolName) {
          case GET_DRAWIO_XML:
            result = (await getDrawioXML()) as unknown as {
              success: boolean;
              error?: string;
              message?: string;
              [key: string]: unknown;
            };
            break;

          case REPLACE_DRAWIO_XML: {
            if (!request.input?.drawio_xml) {
              throw new Error("缺少 drawio_xml 参数");
            }
            const skipExportValidation = Boolean(
              (request.input as { skip_export_validation?: boolean })
                ?.skip_export_validation,
            );
            result = await replaceDrawioXML(
              request.input.drawio_xml as string,
              {
                requestId: request.requestId,
                editorRef,
                skipExportValidation,
                description:
                  (request.description && request.description.trim()) ||
                  request.toolName,
              },
            );
            // 事件派发已在 replaceDrawioXML 内部处理，这里避免重复派发
            break;
          }

          default:
            throw new Error(`未知工具: ${request.toolName}`);
        }

        // 返回成功结果
        const response: ToolCallResult = {
          requestId: request.requestId,
          success: result.success,
          result: result,
          error: resolveToolCallError(result as ToolResultLike),
        };

        socket.emit(TOOL_RESULT_EVENT, response);
        logger.debug("已返回工具执行结果", {
          toolName: request.toolName,
          success: result.success,
          requestId: request.requestId,
        });
      } catch (error) {
        // 返回错误结果
        const response: ToolCallResult = {
          requestId: request.requestId,
          success: false,
          error: toErrorString(error),
        };

        socket.emit(TOOL_RESULT_EVENT, response);
        logger.error("工具执行失败", {
          toolName: request.toolName,
          requestId: request.requestId,
          error,
        });
      }
    });

    // 清理函数
    return () => {
      const projectUuid = joinedProjectRef.current;
      if (projectUuid) {
        socket.emit("leave_project", projectUuid);
        logger.info("Socket 客户端清理，离开项目房间", {
          socketId: socket.id,
          projectUuid,
        });
      }

      logger.info("Socket 客户端清理，断开连接");
      applyConnectionStatus("disconnecting");
      socket.disconnect();
      applyConnectionStatus("disconnected");
    };
  }, [
    createHistoricalVersion,
    getAllXMLVersions,
    getSetting,
    editorRef,
    syncProjectRoom,
  ]);

  useEffect(() => {
    syncProjectRoom(normalizedProjectUuid);
  }, [normalizedProjectUuid, syncProjectRoom]);

  return { isConnected: connectionStatus === "connected", connectionStatus };
}
