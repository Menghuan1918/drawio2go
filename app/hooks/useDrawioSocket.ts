/**
 * DrawIO Socket.IO Hook
 *
 * 用于在前端建立 Socket.IO 连接，监听后端的工具调用请求并执行
 */

"use client";

import { useEffect, useRef, useState } from "react";
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
import { useCurrentProject } from "./useCurrentProject";
import { useStorageSettings } from "./useStorageSettings";
import { getNextSubVersion, isSubVersion } from "@/lib/version-utils";
import { WIP_VERSION } from "@/app/lib/storage";

/**
 * DrawIO Socket.IO Hook
 *
 * @param editorRef 可选 DrawIO 编辑器引用，供自动版本快照导出 XML/SVG
 * @returns { isConnected: boolean } - Socket.IO 连接状态
 */
export function useDrawioSocket(
  editorRef?: React.RefObject<DrawioEditorRef | null>,
) {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket<
    ServerToClientEvents,
    ClientToServerEvents
  > | null>(null);
  const { createHistoricalVersion, getAllXMLVersions } =
    useStorageXMLVersions();
  const { currentProject } = useCurrentProject();
  const { getSetting } = useStorageSettings();
  const currentProjectRef = useRef(currentProject);

  useEffect(() => {
    currentProjectRef.current = currentProject;
  }, [currentProject]);

  useEffect(() => {
    const handleAutoVersionSnapshot = async (
      request: ToolCallRequest,
      originalToolName?: string,
    ) => {
      try {
        const autoVersionEnabled =
          (await getSetting("autoVersionOnAIEdit")) !== "false";
        const project = currentProjectRef.current;

        if (!autoVersionEnabled || !project?.uuid) {
          return;
        }

        const versions = await getAllXMLVersions(project.uuid);
        const mainVersions = versions.filter(
          (version) =>
            !isSubVersion(version.semantic_version) &&
            version.semantic_version !== WIP_VERSION,
        );
        const latestMainVersion = mainVersions[0]?.semantic_version || "1.0.0";
        const nextSubVersion = getNextSubVersion(versions, latestMainVersion);

        const timestamp = new Date().toLocaleString("zh-CN");
        const aiDescription = request.description || "AI 自动编辑";
        const sourceDescription = originalToolName ?? request.toolName;
        const versionDescription = `${sourceDescription} - ${aiDescription} (${timestamp})`;

        await createHistoricalVersion(
          project.uuid,
          nextSubVersion,
          versionDescription,
          editorRef,
          { onExportProgress: undefined },
        );

        console.log(`[自动版本] 已创建版本快照: ${nextSubVersion}`);
      } catch (error) {
        console.error("[自动版本] 创建失败:", error);
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

    // 连接事件
    socket.on("connect", () => {
      console.log("[Socket.IO Client] 已连接到服务器, ID:", socket.id);
      setIsConnected(true);
    });

    socket.on("disconnect", (reason: string) => {
      console.log("[Socket.IO Client] 已断开连接, 原因:", reason);
      setIsConnected(false);
    });

    socket.on("connect_error", (error: Error) => {
      console.error("[Socket.IO Client] 连接错误:", error.message);
      setIsConnected(false);
    });

    // 监听工具执行请求
    socket.on("tool:execute", async (request: ToolCallRequest) => {
      console.log(
        `[Socket.IO Client] 收到工具调用请求: ${request.toolName} (${request.requestId})`,
      );

      try {
        const originalTool =
          ((request.input as { _originalTool?: string } | undefined)
            ?._originalTool ??
            request._originalTool) ||
          undefined;

        if (
          request.toolName === "replace_drawio_xml" &&
          (originalTool === "drawio_overwrite" ||
            originalTool === "drawio_edit_batch")
        ) {
          await handleAutoVersionSnapshot(request, originalTool);
        }

        let result: {
          success: boolean;
          error?: string;
          message?: string;
          [key: string]: unknown;
        };

        // 根据工具名称执行相应函数
        switch (request.toolName) {
          case "get_drawio_xml":
            result = (await getDrawioXML()) as unknown as {
              success: boolean;
              error?: string;
              message?: string;
              [key: string]: unknown;
            };
            break;

          case "replace_drawio_xml":
            if (!request.input?.drawio_xml) {
              throw new Error("缺少 drawio_xml 参数");
            }
            result = (await replaceDrawioXML(
              request.input.drawio_xml as string,
            )) as unknown as {
              success: boolean;
              error?: string;
              message?: string;
              xml?: string;
              [key: string]: unknown;
            };

            // 如果替换成功，触发自定义事件通知编辑器更新
            if (result.success && result.xml) {
              window.dispatchEvent(
                new CustomEvent("ai-xml-replaced", {
                  detail: { xml: result.xml },
                }),
              );
            }
            break;

          default:
            throw new Error(`未知工具: ${request.toolName}`);
        }

        // 返回成功结果
        const response: ToolCallResult = {
          requestId: request.requestId,
          success: result.success,
          result: result,
          error: result.success ? undefined : result.error || result.message,
        };

        socket.emit("tool:result", response);
        console.log(
          `[Socket.IO Client] 已返回工具执行结果: ${request.toolName}, success: ${result.success}`,
        );
      } catch (error) {
        // 返回错误结果
        const response: ToolCallResult = {
          requestId: request.requestId,
          success: false,
          error: error instanceof Error ? error.message : "未知错误",
        };

        socket.emit("tool:result", response);
        console.error(`[Socket.IO Client] 工具执行失败:`, error);
      }
    });

    // 清理函数
    return () => {
      console.log("[Socket.IO Client] 断开连接");
      socket.disconnect();
    };
  }, [createHistoricalVersion, getAllXMLVersions, getSetting, editorRef]);

  return { isConnected };
}
