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
import { normalizeDiagramXml, validateXMLFormat } from "./drawio-xml-utils";
import {
  persistWipVersion,
  prepareXmlContext,
  type PersistWipOptions,
  type XmlContext,
} from "./storage/writers";
import { createLogger } from "@/lib/logger";
import { toErrorString } from "./error-handler";
import type { RefObject } from "react";
import type { DrawioEditorRef } from "@/app/components/DrawioEditorNative";

const logger = createLogger("DrawIO Tools");

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
  options?: PersistWipOptions,
): Promise<void> {
  const storage = await getStorage();
  const projectUuid = await resolveCurrentProjectUuid(storage);
  await persistWipVersion(projectUuid, xmlOrContext, {
    name: "WIP",
    description: options?.description ?? "活跃工作区",
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
    logger.error("保存 XML 失败", { error });
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
    logger.error("读取 XML 失败", { error });
    return {
      success: false,
      error: toErrorString(error) || "读取数据失败",
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
  options?: {
    requestId?: string;
    isRollback?: boolean;
    editorRef?: RefObject<DrawioEditorRef | null>;
    skipExportValidation?: boolean;
    description?: string;
  },
): Promise<ReplaceXMLResult & { xml?: string }> {
  if (typeof window === "undefined") {
    return {
      success: false,
      message: "操作失败",
      error: "此函数只能在浏览器环境中使用",
    };
  }

  const requestId = options?.requestId ?? crypto.randomUUID();
  const editorRef = options?.editorRef;
  const isRollback = options?.isRollback === true;
  const skipExportValidation = options?.skipExportValidation === true;

  if (!editorRef?.current) {
    return {
      success: false,
      message: "编辑器不可用",
      error: "editor_not_available",
    };
  }

  try {
    // 1) 修改前保存快照
    const currentResult = await getDrawioXML();
    _drawioXmlSnapshot =
      currentResult.success && currentResult.xml ? currentResult.xml : null;
    if (!_drawioXmlSnapshot) {
      logger.warn("未能获取当前 XML 快照，回滚可能不可用", {
        requestId,
      });
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

    // 3) 直接触发 merge（不经过 ai-xml-replaced 事件）
    try {
      editorRef.current.mergeDiagram(context.normalizedXml, requestId);
      logger.info("已发送 merge 请求到 DrawIO", { requestId, isRollback });
    } catch (mergeInvokeError) {
      logger.error("调用 mergeDiagram 失败", {
        error: mergeInvokeError,
        requestId,
      });
      return {
        success: false,
        message: "调用 DrawIO 失败",
        error:
          mergeInvokeError instanceof Error
            ? mergeInvokeError.message
            : "merge_invoke_failed",
      };
    }

    // 4) 等待 merge 成功/失败回调（10.5 秒超时）
    const mergeResult = await waitForMergeValidation(requestId, 10500);

    if (!mergeResult?.success) {
      const mergeError = toErrorString(mergeResult?.error ?? "merge_timeout");
      const mergeMessage = mergeResult?.message ?? "DrawIO 响应超时";

      logger.error("DrawIO merge 失败或超时", {
        mergeError,
        mergeMessage,
        requestId,
      });

      await reloadDrawioEditor(editorRef, _drawioXmlSnapshot);

      return {
        success: false,
        error: mergeError,
        message: `${mergeMessage}。已自动回滚到修改前状态`,
      };
    }

    // 4.1) merge 模式跳过 export 验证，直接写入存储
    if (skipExportValidation) {
      try {
        await saveDrawioXMLInternal(context, {
          description: options?.description,
        });
        return {
          success: true,
          message: "XML 已替换（merge 模式，已跳过一致性验证）",
          xml: context.normalizedXml,
        };
      } catch (storageError) {
        logger.error("存储写入失败（merge 跳过验证）", {
          storageError,
          requestId,
        });
        return {
          success: false,
          error: "storage_write_failed",
          message: "XML 已在编辑器中生效，但存储写入失败",
        };
      }
    }

    // 5) 通过 export 验证 XML 一致性
    let exportedXml = "";
    try {
      exportedXml = await editorRef.current.exportDiagram();
    } catch (exportError) {
      logger.error("导出 XML 验证失败", { exportError, requestId });
      await reloadDrawioEditor(editorRef, _drawioXmlSnapshot);
      return {
        success: false,
        error: "export_failed",
        message: "无法导出 DrawIO XML 进行验证。已自动回滚到修改前状态",
      };
    }

    if (!exportedXml || !exportedXml.trim()) {
      logger.error("导出的 XML 为空", { requestId });
      await reloadDrawioEditor(editorRef, _drawioXmlSnapshot);
      return {
        success: false,
        error: "export_empty",
        message: "DrawIO 导出为空。已自动回滚到修改前状态",
      };
    }

    let normalizedExport = "";
    try {
      normalizedExport = normalizeDiagramXml(exportedXml);
    } catch (normalizeError) {
      logger.error("导出 XML 归一化失败", {
        normalizeError,
        requestId,
        exportedLength: exportedXml.length,
      });
      await reloadDrawioEditor(editorRef, _drawioXmlSnapshot);
      return {
        success: false,
        error: "export_normalize_failed",
        message: "导出 XML 无法解析。已自动回滚到修改前状态",
      };
    }

    const comparisonResult = compareXML(
      context.normalizedXml,
      normalizedExport,
    );
    if (!comparisonResult.isConsistent) {
      logger.error("Export 验证失败：XML 不一致", {
        requestId,
        expectedLength: context.normalizedXml.length,
        exportedLength: normalizedExport.length,
        details: comparisonResult.details,
      });
      await reloadDrawioEditor(editorRef, _drawioXmlSnapshot);
      return {
        success: false,
        error: "xml_inconsistency",
        message: `DrawIO 加载的 XML 与预期不一致: ${
          comparisonResult.details || "未知差异"
        }。已自动回滚到修改前状态`,
      };
    }

    // 6) 验证通过后再写入存储
    try {
      await saveDrawioXMLInternal(context, {
        description: options?.description,
      });
    } catch (storageError) {
      logger.error("存储写入失败", { storageError, requestId });
      return {
        success: false,
        error: "storage_write_failed",
        message: "XML 已在编辑器中生效，但存储写入失败",
      };
    }

    return {
      success: true,
      message: "XML 已替换并验证一致性",
      xml: context.normalizedXml,
    };
  } catch (error) {
    logger.error("替换 DrawIO XML 失败", { error, requestId });
    return {
      success: false,
      message: "操作失败",
      error: toErrorString(error) || "写入数据失败",
    };
  } finally {
    _drawioXmlSnapshot = null;
  }
}

// 等待 DrawIO merge 结果（包含成功/失败），超时视为失败
export const waitForMergeValidation = (
  currentRequestId: string,
  timeoutMs = 10500,
): Promise<{
  error?: string;
  message?: string;
  requestId?: string;
  success?: boolean;
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
        success?: boolean;
      } | null,
    ) => {
      if (settled) return;
      settled = true;
      controller.abort();
      resolve(payload);
    };

    const timer = window.setTimeout(() => {
      finish({ error: "timeout", message: "等待 DrawIO 响应超时" });
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

      if (currentRequestId) {
        if (!eventRequestId || eventRequestId !== currentRequestId) {
          return;
        }
      }

      if (timer) {
        window.clearTimeout(timer);
      }

      const errorStr = toErrorString(detail?.error ?? "drawio_merge_error");
      const messageStr =
        typeof detail?.message === "string" ? detail.message : undefined;
      finish({
        error: errorStr,
        message: messageStr,
        requestId: detail?.requestId,
      });
    };

    const onMergeSuccess = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          requestId?: string;
        }>
      ).detail;
      const eventRequestId = detail?.requestId;

      if (currentRequestId) {
        if (!eventRequestId || eventRequestId !== currentRequestId) {
          return;
        }
      }

      if (timer) {
        window.clearTimeout(timer);
      }

      finish({ success: true, requestId: eventRequestId });
    };

    signal.addEventListener("abort", () => {
      if (timer) {
        window.clearTimeout(timer);
      }
    });

    window.addEventListener("drawio-merge-error", onMergeError, {
      signal,
    });
    window.addEventListener("drawio-merge-success", onMergeSuccess, {
      signal,
    });
  });
};

// 重载 DrawIO 编辑器并尝试恢复到最近可用 XML（优先存储）
async function reloadDrawioEditor(
  editorRef: RefObject<DrawioEditorRef | null>,
  fallbackXml: string | null,
): Promise<void> {
  if (!editorRef.current) {
    logger.warn("编辑器引用不可用，无法重载");
    return;
  }

  logger.warn("重载 DrawIO 编辑器");
  try {
    const storageResult = await getDrawioXML();
    let latestXml: string;

    if (storageResult.success && storageResult.xml) {
      logger.info("使用存储中的最新 XML 重载");
      latestXml = storageResult.xml;
    } else if (fallbackXml) {
      logger.warn("存储读取失败，使用快照 XML 重载");
      latestXml = fallbackXml;
    } else {
      logger.warn("无可用 XML，使用默认空图表重载");
      latestXml = createDefaultDiagramXml();
    }

    await editorRef.current.loadDiagram(latestXml);
    logger.info("DrawIO 编辑器重载完成");
  } catch (error) {
    logger.error("重载 DrawIO 编辑器失败", { error });
    throw error;
  }
}

// XML 内容一致性比较：优先 DOM 语义比较，回退字符串比较
function compareXML(
  xml1: string,
  xml2: string,
): { isConsistent: boolean; details?: string } {
  const normalize = (xml: string) => xml.replace(/\s+/g, "");

  try {
    const parser = new DOMParser();
    const doc1 = parser.parseFromString(xml1, "text/xml");
    const doc2 = parser.parseFromString(xml2, "text/xml");

    const hasError1 = doc1.querySelector("parsererror");
    const hasError2 = doc2.querySelector("parsererror");
    if (hasError1 || hasError2) {
      return {
        isConsistent: normalize(xml1) === normalize(xml2),
        details: "XML 解析失败，已回退到字符串比较",
      };
    }

    const root1 = doc1.querySelector("mxGraphModel");
    const root2 = doc2.querySelector("mxGraphModel");

    if (!root1 || !root2) {
      return {
        isConsistent: normalize(xml1) === normalize(xml2),
        details: "缺少 mxGraphModel 根节点，已回退到字符串比较",
      };
    }

    const cells1 = root1.querySelectorAll("mxCell");
    const cells2 = root2.querySelectorAll("mxCell");

    const ids1 = Array.from(cells1)
      .map((c) => c.getAttribute("id"))
      .filter(Boolean)
      .sort();
    const ids2 = Array.from(cells2)
      .map((c) => c.getAttribute("id"))
      .filter(Boolean)
      .sort();

    if (cells1.length !== cells2.length) {
      return {
        isConsistent: false,
        details: `节点数量不一致: 预期 ${cells1.length} 个,实际 ${cells2.length} 个`,
      };
    }

    const idDiff = ids1
      .filter((id) => !ids2.includes(id))
      .concat(ids2.filter((id) => !ids1.includes(id)));

    if (idDiff.length > 0) {
      return {
        isConsistent: false,
        details: `节点 ID 不一致: 差异项 ${idDiff
          .slice(0, 5)
          .join(", ")}${idDiff.length > 5 ? "..." : ""}`,
      };
    }

    return { isConsistent: true };
  } catch (error) {
    return {
      isConsistent: normalize(xml1) === normalize(xml2),
      details: `DOM 比较失败: ${toErrorString(error)}`,
    };
  }
}
