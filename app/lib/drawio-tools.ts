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

/**
 * 固定的项目 UUID（单项目模式）
 *
 * 当前所有 DrawIO XML 都存储在 "default" 项目下。
 * 这种设计简化了存储逻辑，适合个人使用场景。
 *
 * 如需多项目支持，需要：
 * 1. 添加项目选择器 UI
 * 2. 在存储层添加项目切换逻辑
 * 3. 修改此常量为动态获取
 */
const PROJECT_UUID = "default";

/**
 * 固定的语义版本号（仅保存最新版）
 *
 * 当前策略：每次保存自动删除旧版本，仅保留最新版本。
 * 这避免了版本管理的复杂性，保持存储简洁。
 *
 * 见 replaceXML() 中的自动清理逻辑。
 */
const SEMANTIC_VERSION = "latest";

/**
 * 自定义事件名称，用于通知编辑器重新加载
 */
const UPDATE_EVENT = "drawio-xml-updated";

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
 */
async function saveDrawioXMLInternal(decodedXml: string): Promise<void> {
  const storage = await getStorage();

  // 获取现有版本
  const existingVersions = await storage.getXMLVersionsByProject(PROJECT_UUID);

  // 删除所有旧版本（仅保留最新版策略）
  for (const version of existingVersions) {
    await storage.deleteXMLVersion(version.id);
  }

  // 创建新版本
  await storage.createXMLVersion({
    project_uuid: PROJECT_UUID,
    semantic_version: SEMANTIC_VERSION,
    xml_content: decodedXml,
    source_version_id: 0,
  });
}

/**
 * 保存 XML 到 IndexedDB（自动解码 base64）
 *
 * 用于用户手动编辑时的自动保存，不触发 UPDATE_EVENT
 * 避免在用户编辑时触发不必要的 merge 操作
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
    // 注意：不触发 UPDATE_EVENT，避免用户编辑时触发 merge 循环
  } catch (error) {
    console.error("[DrawIO Tools] 保存 XML 失败:", error);
    throw error;
  }
}

/**
 * 触发自定义事件，通知组件 XML 已更新
 *
 * @param xml - 更新后的 XML 内容
 */
function triggerUpdateEvent(xml: string): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(UPDATE_EVENT, {
        detail: { xml },
      }),
    );
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
    const versions = await storage.getXMLVersionsByProject(PROJECT_UUID);

    if (versions.length === 0) {
      return {
        success: false,
        error: "未找到保存的图表数据",
      };
    }

    // 获取最新版本（数组已按创建时间倒序排列）
    const latestVersion = versions[0];
    const decodedXml = decodeBase64XML(latestVersion.xml_content);

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
 * 覆写 DrawIO XML 内容（仅供 AI 工具调用）
 *
 * 会触发 UPDATE_EVENT，通知编辑器重新加载
 * 用于 AI 工具更新图表时，需要编辑器同步显示新内容
 */
export async function replaceDrawioXML(
  drawio_xml: string,
): Promise<ReplaceXMLResult> {
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

    // 触发 UPDATE_EVENT，通知编辑器 merge 新内容
    triggerUpdateEvent(decodedXml);

    return {
      success: true,
      message: "XML 内容已成功替换并已通知编辑器重新加载",
    };
  } catch (error) {
    return {
      success: false,
      message: "保存失败",
      error: error instanceof Error ? error.message : "写入数据失败",
    };
  }
}

export { UPDATE_EVENT };
