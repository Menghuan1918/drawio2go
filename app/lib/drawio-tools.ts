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
import { DEFAULT_PROJECT_UUID, WIP_VERSION } from "./storage/constants";
import {
  computeVersionPayload,
  materializeVersionXml,
} from "./storage/xml-version-engine";
import { v4 as uuidv4 } from "uuid";

/**
 * localStorage 中存储当前项目 ID 的键名
 *
 * 与 useCurrentProject.ts 中的 CURRENT_PROJECT_KEY 保持一致
 */
const CURRENT_PROJECT_KEY = "currentProjectId";

/**
 * 获取当前活跃项目的 UUID
 *
 * 从 localStorage 读取当前项目 ID，如果未设置则返回默认项目 UUID。
 * 与 useCurrentProject.ts 的逻辑保持一致。
 *
 * @returns 当前项目的 UUID，如果无法获取则返回 "default"
 */
function getCurrentProjectUuid(): string {
  if (typeof window === "undefined") {
    return DEFAULT_PROJECT_UUID;
  }
  const stored = localStorage.getItem(CURRENT_PROJECT_KEY);
  return stored || DEFAULT_PROJECT_UUID;
}

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
 * 解码 base64 编码的 XML 内容
 *
 * 检测并解码 data:image/svg+xml;base64, 前缀的内容
 *
 * @param xml - 原始 XML 字符串（可能包含 base64 编码）
 * @returns 解码后的 XML 字符串，如果不是 base64 格式则返回原始内容
 */
function decodeBase64XML(xml: string): string {
  const prefix = "data:image/svg+xml;base64,";

  if (xml.startsWith(prefix)) {
    try {
      const base64Content = xml.substring(prefix.length);

      // 正确处理 UTF-8 编码：
      // atob() 返回的是 binary string (Latin-1)，需要转换为 UTF-8
      const binaryString = atob(base64Content);
      const bytes = Uint8Array.from(binaryString, (c) => c.charCodeAt(0));
      const decoded = new TextDecoder("utf-8").decode(bytes);

      return decoded;
    } catch (error) {
      console.error("[DrawIO Tools] Base64 解码失败:", error);
      return xml;
    }
  }

  return xml;
}

/**
 * 保存 XML 到存储的内部实现（不触发事件）
 *
 * @param decodedXml - 已解码的 XML 内容
 * @throws {Error} 当前项目不存在时抛出错误
 */
async function saveDrawioXMLInternal(decodedXml: string): Promise<void> {
  const storage = await getStorage();
  const projectUuid = getCurrentProjectUuid();

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
    latestVersion: null,
    resolveVersionById: (id) => storage.getXMLVersion(id),
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

  const decodedXml = decodeBase64XML(xml);

  try {
    await saveDrawioXMLInternal(decodedXml);
  } catch (error) {
    console.error("[DrawIO Tools] 保存 XML 失败:", error);
    throw error;
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
    const projectUuid = getCurrentProjectUuid();

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
      return {
        success: false,
        error: "未找到保存的图表数据",
      };
    }

    // 优先返回 WIP 版本
    const latestVersion =
      versions.find((v) => v.semantic_version === WIP_VERSION) ?? versions[0];
    const resolvedXml = await materializeVersionXml(latestVersion, (id) =>
      storage.getXMLVersion(id),
    );
    const decodedXml = decodeBase64XML(resolvedXml);

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
): Promise<ReplaceXMLResult & { xml?: string }> {
  if (typeof window === "undefined") {
    return {
      success: false,
      message: "操作失败",
      error: "此函数只能在浏览器环境中使用",
    };
  }

  const validation = validateXML(drawio_xml);
  if (!validation.valid) {
    return {
      success: false,
      message: "XML 格式验证失败",
      error: validation.error,
    };
  }

  try {
    const decodedXml = decodeBase64XML(drawio_xml);
    await saveDrawioXMLInternal(decodedXml);

    return {
      success: true,
      message: "XML 内容已成功保存",
      xml: decodedXml,
    };
  } catch (error) {
    return {
      success: false,
      message: "保存失败",
      error: error instanceof Error ? error.message : "写入数据失败",
    };
  }
}
