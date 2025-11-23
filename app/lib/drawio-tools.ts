/**
 * DrawIO XML 前端存储工具集
 *
 * 负责在浏览器环境下管理图表 XML 的持久化与事件分发。
 * 使用统一的存储抽象层（Electron: SQLite, Web: IndexedDB），支持更大的文件和更好的性能。
 * 工具函数会在写入前自动处理 base64 编码的内容，
 * 并在更新后通过自定义事件通知编辑器重新加载。
 */

import type {
  GetXMLResult,
  ReplaceXMLResult,
  XMLValidationResult,
} from "../types/drawio-tools";
import { getStorage } from "./storage/storage-factory";
import { WIP_VERSION } from "./storage/constants";
import { buildPageMetadataFromXml } from "./storage";
import {
  computeVersionPayload,
  materializeVersionXml,
} from "./storage/xml-version-engine";
import { v4 as uuidv4 } from "uuid";
import { resolveCurrentProjectUuid } from "./storage/current-project";
import { createDefaultDiagramXml } from "./storage/default-diagram-xml";
import { normalizeDiagramXml } from "./drawio-xml-utils";

// 内存快照：记录替换前的 XML，用于合并失败时回滚
let _drawioXmlSnapshot: string | null = null;

/**
 * 验证 XML 格式是否合法
 * 使用浏览器内置的 DOMParser 进行验证
 *
 * @param xml - 待验证的 XML 字符串
 * @returns 验证结果，包含是否合法和错误信息
 */
function validateXML(xml: string): XMLValidationResult {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");
    const parseError = doc.querySelector("parsererror");

    if (parseError) {
      return {
        valid: false,
        error: parseError.textContent || "XML 格式错误",
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "XML 解析异常",
    };
  }
}

/**
 * 保存 XML 到存储的内部实现（不触发事件）
 *
 * @param decodedXml - 已解码的 XML 内容
 * @throws {Error} 当前项目不存在时抛出错误
 */
async function saveDrawioXMLInternal(decodedXml: string): Promise<void> {
  const storage = await getStorage();
  const projectUuid = await resolveCurrentProjectUuid(storage);
  const pageMetadata = buildPageMetadataFromXml(decodedXml);
  const pageNamesJson = JSON.stringify(pageMetadata.pageNames);

  // 检查项目是否存在
  const project = await storage.getProject(projectUuid);
  if (!project) {
    throw new Error(
      `当前项目不存在 (UUID: ${projectUuid})，请检查项目设置或重新选择项目`,
    );
  }

  const existingVersions = await storage.getXMLVersionsByProject(projectUuid);
  const wipVersion = existingVersions.find(
    (version) => version.semantic_version === WIP_VERSION,
  );
  const payload = await computeVersionPayload({
    newXml: decodedXml,
    semanticVersion: WIP_VERSION,
    baseVersion: null,
    resolveVersionById: (id) => storage.getXMLVersion(id, projectUuid),
  });

  if (!payload) {
    return;
  }

  if (wipVersion) {
    await storage.updateXMLVersion(wipVersion.id, {
      project_uuid: projectUuid,
      semantic_version: WIP_VERSION,
      xml_content: payload.xml_content,
      source_version_id: payload.source_version_id,
      is_keyframe: payload.is_keyframe,
      diff_chain_depth: payload.diff_chain_depth,
      metadata: null,
      page_count: pageMetadata.pageCount,
      page_names: pageNamesJson,
      created_at: Date.now(),
    });
    return;
  }

  await storage.createXMLVersion({
    id: uuidv4(),
    project_uuid: projectUuid,
    semantic_version: WIP_VERSION,
    xml_content: payload.xml_content,
    source_version_id: payload.source_version_id,
    is_keyframe: payload.is_keyframe,
    diff_chain_depth: payload.diff_chain_depth,
    metadata: null,
    page_count: pageMetadata.pageCount,
    page_names: pageNamesJson,
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
    throw new Error("saveDrawioXML 只能在浏览器环境中使用");
  }

  try {
    const decodedXml = normalizeDiagramXml(xml);
    const validation = validateXML(decodedXml);
    if (!validation.valid) {
      throw new Error(validation.error || "XML 格式验证失败");
    }
    await saveDrawioXMLInternal(decodedXml);
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
      error: "此函数只能在浏览器环境中使用",
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
        error: `当前项目不存在 (UUID: ${projectUuid})，请检查项目设置或重新选择项目`,
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
    const decodedXml = normalizeDiagramXml(resolvedXml);

    return {
      success: true,
      xml: decodedXml,
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
    const decodedXml = normalizeDiagramXml(drawio_xml);
    const validation = validateXML(decodedXml);
    if (!validation.valid) {
      return {
        success: false,
        message: "XML 格式验证失败",
        error: validation.error,
      };
    }

    // 3) 保存到存储
    await saveDrawioXMLInternal(decodedXml);

    // 4) 通知编辑器加载新 XML
    window.dispatchEvent(
      new CustomEvent("ai-xml-replaced", {
        detail: { xml: decodedXml, requestId, isRollback },
      }),
    );

    if (isRollback) {
      return {
        success: true,
        message: "XML 已替换",
        xml: decodedXml,
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
      xml: decodedXml,
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
