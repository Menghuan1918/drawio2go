/**
 * DrawIO XML 前端存储工具集
 *
 * 负责在浏览器环境下管理图表 XML 的持久化与事件分发。
 * 使用统一的存储抽象层（Electron: SQLite, Web: IndexedDB），支持更大的文件和更好的性能。
 * 工具函数会在写入前自动处理 base64 编码的内容，
 * 并在更新后通过自定义事件通知编辑器重新加载。
 */

import { ErrorCodes } from "@/app/errors/error-codes";
import type { GetXMLResult, ReplaceXMLResult } from "../types/drawio-tools";
import { getStorage } from "./storage/storage-factory";
import { materializeVersionXml } from "./storage/xml-version-engine";
import { WIP_VERSION } from "./storage/constants";
import { resolveCurrentProjectUuid } from "./storage/current-project";
import { createDefaultDiagramXml } from "./storage/default-diagram-xml";
import { validateXMLFormat } from "./drawio-xml-utils";
import {
  persistWipVersion,
  prepareXmlContext,
  type XmlContext,
} from "./storage/writers";

// 内存快照：记录替换前的 XML，用于合并失败时回滚
let _drawioXmlSnapshot: string | null = null;

/**
 * 保存 XML 到存储的内部实现（不触发事件）
 *
 * @param decodedXml - 已解码的 XML 内容
 * @throws {Error} 当前项目不存在时抛出错误
 */
async function saveDrawioXMLInternal(
  xmlOrContext: string | XmlContext,
): Promise<void> {
  const storage = await getStorage();
  const projectUuid = await resolveCurrentProjectUuid(storage);
  await persistWipVersion(projectUuid, xmlOrContext, {
    name: "WIP",
    description: "活跃工作区",
  });
}

/**
 * 保存 XML 到 IndexedDB（自动解码 base64）
 *
 * 用于持久化存储 XML 内容，纯粹的存储操作，不触发任何 UI 事件
 *
 * @param xml - XML 内容（可能包含 base64 编码）
 */
export async function saveDrawioXML(xml: string): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error(
      `[${ErrorCodes.XML_ENV_NOT_SUPPORTED}] This function can only be used in browser environment`,
    );
  }

  try {
    const context = prepareXmlContext(xml);
    const validation = validateXMLFormat(context.normalizedXml);
    if (!validation.valid) {
      throw new Error(
        validation.error ||
          `[${ErrorCodes.XML_INVALID_FORMAT}] Decoded result is not valid XML`,
      );
    }
    await saveDrawioXMLInternal(context);
  } catch (error) {
    console.error("[DrawIO Tools] 保存 XML 失败:", error);
    throw error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * 获取当前 DrawIO XML 内容（从 IndexedDB）
 */
export async function getDrawioXML(): Promise<GetXMLResult> {
  if (typeof window === "undefined") {
    return {
      success: false,
      error: `[${ErrorCodes.XML_ENV_NOT_SUPPORTED}] This function can only be used in browser environment`,
    };
  }

  try {
    const storage = await getStorage();
    const projectUuid = await resolveCurrentProjectUuid(storage);

    // 检查项目是否存在
    const project = await storage.getProject(projectUuid);
    if (!project) {
      return {
        success: false,
        error: `[${ErrorCodes.STORAGE_PROJECT_NOT_FOUND}] Project not found: ${projectUuid}`,
      };
    }

    const versions = await storage.getXMLVersionsByProject(projectUuid);

    if (versions.length === 0) {
      const defaultXml = createDefaultDiagramXml();
      await saveDrawioXMLInternal(defaultXml);

      return {
        success: true,
        xml: defaultXml,
      };
    }

    // 优先返回 WIP 版本
    const latestVersion =
      versions.find((v) => v.semantic_version === WIP_VERSION) ?? versions[0];
    const resolvedXml = await materializeVersionXml(latestVersion, (id) =>
      storage.getXMLVersion(id, projectUuid),
    );

    return {
      success: true,
      xml: resolvedXml,
    };
  } catch (error) {
    console.error("[DrawIO Tools] 读取 XML 失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "读取数据失败",
    };
  }
}

/**
 * 替换 DrawIO XML 内容（供 AI 工具调用）
 *
 * 保存新的 XML 内容到存储，并返回成功状态和 XML 内容
 * 调用方需要自行决定如何更新编辑器（通过 ref 或其他方式）
 *
 * @param drawio_xml - 新的 XML 内容
 * @returns 包含成功状态、消息和 XML 内容的结果
 */
export async function replaceDrawioXML(
  drawio_xml: string,
  options?: { requestId?: string; isRollback?: boolean },
): Promise<ReplaceXMLResult & { xml?: string }> {
  if (typeof window === "undefined") {
    return {
      success: false,
      message: "操作失败",
      error: "此函数只能在浏览器环境中使用",
    };
  }

  const requestId = options?.requestId ?? crypto.randomUUID();
  const isRollback = options?.isRollback === true;

  const waitForMergeValidation = (
    currentRequestId: string,
    timeoutMs = 3000,
  ): Promise<{
    error?: string;
    message?: string;
    requestId?: string;
  } | null> => {
    return new Promise((resolve) => {
      const controller = new AbortController();
      const { signal } = controller;
      let settled = false;

      const finish = (
        payload: {
          error?: string;
          message?: string;
          requestId?: string;
        } | null,
      ) => {
        if (settled) return;
        settled = true;
        controller.abort();
        resolve(payload);
      };

      const timer = window.setTimeout(() => {
        finish(null);
      }, timeoutMs);

      const onMergeError = (event: Event) => {
        const detail = (
          event as CustomEvent<{
            error?: string;
            message?: string;
            requestId?: string;
          }>
        ).detail;
        const eventRequestId = detail?.requestId;

        if (
          currentRequestId &&
          eventRequestId &&
          eventRequestId !== currentRequestId
        ) {
          return;
        }

        if (timer) {
          window.clearTimeout(timer);
        }

        finish(detail ?? { error: "drawio_merge_error" });
      };

      signal.addEventListener("abort", () => {
        if (timer) {
          window.clearTimeout(timer);
        }
      });

      window.addEventListener("drawio-merge-error", onMergeError, {
        signal,
      });
    });
  };

  try {
    // 1) 修改前保存快照
    const currentResult = await getDrawioXML();
    _drawioXmlSnapshot =
      currentResult.success && currentResult.xml ? currentResult.xml : null;
    if (!_drawioXmlSnapshot) {
      console.warn("[DrawIO Tools] 未能获取当前 XML 快照，回滚可能不可用");
    }

    // 2) 现有验证逻辑
    const context = prepareXmlContext(drawio_xml);
    const validation = validateXMLFormat(context.normalizedXml);
    if (!validation.valid) {
      return {
        success: false,
        message: `[${ErrorCodes.XML_INVALID_FORMAT}] Decoded result is not valid XML`,
        error: validation.error,
      };
    }

    // 3) 保存到存储
    await saveDrawioXMLInternal(context);

    // 4) 通知编辑器加载新 XML
    window.dispatchEvent(
      new CustomEvent("ai-xml-replaced", {
        detail: { xml: context.normalizedXml, requestId, isRollback },
      }),
    );

    if (isRollback) {
      return {
        success: true,
        message: "XML 已替换",
        xml: context.normalizedXml,
      };
    }

    const mergeError = await waitForMergeValidation(requestId);

    // 5) 错误回滚
    if (mergeError?.error) {
      console.error("[DrawIO Tools] DrawIO merge 错误:", mergeError);

      let rollbackMessage: string;
      if (!_drawioXmlSnapshot) {
        rollbackMessage =
          "DrawIO 报告 XML 语法错误，但回滚失败（未能捕获快照），数据可能已损坏，请检查项目状态";
      } else {
        try {
          await saveDrawioXMLInternal(_drawioXmlSnapshot);
          window.dispatchEvent(
            new CustomEvent("ai-xml-replaced", {
              detail: {
                xml: _drawioXmlSnapshot,
                requestId,
                isRollback: true,
              },
            }),
          );
          console.warn("[DrawIO Tools] 已回滚到替换前的 XML");
          rollbackMessage = "DrawIO 报告 XML 语法错误，已自动回滚到修改前状态";
        } catch (rollbackError) {
          console.error("[DrawIO Tools] 回滚失败:", rollbackError);
          rollbackMessage =
            "DrawIO 报告 XML 语法错误，但回滚失败（存储不可用），数据可能已损坏，请检查项目状态";
        }
      }

      return {
        success: false,
        error: "drawio_syntax_error",
        message: rollbackMessage,
      };
    }

    return {
      success: true,
      message: "XML 已替换",
      xml: context.normalizedXml,
    };
  } catch (error) {
    return {
      success: false,
      message: "保存失败",
      error: error instanceof Error ? error.message : "写入数据失败",
    };
  } finally {
    _drawioXmlSnapshot = null;
  }
}
