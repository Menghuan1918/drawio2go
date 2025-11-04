/**
 * DrawIO XML 前端存储工具集
 *
 * 负责在浏览器环境下管理图表 XML 的持久化与事件分发。
 * 工具函数会在写入 localStorage 前自动处理 base64 编码的内容，
 * 并在更新后通过自定义事件通知编辑器重新加载。
 */

import type {
  GetXMLResult,
  ReplaceXMLResult,
  XMLValidationResult,
} from "../types/drawio-tools";

/**
 * localStorage 中存储 DrawIO XML 的键名
 */
const STORAGE_KEY = "currentDiagram";

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
      const decoded = atob(base64Content);
      return decoded;
    } catch (error) {
      console.error("[DrawIO Tools] Base64 解码失败:", error);
      return xml;
    }
  }

  return xml;
}

/**
 * 保存 XML 到 localStorage（自动解码 base64）
 *
 * 统一的保存入口，确保 localStorage 中永远存储解码后的纯 XML
 *
 * @param xml - XML 内容（可能包含 base64 编码）
 */
export function saveDrawioXML(xml: string): void {
  if (typeof window === "undefined") {
    throw new Error("saveDrawioXML 只能在浏览器环境中使用");
  }

  const decodedXml = decodeBase64XML(xml);
  localStorage.setItem(STORAGE_KEY, decodedXml);
  triggerUpdateEvent(decodedXml);
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
      })
    );
  }
}

/**
 * 获取当前 DrawIO XML 内容
 */
export function getDrawioXML(): GetXMLResult {
  if (typeof window === "undefined") {
    return {
      success: false,
      error: "此函数只能在浏览器环境中使用",
    };
  }

  try {
    const xml = localStorage.getItem(STORAGE_KEY);

    if (!xml) {
      return {
        success: false,
        error: "未找到保存的图表数据",
      };
    }

    const decodedXml = decodeBase64XML(xml);

    return {
      success: true,
      xml: decodedXml,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "读取数据失败",
    };
  }
}

/**
 * 覆写 DrawIO XML 内容
 */
export function replaceDrawioXML(drawio_xml: string): ReplaceXMLResult {
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
    saveDrawioXML(drawio_xml);

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
