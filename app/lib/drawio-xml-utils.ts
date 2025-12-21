import { inflateRaw } from "pako";
import { ErrorCodes, type ErrorCode } from "@/app/errors/error-codes";
import type { XMLValidationResult } from "@/app/types/drawio-tools";
import { getDomParser } from "./dom-parser-cache";
import { toErrorString } from "./error-handler";

const DATA_URI_PREFIX = "data:image/svg+xml;base64,";
const DIAGRAM_TAG_REGEX = /<diagram\b([^>]*)>([\s\S]*?)<\/diagram>/gi;
const COMPRESSED_ATTR_REGEX =
  /\scompressed\s*=\s*"(?:true|false)"|\scompressed\s*=\s*'(?:true|false)'/gi;
const buildXmlError = (code: ErrorCode, message: string) =>
  new Error(`[${code}] ${message}`);

/**
 * 验证 XML 格式是否合法
 */
export function validateXMLFormat(xml: string): XMLValidationResult {
  const parser = getDomParser();
  if (!parser) {
    return {
      valid: false,
      error: "当前环境不支持 DOMParser，无法验证 XML",
    };
  }

  try {
    const doc = parser.parseFromString(xml, "text/xml");
    const parseErrors =
      doc.getElementsByTagName?.("parsererror") ??
      (doc as unknown as Document).querySelectorAll?.("parsererror");

    if (parseErrors && parseErrors.length > 0) {
      const message =
        parseErrors[0]?.textContent?.trim() || "XML 格式错误，解析失败";
      return { valid: false, error: message };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: toErrorString(error) || "XML 解析异常",
    };
  }
}

/**
 * 统一的 DrawIO XML 归一化工具
 *
 * 支持三种输入：
 * 1) 纯 XML 字符串
 * 2) 带 data URI 前缀的 Base64
 * 3) 裸 Base64
 *
 * @throws 当输入为空、解码失败或解码结果不是合法 XML 时抛出错误
 */
export function normalizeDiagramXml(payload: string): string {
  if (!payload) {
    throw buildXmlError(
      ErrorCodes.XML_PAYLOAD_EMPTY,
      "XML payload cannot be empty",
    );
  }

  const trimmed = payload.trimStart();
  let resolvedXml: string;

  // 1. 已经是 XML，直接返回（保留原始内容，避免破坏缩进）
  if (trimmed.startsWith("<")) {
    resolvedXml = payload;
  } else if (trimmed.startsWith(DATA_URI_PREFIX)) {
    // 2. data URI 前缀的 Base64
    const base64Content = trimmed.slice(DATA_URI_PREFIX.length);
    try {
      resolvedXml = decodeBase64(base64Content);
    } catch (error) {
      const message = toErrorString(error);
      throw buildXmlError(
        ErrorCodes.XML_DECODE_FAILED,
        `Failed to decode Base64 XML: ${message}`,
      );
    }
  } else {
    // 3. 裸 Base64
    let decoded: string;
    try {
      decoded = decodeBase64(trimmed);
    } catch (error) {
      const message = toErrorString(error);
      throw buildXmlError(
        ErrorCodes.XML_DECODE_FAILED,
        `Failed to decode Base64 XML: ${message}`,
      );
    }

    if (!decoded.trimStart().startsWith("<")) {
      throw buildXmlError(
        ErrorCodes.XML_INVALID_FORMAT,
        "Decoded result is not valid XML",
      );
    }
    resolvedXml = decoded;
  }

  return maybeInflateDrawioDiagrams(resolvedXml);
}

/**
 * 跨平台 Base64 解码（Node / 浏览器）
 */
export function decodeBase64(base64: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(base64, "base64").toString("utf-8");
  }

  if (typeof atob !== "undefined") {
    const binaryString = atob(base64);
    const bytes = Uint8Array.from(binaryString, (char) => char.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  }

  throw buildXmlError(
    ErrorCodes.XML_ENV_NOT_SUPPORTED,
    "Base64 decoding is not supported in the current environment",
  );
}

function decodeBase64ToUint8Array(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(base64, "base64"));
  }

  if (typeof atob !== "undefined") {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i += 1) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  throw buildXmlError(
    ErrorCodes.XML_ENV_NOT_SUPPORTED,
    "Base64 decoding is not supported in the current environment",
  );
}

/**
 * 如果 <diagram> 的内容是 DrawIO 压缩（deflate + base64 + encodeURIComponent），进行解压
 * 返回原始内容（若解压失败或无需处理则返回原始 XML）
 */
function maybeInflateDrawioDiagrams(xml: string): string {
  let changed = false;

  const replaced = xml.replace(
    DIAGRAM_TAG_REGEX,
    (match: string, attrs: string = "", inner: string = "") => {
      const content = inner.trim();
      // 已经是展开的 mxGraphModel，或者空内容，直接跳过
      if (!content || content.startsWith("<")) {
        return match;
      }

      const inflated = inflateDiagramContent(content);
      if (!inflated || !inflated.trimStart().startsWith("<")) {
        return match;
      }

      changed = true;

      // 清理 compressed 属性，避免后续误判
      const cleanedAttrs = (attrs || "")
        .replace(COMPRESSED_ATTR_REGEX, "")
        .trim();
      const openTag = cleanedAttrs ? `<diagram ${cleanedAttrs}>` : "<diagram>";

      return `${openTag}${inflated}</diagram>`;
    },
  );

  return changed ? replaced : xml;
}

function inflateDiagramContent(encoded: string): string | null {
  try {
    const sanitized = encoded.replace(/\s+/g, "");
    const binary = decodeBase64ToUint8Array(sanitized);
    const inflated = inflateRaw(binary, { to: "string" });
    const inflatedString =
      typeof inflated === "string"
        ? inflated
        : new TextDecoder("utf-8").decode(inflated);

    // DrawIO 使用 encodeURIComponent 包装压缩内容，这里尝试解码
    try {
      return decodeURIComponent(inflatedString);
    } catch {
      // 若不是 URI 编码格式，则原样返回解压结果
      return inflatedString;
    }
  } catch {
    return null;
  }
}
