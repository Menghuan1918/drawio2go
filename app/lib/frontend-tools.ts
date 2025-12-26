import { tool, type Tool } from "ai";

import { AI_TOOL_NAMES } from "@/lib/constants/tool-names";
import { createLogger } from "@/lib/logger";
import { XMLSerializer as XmldomSerializer } from "@xmldom/xmldom";
import * as xpath from "xpath";

import { normalizeDiagramXml } from "./drawio-xml-utils";
import { toErrorString } from "./error-handler";
import { tryParseXmlWithLocator } from "./xml-parse-utils";
import {
  filterNodesByPages,
  isGlobalNode,
  isNodeInAllowedPages,
  validatePageIds,
} from "./page-filter-utils";
import {
  drawioEditBatchInputSchema,
  drawioReadInputSchema,
  type DrawioEditBatchRequest,
  type DrawioEditOperation,
  type DrawioReadInput,
} from "./schemas/drawio-tool-schemas";
import type {
  DrawioEditBatchResult,
  DrawioListResult,
  DrawioQueryResult,
  DrawioReadResult,
} from "@/app/types/drawio-tools";
import type {
  ToolDrawioOperationErrorDetails,
  ToolErrorDetails,
  ToolErrorResult,
  ToolPageFilterErrorDetails,
  ToolReplaceXmlErrorDetails,
  ToolXmlParseErrorDetails,
  ToolXpathErrorDetails,
} from "@/app/types/tool-errors";

const logger = createLogger("Frontend DrawIO Tools");
const { DRAWIO_READ, DRAWIO_EDIT_BATCH } = AI_TOOL_NAMES;
const xmlSerializer = new XmldomSerializer();

type InsertPosition = "append_child" | "prepend_child" | "before" | "after";
type NodeSelectionOptions = {
  allowedPageIds?: Set<string>;
  /** 当启用“仅选中页面”时，禁止匹配 <mxfile> 等全局节点 */
  rejectGlobalNodes?: boolean;
};

export interface PageFilterContext {
  /** 选中的页面 ID 数组（空数组表示全选） */
  selectedPageIds: string[];
  /** 是否为 MCP 上下文（true 表示跳过页面过滤） */
  isMcpContext: boolean;
}

export interface FrontendToolContext {
  getDrawioXML: () => Promise<string>;
  replaceDrawioXML: (
    xml: string,
    options?: { description?: string },
  ) => Promise<{ success: boolean; error?: string }>;
  onVersionSnapshot?: (description: string) => Promise<void>;
  /** 获取页面过滤上下文（用于“仅选中页面”场景）；返回 null/undefined 表示不启用过滤 */
  getPageFilterContext?: () => PageFilterContext | null;
}

function parseXml(xml: string): Document {
  const parsed = tryParseXmlWithLocator(xml, "text/xml");
  if (!parsed.success) {
    const err = new Error(
      `${parsed.formatted}\nEnsure the XML is well-formed.`,
    );
    (err as Error & { errorCode?: string }).errorCode = "xml_parse";
    (err as Error & { errorDetails?: ToolXmlParseErrorDetails }).errorDetails =
      {
        kind: "xml_parse",
        error: parsed.error,
        rawError: parsed.rawError,
        location: parsed.location,
        formatted: parsed.formatted,
        stage: "diagram_xml",
      };
    throw err;
  }
  return parsed.document;
}

function buildToolErrorResult(params: {
  error: string;
  message: string;
  errorDetails?: ToolErrorDetails;
}): ToolErrorResult {
  return {
    success: false,
    error: params.error,
    message: params.message,
    errorDetails: params.errorDetails,
  };
}

function normalizeUnknownToToolErrorResult(error: unknown): ToolErrorResult {
  const record =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : null;

  const errorCode =
    (record && typeof record.errorCode === "string" && record.errorCode) ||
    "unknown";

  const details =
    record && "errorDetails" in record
      ? (record.errorDetails as unknown)
      : null;

  return buildToolErrorResult({
    error: errorCode,
    message: toErrorString(error) || "未知错误",
    errorDetails:
      details && typeof details === "object"
        ? (details as ToolErrorDetails)
        : undefined,
  });
}

function getAllowedPageIdsOrNull(
  context: FrontendToolContext,
  xml: string,
): Set<string> | null {
  const filterContext = context.getPageFilterContext?.() ?? null;
  if (!filterContext) return null;

  if (filterContext.isMcpContext) return null;
  if (!filterContext.selectedPageIds?.length) return null;

  const validation = validatePageIds(xml, filterContext.selectedPageIds);
  if (!validation.valid) {
    const err = new Error(
      `页面过滤失败：检测到不存在的页面 ID：${validation.invalidIds.join(", ")}`,
    );
    (err as Error & { errorCode?: string }).errorCode = "page_filter";
    (
      err as Error & { errorDetails?: ToolPageFilterErrorDetails }
    ).errorDetails = {
      kind: "page_filter",
      selectedPageIds: filterContext.selectedPageIds,
      invalidPageIds: validation.invalidIds,
    };
    throw err;
  }

  return new Set(filterContext.selectedPageIds);
}

function normalizeIds(id?: string | string[]): string[] {
  if (!id) return [];
  const ids = Array.isArray(id) ? id : [id];
  const unique = new Set<string>();
  for (const value of ids) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    unique.add(trimmed);
  }
  return Array.from(unique);
}

function collectAttributes(element: Element): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (let i = 0; i < element.attributes.length; i++) {
    const attribute = element.attributes.item(i);
    if (attribute) {
      attributes[attribute.name] = attribute.value;
    }
  }
  return attributes;
}

function buildLocatorLabel(locator: { xpath?: string; id?: string }): string {
  if (locator.id?.trim()) {
    return `id="${locator.id.trim()}"`;
  }
  if (locator.xpath?.trim()) {
    return `xpath="${locator.xpath.trim()}"`;
  }
  return "no locator provided";
}

function buildXPathStringLiteral(value: string): string {
  if (!value.includes("'")) {
    return `'${value}'`;
  }

  if (!value.includes(`"`)) {
    return `"${value}"`;
  }

  const parts = value.split("'");
  const singleQuoteLiteral = `"'"`;
  const separator = `, ${singleQuoteLiteral}, `;
  const concatParts = parts.map((part) => `'${part}'`).join(separator);
  return `concat(${concatParts})`;
}

/**
 * Resolve id or xpath to a standardized XPath expression.
 * - Prioritizes id if both provided
 * - id converts to //mxCell[@id='xxx'], with XPath 1.0 string escaping
 */
function resolveLocator(locator: { xpath?: string; id?: string }): string {
  if (locator.id && locator.id.trim() !== "") {
    const id = locator.id.trim();
    return `//mxCell[@id=${buildXPathStringLiteral(id)}]`;
  }

  if (locator.xpath && locator.xpath.trim() !== "") {
    return locator.xpath;
  }

  throw new Error(
    "Locator requires either 'xpath' or 'id'. Provide at least one targeting method.",
  );
}

function selectNodes(
  document: Document,
  expression: string,
  options?: NodeSelectionOptions,
): Node[] {
  try {
    const selected = xpath.select(expression, document);

    let nodes: Node[] = [];
    if (Array.isArray(selected)) {
      nodes = selected;
    } else if (xpath.isNodeLike(selected)) {
      nodes = [selected];
    } else if (selected == null) {
      nodes = [];
    } else {
      throw new Error(
        `XPath expression did not return node-set results (returned ${typeof selected}).`,
      );
    }

    if (
      options?.rejectGlobalNodes &&
      nodes.length > 0 &&
      nodes.some(isGlobalNode)
    ) {
      const err = new Error(
        "当前仅选中部分页面，禁止匹配全局节点（不属于任何页面，例如 <mxfile>）。请将 XPath 限定在页面（<diagram>）范围内，或切换为“全选页面”。",
      );
      (err as Error & { errorCode?: string }).errorCode = "page_filter";
      (err as Error & { errorDetails?: ToolErrorDetails }).errorDetails = {
        kind: "page_filter",
        reason: "reject_global_nodes",
        expression,
      };
      throw err;
    }

    if (options?.allowedPageIds) {
      nodes = filterNodesByPages(nodes, options.allowedPageIds);
    }

    return nodes;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("当前仅选中部分页面，禁止匹配全局节点")
    ) {
      throw error;
    }
    const errorMsg = toErrorString(error);
    const err = new Error(
      `Invalid XPath expression: "${expression}". ${errorMsg}`,
    );
    (err as Error & { errorCode?: string }).errorCode = "xpath_error";
    (err as Error & { errorDetails?: ToolXpathErrorDetails }).errorDetails = {
      kind: "xpath_error",
      expression,
      error: errorMsg,
    };
    throw err;
  }
}

function executeListMode(
  document: Document,
  filter: "all" | "vertices" | "edges",
  allowedPageIds?: Set<string>,
): DrawioReadResult {
  const cells = document.getElementsByTagName("mxCell");
  const results: DrawioListResult[] = [];

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i] as Element;
    const id = cell.getAttribute("id");
    if (!id) continue;

    if (allowedPageIds && !isNodeInAllowedPages(cell, allowedPageIds)) {
      continue;
    }

    const isVertex = cell.getAttribute("vertex") === "1";
    const isEdge = cell.getAttribute("edge") === "1";
    let type: "vertex" | "edge" | "unknown" = "unknown";
    if (isVertex) type = "vertex";
    else if (isEdge) type = "edge";

    if (filter === "vertices" && !isVertex) continue;
    if (filter === "edges" && !isEdge) continue;

    results.push({
      id,
      type,
      attributes: collectAttributes(cell),
      matched_xpath: buildXPathForNode(cell),
    });
  }

  return { success: true, list: results };
}

function buildXPathForNode(node: Node): string {
  switch (node.nodeType) {
    case node.DOCUMENT_NODE:
      return "";
    case node.ELEMENT_NODE: {
      const element = node as Element;
      const parent = element.parentNode;
      const index = getElementIndex(element);
      const segment =
        index > 1 ? `${element.tagName}[${index}]` : element.tagName;
      const parentPath = parent ? buildXPathForNode(parent) : "";
      return `${parentPath}/${segment}`;
    }
    case node.ATTRIBUTE_NODE: {
      const attr = node as Attr;
      const owner = attr.ownerElement;
      const ownerPath = owner ? buildXPathForNode(owner) : "";
      return `${ownerPath}/@${attr.name}`;
    }
    case node.TEXT_NODE: {
      const parent = node.parentNode;
      const parentPath = parent ? buildXPathForNode(parent) : "";
      const index = getTextNodeIndex(node);
      const segment = index > 1 ? `text()[${index}]` : "text()";
      return `${parentPath}/${segment}`;
    }
    default:
      return "";
  }
}

function getElementIndex(element: Element): number {
  const parent = element.parentNode;
  if (!parent) return 1;

  const siblings = Array.from(parent.childNodes).filter(
    (node) =>
      node.nodeType === node.ELEMENT_NODE &&
      (node as Element).tagName === element.tagName,
  );
  const position = siblings.indexOf(element);
  return position >= 0 ? position + 1 : 1;
}

function getTextNodeIndex(node: Node): number {
  const parent = node.parentNode;
  if (!parent) return 1;

  const textSiblings = Array.from(parent.childNodes).filter(
    (child): child is ChildNode => child.nodeType === child.TEXT_NODE,
  );
  const position = textSiblings.indexOf(node as ChildNode);
  return position >= 0 ? position + 1 : 1;
}

function convertNodeToResult(node: Node): DrawioQueryResult | null {
  const matchedXPath = buildXPathForNode(node);

  switch (node.nodeType) {
    case node.ELEMENT_NODE: {
      const element = node as Element;
      return {
        type: "element",
        tag_name: element.tagName,
        attributes: collectAttributes(element),
        xml_string: xmlSerializer.serializeToString(element),
        matched_xpath: matchedXPath,
      };
    }
    case node.ATTRIBUTE_NODE: {
      const attr = node as Attr;
      return {
        type: "attribute",
        name: attr.name,
        value: attr.value,
        matched_xpath: matchedXPath,
      };
    }
    case node.TEXT_NODE: {
      return {
        type: "text",
        value: node.nodeValue ?? "",
        matched_xpath: matchedXPath,
      };
    }
    default:
      return null;
  }
}

function stripInvalidXmlChars(value: string): string {
  let changed = false;
  const chars: string[] = [];

  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i] ?? "";
    const code = value.charCodeAt(i);

    // XML 1.0 allowlist (subset): tab/newline/CR + visible ASCII/Unicode.
    const isAllowed =
      code === 0x09 || code === 0x0a || code === 0x0d || code >= 0x20;

    if (!isAllowed) {
      changed = true;
      continue;
    }

    chars.push(ch);
  }

  return changed ? chars.join("") : value;
}

function escapeBareAmpersands(value: string): string {
  return value.replace(
    /&(?!#\d+;|#x[0-9a-fA-F]+;|(?:amp|lt|gt|apos|quot);)/g,
    "&amp;",
  );
}

function maybeDecodeEscapedXmlMarkup(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes("<")) return value;
  if (!trimmed.includes("&lt;")) return value;

  // 注：此处仅尝试恢复“标签层”的转义（&lt;mxCell ...&gt;），不解码 &amp;，避免生成非法 XML。
  return trimmed
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x22;/gi, '"')
    .replace(/&#x27;/gi, "'");
}

function normalizeXmlFragmentForParsing(value: string): {
  xml: string;
  appliedFixes: string[];
} {
  const appliedFixes: string[] = [];
  let xml = value;

  const decoded = maybeDecodeEscapedXmlMarkup(xml);
  if (decoded !== xml) {
    appliedFixes.push("decode_escaped_markup");
    xml = decoded;
  }

  const stripped = stripInvalidXmlChars(xml);
  if (stripped !== xml) {
    appliedFixes.push("strip_control_chars");
    xml = stripped;
  }

  const escaped = escapeBareAmpersands(xml);
  if (escaped !== xml) {
    appliedFixes.push("escape_bare_ampersands");
    xml = escaped;
  }

  return { xml, appliedFixes };
}

function isMxCellElement(node: Node): node is Element {
  return (
    node.nodeType === node.ELEMENT_NODE &&
    (node as Element).tagName === "mxCell"
  );
}

function collectEdgesConnectedToVertex(
  document: Document,
  vertexId: string,
  nodeSelectionOptions?: NodeSelectionOptions,
): Node[] {
  const idLiteral = buildXPathStringLiteral(vertexId);
  const edgesXpath = `//mxCell[@edge='1' and (@source=${idLiteral} or @target=${idLiteral})]`;
  return selectNodes(document, edgesXpath, nodeSelectionOptions);
}

function collectVerticesConnectedToEdge(
  document: Document,
  edge: Element,
  nodeSelectionOptions?: NodeSelectionOptions,
): Node[] {
  const sourceId = edge.getAttribute("source")?.trim();
  const targetId = edge.getAttribute("target")?.trim();
  const linked = [sourceId, targetId].filter((value): value is string =>
    Boolean(value),
  );

  const nodes: Node[] = [];
  for (const linkedId of linked) {
    const linkedXpath = `//mxCell[@id=${buildXPathStringLiteral(linkedId)}]`;
    nodes.push(...selectNodes(document, linkedXpath, nodeSelectionOptions));
  }
  return nodes;
}

type PushUniqueFn = (node: Node) => void;

function appendRelatedNodesForVertex(args: {
  document: Document;
  vertexId: string;
  nodeSelectionOptions?: NodeSelectionOptions;
  pushUnique: PushUniqueFn;
}): void {
  const edgeNodes = collectEdgesConnectedToVertex(
    args.document,
    args.vertexId,
    args.nodeSelectionOptions,
  );

  for (const edgeNode of edgeNodes) {
    args.pushUnique(edgeNode);
  }

  const otherEndpointIds = new Set<string>();
  for (const edgeNode of edgeNodes) {
    if (!isMxCellElement(edgeNode)) continue;
    const sourceId = edgeNode.getAttribute("source")?.trim();
    const targetId = edgeNode.getAttribute("target")?.trim();
    if (sourceId && sourceId !== args.vertexId) otherEndpointIds.add(sourceId);
    if (targetId && targetId !== args.vertexId) otherEndpointIds.add(targetId);
  }

  for (const otherId of otherEndpointIds) {
    const otherXpath = `//mxCell[@id=${buildXPathStringLiteral(otherId)}]`;
    const otherNodes = selectNodes(
      args.document,
      otherXpath,
      args.nodeSelectionOptions,
    );
    for (const otherNode of otherNodes) {
      args.pushUnique(otherNode);
    }
  }
}

function appendRelatedNodesForEdge(args: {
  document: Document;
  edge: Element;
  nodeSelectionOptions?: NodeSelectionOptions;
  pushUnique: PushUniqueFn;
}): void {
  const linkedNodes = collectVerticesConnectedToEdge(
    args.document,
    args.edge,
    args.nodeSelectionOptions,
  );
  for (const linkedNode of linkedNodes) {
    args.pushUnique(linkedNode);
  }
}

function executeQueryById(
  document: Document,
  id: string | string[],
  nodeSelectionOptions?: NodeSelectionOptions,
): DrawioQueryResult[] {
  const ids = normalizeIds(id);
  const results: DrawioQueryResult[] = [];
  const seenXpaths = new Set<string>();

  const pushUnique = (node: Node) => {
    const converted = convertNodeToResult(node);
    if (!converted) return;
    const key =
      typeof converted.matched_xpath === "string" && converted.matched_xpath
        ? converted.matched_xpath
        : JSON.stringify(converted);
    if (seenXpaths.has(key)) return;
    seenXpaths.add(key);
    results.push(converted);
  };

  for (const currentId of ids) {
    const resolvedXpath = resolveLocator({ id: currentId });
    const nodes = selectNodes(document, resolvedXpath, nodeSelectionOptions);
    for (const node of nodes) {
      pushUnique(node);

      if (!isMxCellElement(node)) continue;

      if (node.getAttribute("vertex") === "1") {
        appendRelatedNodesForVertex({
          document,
          vertexId: currentId,
          nodeSelectionOptions,
          pushUnique,
        });
        continue;
      }

      if (node.getAttribute("edge") === "1") {
        appendRelatedNodesForEdge({
          document,
          edge: node,
          nodeSelectionOptions,
          pushUnique,
        });
      }
    }
  }

  return results;
}

function executeQueryByXpath(
  document: Document,
  xpathExpression: string,
  nodeSelectionOptions?: NodeSelectionOptions,
): DrawioQueryResult[] {
  const trimmedXpath = xpathExpression.trim();
  let selected: xpath.SelectReturnType;
  try {
    selected = xpath.select(trimmedXpath, document);
  } catch (error) {
    const errorMsg = toErrorString(error);
    const err = new Error(
      `Invalid XPath expression: "${trimmedXpath}". ${errorMsg}`,
    );
    (err as Error & { errorCode?: string }).errorCode = "xpath_error";
    (err as Error & { errorDetails?: ToolXpathErrorDetails }).errorDetails = {
      kind: "xpath_error",
      expression: trimmedXpath,
      error: errorMsg,
    };
    throw err;
  }

  if (!Array.isArray(selected)) {
    if (
      typeof selected === "string" ||
      typeof selected === "number" ||
      typeof selected === "boolean"
    ) {
      return [
        {
          type: "text",
          value: String(selected),
          matched_xpath: trimmedXpath,
        },
      ];
    }

    if (selected == null) {
      return [];
    }

    if (xpath.isNodeLike(selected)) {
      const node = selected;
      if (nodeSelectionOptions?.rejectGlobalNodes && isGlobalNode(node)) {
        const err = new Error(
          "当前仅选中部分页面，禁止读取全局节点（不属于任何页面，例如 <mxfile>）。请将 XPath 限定在页面（<diagram>）范围内，或切换为“全选页面”。",
        );
        (err as Error & { errorCode?: string }).errorCode = "page_filter";
        (err as Error & { errorDetails?: ToolErrorDetails }).errorDetails = {
          kind: "page_filter",
          reason: "reject_global_nodes",
          expression: trimmedXpath,
        };
        throw err;
      }

      if (
        nodeSelectionOptions?.allowedPageIds &&
        !isNodeInAllowedPages(node, nodeSelectionOptions.allowedPageIds)
      ) {
        return [];
      }

      const converted = convertNodeToResult(node);
      return converted ? [converted] : [];
    }

    return [];
  }

  let nodes: Node[] = selected;
  if (
    nodeSelectionOptions?.rejectGlobalNodes &&
    nodes.length > 0 &&
    nodes.some(isGlobalNode)
  ) {
    const err = new Error(
      "当前仅选中部分页面，禁止读取全局节点（不属于任何页面，例如 <mxfile>）。请将 XPath 限定在页面（<diagram>）范围内，或切换为“全选页面”。",
    );
    (err as Error & { errorCode?: string }).errorCode = "page_filter";
    (err as Error & { errorDetails?: ToolErrorDetails }).errorDetails = {
      kind: "page_filter",
      reason: "reject_global_nodes",
      expression: trimmedXpath,
    };
    throw err;
  }

  if (nodeSelectionOptions?.allowedPageIds) {
    nodes = filterNodesByPages(nodes, nodeSelectionOptions.allowedPageIds);
  }

  const results: DrawioQueryResult[] = [];
  for (const node of nodes) {
    const converted = convertNodeToResult(node);
    if (converted) results.push(converted);
  }
  return results;
}

function createElementFromXml(document: Document, xml: string): Element {
  const firstAttempt = tryParseXmlWithLocator(xml, "text/xml");

  const parsed = firstAttempt.success
    ? firstAttempt
    : (() => {
        const normalized = normalizeXmlFragmentForParsing(xml);
        if (!normalized.appliedFixes.length) return firstAttempt;

        const recovered = tryParseXmlWithLocator(normalized.xml, "text/xml");
        if (recovered.success) return recovered;

        return {
          ...recovered,
          recoveryAttempted: true,
          recoveryApplied: normalized.appliedFixes,
          originalFormatted: firstAttempt.formatted,
        };
      })();

  if (!parsed.success) {
    const err = new Error(
      `Failed to parse new_xml.\n${parsed.formatted}\nEnsure the XML fragment is well-formed.`,
    );
    (err as Error & { errorCode?: string }).errorCode = "xml_parse";
    (err as Error & { errorDetails?: ToolXmlParseErrorDetails }).errorDetails =
      {
        kind: "xml_parse",
        error: parsed.error,
        rawError: parsed.rawError,
        location: parsed.location,
        formatted: parsed.formatted,
        stage: "new_xml",
        recoveryAttempted:
          typeof (parsed as { recoveryAttempted?: unknown })
            .recoveryAttempted === "boolean"
            ? (parsed as { recoveryAttempted?: boolean }).recoveryAttempted
            : undefined,
        recoveryApplied: Array.isArray(
          (parsed as { recoveryApplied?: unknown }).recoveryApplied,
        )
          ? (parsed as { recoveryApplied?: string[] }).recoveryApplied
          : undefined,
        originalFormatted:
          typeof (parsed as { originalFormatted?: unknown })
            .originalFormatted === "string"
            ? (parsed as { originalFormatted?: string }).originalFormatted
            : undefined,
      };
    throw err;
  }

  const element = parsed.document.documentElement;
  if (!element) {
    throw new Error(
      "new_xml must contain a root element node. Received empty or text-only content.",
    );
  }

  if (typeof document.importNode === "function") {
    return document.importNode(element, true) as Element;
  }

  return element.cloneNode(true) as Element;
}

function setAttribute(
  document: Document,
  xpath: string,
  locatorLabel: string,
  key: string,
  value: string,
  allowNoMatch?: boolean,
  nodeSelectionOptions?: NodeSelectionOptions,
): void {
  const nodes = selectNodes(document, xpath, nodeSelectionOptions);
  if (nodes.length === 0) {
    if (allowNoMatch) return;
    throw new Error(
      `No elements matched ${locatorLabel}. Use drawio_read first to verify the element exists, or set allow_no_match: true to skip.`,
    );
  }

  for (const node of nodes) {
    if (node.nodeType !== node.ELEMENT_NODE) {
      throw new Error(
        `${locatorLabel} matched a non-element node (type: ${node.nodeType}). Only element nodes can have attributes.`,
      );
    }
    (node as Element).setAttribute(key, value);
  }
}

function removeAttribute(
  document: Document,
  xpath: string,
  locatorLabel: string,
  key: string,
  allowNoMatch?: boolean,
  nodeSelectionOptions?: NodeSelectionOptions,
): void {
  const nodes = selectNodes(document, xpath, nodeSelectionOptions);
  if (nodes.length === 0) {
    if (allowNoMatch) return;
    throw new Error(
      `No elements matched ${locatorLabel}. Use drawio_read first to verify the element exists, or set allow_no_match: true to skip.`,
    );
  }

  for (const node of nodes) {
    if (node.nodeType !== node.ELEMENT_NODE) {
      throw new Error(
        `${locatorLabel} matched a non-element node (type: ${node.nodeType}). Only element nodes can have attributes.`,
      );
    }
    (node as Element).removeAttribute(key);
  }
}

function insertElement(
  document: Document,
  xpath: string,
  locatorLabel: string,
  newXml: string,
  position?: InsertPosition,
  allowNoMatch?: boolean,
  nodeSelectionOptions?: NodeSelectionOptions,
): void {
  const targets = selectNodes(document, xpath, nodeSelectionOptions);
  if (targets.length === 0) {
    if (allowNoMatch) return;
    throw new Error(
      `No elements matched ${locatorLabel}. Use drawio_read first to verify the target exists, or set allow_no_match: true to skip.`,
    );
  }

  const insertPosition: InsertPosition = position ?? "append_child";

  for (const target of targets) {
    const newNode = createElementFromXml(document, newXml);
    switch (insertPosition) {
      case "append_child": {
        if (target.nodeType !== target.ELEMENT_NODE) {
          throw new Error(
            `${locatorLabel} matched a non-element node. append_child requires an element as parent.`,
          );
        }
        (target as Element).appendChild(newNode);
        break;
      }
      case "prepend_child": {
        if (target.nodeType !== target.ELEMENT_NODE) {
          throw new Error(
            `${locatorLabel} matched a non-element node. prepend_child requires an element as parent.`,
          );
        }
        const element = target as Element;
        element.insertBefore(newNode, element.firstChild);
        break;
      }
      case "before": {
        const parent = target.parentNode;
        if (!parent) {
          throw new Error(
            `Cannot insert 'before' ${locatorLabel}: target has no parent node.`,
          );
        }
        parent.insertBefore(newNode, target);
        break;
      }
      case "after": {
        const parent = target.parentNode;
        if (!parent) {
          throw new Error(
            `Cannot insert 'after' ${locatorLabel}: target has no parent node.`,
          );
        }
        parent.insertBefore(newNode, target.nextSibling);
        break;
      }
      default:
        throw new Error(
          `Unknown insert position: "${String(insertPosition)}". Valid values: append_child, prepend_child, before, after`,
        );
    }
  }
}

function removeElement(
  document: Document,
  xpath: string,
  locatorLabel: string,
  allowNoMatch?: boolean,
  nodeSelectionOptions?: NodeSelectionOptions,
): void {
  const nodes = selectNodes(document, xpath, nodeSelectionOptions);
  if (nodes.length === 0) {
    if (allowNoMatch) return;
    throw new Error(
      `No elements matched ${locatorLabel}. Use drawio_read first to verify the element exists, or set allow_no_match: true to skip.`,
    );
  }

  for (const node of nodes) {
    const parent = node.parentNode;
    if (!parent) {
      throw new Error(
        `Cannot remove root node matched by ${locatorLabel}. Only child nodes can be removed.`,
      );
    }
    parent.removeChild(node);
  }
}

function replaceElement(
  document: Document,
  xpath: string,
  locatorLabel: string,
  newXml: string,
  allowNoMatch?: boolean,
  nodeSelectionOptions?: NodeSelectionOptions,
): void {
  const nodes = selectNodes(document, xpath, nodeSelectionOptions);
  if (nodes.length === 0) {
    if (allowNoMatch) return;
    throw new Error(
      `No elements matched ${locatorLabel}. Use drawio_read first to verify the element exists, or set allow_no_match: true to skip.`,
    );
  }

  for (const node of nodes) {
    const parent = node.parentNode;
    if (!parent) {
      throw new Error(
        `Cannot replace root node matched by ${locatorLabel}. Only child nodes can be replaced.`,
      );
    }
    const replacement = createElementFromXml(document, newXml);
    parent.replaceChild(replacement, node);
  }
}

function setTextContent(
  document: Document,
  xpath: string,
  locatorLabel: string,
  value: string,
  allowNoMatch?: boolean,
  nodeSelectionOptions?: NodeSelectionOptions,
): void {
  const nodes = selectNodes(document, xpath, nodeSelectionOptions);
  if (nodes.length === 0) {
    if (allowNoMatch) return;
    throw new Error(
      `No elements matched ${locatorLabel}. Use drawio_read first to verify the element exists, or set allow_no_match: true to skip.`,
    );
  }

  for (const node of nodes) {
    if (node.nodeType !== node.ELEMENT_NODE) {
      throw new Error(
        `${locatorLabel} matched a non-element node (type: ${node.nodeType}). Only element nodes can have text content set.`,
      );
    }

    const element = node as Element;
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
    element.appendChild(document.createTextNode(value));
  }
}

function applyOperation(
  document: Document,
  operation: DrawioEditOperation,
  nodeSelectionOptions?: NodeSelectionOptions,
): void {
  const locatorLabel = buildLocatorLabel(operation);
  const resolvedXpath = resolveLocator({
    xpath: operation.xpath,
    id: operation.id,
  });

  if (operation.type === "set_attribute") {
    setAttribute(
      document,
      resolvedXpath,
      locatorLabel,
      operation.key!,
      operation.value!,
      operation.allow_no_match,
      nodeSelectionOptions,
    );
    return;
  }

  if (operation.type === "remove_attribute") {
    removeAttribute(
      document,
      resolvedXpath,
      locatorLabel,
      operation.key!,
      operation.allow_no_match,
      nodeSelectionOptions,
    );
    return;
  }

  if (operation.type === "insert_element") {
    insertElement(
      document,
      resolvedXpath,
      locatorLabel,
      operation.new_xml!,
      operation.position,
      operation.allow_no_match,
      nodeSelectionOptions,
    );
    return;
  }

  if (operation.type === "remove_element") {
    removeElement(
      document,
      resolvedXpath,
      locatorLabel,
      operation.allow_no_match,
      nodeSelectionOptions,
    );
    return;
  }

  if (operation.type === "replace_element") {
    replaceElement(
      document,
      resolvedXpath,
      locatorLabel,
      operation.new_xml!,
      operation.allow_no_match,
      nodeSelectionOptions,
    );
    return;
  }

  if (operation.type === "set_text_content") {
    setTextContent(
      document,
      resolvedXpath,
      locatorLabel,
      operation.value!,
      operation.allow_no_match,
      nodeSelectionOptions,
    );
    return;
  }

  throw new Error(
    `Unknown operation type: "${(operation as { type: string }).type}". Valid types: set_attribute, remove_attribute, insert_element, remove_element, replace_element, set_text_content`,
  );
}

async function fetchCurrentDiagramXml(
  context: FrontendToolContext,
): Promise<string> {
  const xml = await context.getDrawioXML();
  return normalizeDiagramXml(xml);
}

async function executeDrawioReadFrontend(
  input: DrawioReadInput & { description?: string },
  context: FrontendToolContext,
): Promise<DrawioReadResult> {
  try {
    const { xpath, id, filter = "all", description } = input ?? {};

    const xmlString = await fetchCurrentDiagramXml(context);
    const document = parseXml(xmlString);
    const allowedPageIds = getAllowedPageIdsOrNull(context, xmlString);
    const xpathSelectionOptions: NodeSelectionOptions | undefined =
      allowedPageIds ? { allowedPageIds, rejectGlobalNodes: true } : undefined;

    const trimmedXpath = xpath?.trim() || undefined;
    const finalDescription = description?.trim() || "Read diagram content";
    logger.debug("drawio_read", { description: finalDescription });

    if (!trimmedXpath && !id) {
      return executeListMode(document, filter, allowedPageIds ?? undefined);
    }

    if (id) {
      const results = executeQueryById(
        document,
        id,
        allowedPageIds ? { allowedPageIds } : undefined,
      );
      return { success: true, results };
    }

    if (trimmedXpath) {
      const results = executeQueryByXpath(
        document,
        trimmedXpath,
        xpathSelectionOptions,
      );
      return { success: true, results };
    }

    return buildToolErrorResult({
      error: "invalid_input",
      message: `${DRAWIO_READ}: No valid query parameters provided. Use 'id', 'xpath', or leave empty for ls mode.`,
      errorDetails: { kind: "unknown" },
    });
  } catch (error) {
    return normalizeUnknownToToolErrorResult(error);
  }
}

async function writeBackXmlWithRollback(params: {
  context: FrontendToolContext;
  updatedXml: string;
  originalXml: string;
  description: string;
  rollbackDescription: string;
}): Promise<void> {
  const replaceResult = await params.context.replaceDrawioXML(
    params.updatedXml,
    {
      description: params.description,
    },
  );

  if (replaceResult?.success) return;

  logger.error("Batch edit write-back failed", { replaceResult });

  let rollbackSucceeded = false;
  let rollbackErrorMessage: string | undefined;

  try {
    const rollbackResult = await params.context.replaceDrawioXML(
      params.originalXml,
      {
        description: params.rollbackDescription,
      },
    );
    rollbackSucceeded = Boolean(rollbackResult?.success);
    if (!rollbackSucceeded) {
      rollbackErrorMessage =
        (rollbackResult as { error?: string } | undefined)?.error ||
        "Unknown rollback failure reason";
    }
  } catch (rollbackError) {
    rollbackErrorMessage =
      rollbackError instanceof Error
        ? rollbackError.message
        : String(rollbackError);
  }

  const originalError =
    (replaceResult as { error?: string } | undefined)?.error ||
    "Frontend XML replacement failed (unknown reason)";

  const errorMessage = rollbackSucceeded
    ? `Batch edit write-back failed: ${originalError}. Successfully rolled back to previous state.`
    : `Batch edit write-back failed: ${originalError}. Rollback also failed: ${rollbackErrorMessage ?? "unknown reason"}. Diagram may be in inconsistent state.`;

  const err = new Error(errorMessage);
  const details: ToolReplaceXmlErrorDetails = {
    kind: "replace_xml",
    error: originalError,
    message: errorMessage,
    isRollback: false,
    rollbackSucceeded,
    rollbackErrorMessage,
  };
  (err as Error & { errorCode?: string }).errorCode = "replace_xml";
  (err as Error & { errorDetails?: ToolReplaceXmlErrorDetails }).errorDetails =
    details;
  throw err;
}

async function executeDrawioEditBatchFrontend(
  request: DrawioEditBatchRequest & { description?: string },
  context: FrontendToolContext,
): Promise<DrawioEditBatchResult> {
  try {
    const { operations, description } = request;

    if (!operations.length) {
      return { success: true, operations_applied: 0 };
    }

    const originalXml = await fetchCurrentDiagramXml(context);
    const document = parseXml(originalXml);
    const allowedPageIds = getAllowedPageIdsOrNull(context, originalXml);
    const nodeSelectionOptions: NodeSelectionOptions | undefined =
      allowedPageIds ? { allowedPageIds, rejectGlobalNodes: true } : undefined;

    let operationsApplied = 0;
    let failure: {
      index: number;
      operation: DrawioEditOperation;
      error: string;
    } | null = null;

    for (let index = 0; index < operations.length; index++) {
      const operation = operations[index];
      try {
        applyOperation(document, operation, nodeSelectionOptions);
        operationsApplied += 1;
      } catch (innerError) {
        failure = {
          index,
          operation,
          error: toErrorString(innerError) || "Unknown error",
        };
        break;
      }
    }

    const finalDescription = description?.trim() || "Batch edit diagram";

    if (failure) {
      const details: ToolDrawioOperationErrorDetails = {
        kind: "drawio_operation",
        operationIndex: failure.index,
        operationsTotal: operations.length,
        operationType: failure.operation.type,
        operation: failure.operation as unknown as Record<string, unknown>,
        locator: {
          id:
            typeof failure.operation.id === "string"
              ? failure.operation.id
              : undefined,
          xpath:
            typeof failure.operation.xpath === "string"
              ? failure.operation.xpath
              : undefined,
        },
        allowNoMatch: Boolean(failure.operation.allow_no_match),
        operationsApplied,
        error: failure.error,
      };

      if (operationsApplied > 0) {
        const updatedXml = xmlSerializer.serializeToString(document);

        await context.onVersionSnapshot?.(finalDescription);
        await writeBackXmlWithRollback({
          context,
          updatedXml,
          originalXml,
          description: finalDescription,
          rollbackDescription: "Rollback after batch edit write-back failure",
        });
      }

      return buildToolErrorResult({
        error: "drawio_operation",
        message:
          operationsApplied > 0
            ? `Stopped at operation ${failure.index + 1}/${operations.length} (${failure.operation.type}): ${failure.error}. ` +
              `Applied ${operationsApplied}/${operations.length} operation(s) before stopping.`
            : `Operation ${failure.index + 1}/${operations.length} failed (${failure.operation.type}): ${failure.error}.`,
        errorDetails: details,
      });
    }

    const updatedXml = xmlSerializer.serializeToString(document);

    await context.onVersionSnapshot?.(finalDescription);

    await writeBackXmlWithRollback({
      context,
      updatedXml,
      originalXml,
      description: finalDescription,
      rollbackDescription: "Rollback after batch edit failure",
    });

    return { success: true, operations_applied: operations.length };
  } catch (error) {
    return normalizeUnknownToToolErrorResult(error);
  }
}

function createDrawioReadTool(context: FrontendToolContext) {
  return tool({
    description: `Read DrawIO diagram content. Supports three query modes:

**Modes (choose one):**
1. **ls mode** (default): List all mxCells with summary info
   - Use \`filter\` to show only "vertices" (shapes) or "edges" (connectors)
   - Returns: id, type, attributes, matched_xpath for each cell
2. **id mode**: Query by mxCell ID (fastest for known elements)
   - Accepts single string or array of strings
   - Also returns directly related elements:
     - id = vertex (shape): connected edges + the opposite endpoint cells
     - id = edge (connector): source/target endpoint cells
   - Example: \`{ "id": "node-1" }\` or \`{ "id": ["node-1", "node-2"] }\`
3. **xpath mode**: XPath expression for complex queries
   - Example: \`{ "xpath": "//mxCell[@vertex='1']" }\`

**Returns:** Each result includes \`matched_xpath\` field for use in subsequent edit operations.

**Best Practice:** Use this tool before editing to understand current diagram state.`,
    inputSchema: drawioReadInputSchema.optional(),
    execute: async (input) => {
      const xpath = input?.xpath?.trim();
      const id = input?.id;
      const filter = input?.filter ?? "all";
      const description = input?.description?.trim() || "Read diagram content";
      return await executeDrawioReadFrontend(
        { xpath, id, filter, description },
        context,
      );
    },
  });
}

function createDrawioEditBatchTool(context: FrontendToolContext) {
  return tool({
    description: `Batch edit DrawIO diagram with sequential execution (top to bottom). Stops at the first failed/blocked operation and returns the failed operation details.

**Behavior:**
- Operations are executed in order
- On failure, the tool stops immediately
- Any operations before the failure are already applied and saved

**Locator (choose one per operation):**
- \`id\`: mxCell ID (preferred, auto-converts to XPath \`//mxCell[@id='xxx']\`)
- \`xpath\`: XPath expression for complex targeting

**Operation Types:**
| Type | Required Fields | Description |
|------|-----------------|-------------|
| set_attribute | key, value | Set/update attribute value |
| remove_attribute | key | Remove attribute from element |
| insert_element | new_xml, position? | Insert new XML node |
| remove_element | - | Delete matched element(s) |
| replace_element | new_xml | Replace element with new XML |
| set_text_content | value | Set element text content |

**Insert Positions:** append_child (default), prepend_child, before, after

**insert_element Rules:**
- \`new_xml\` must be a valid single-root XML fragment
- Style: semicolon-separated, NO trailing semicolon
  - ✓ \`ellipse;fillColor=#ffffff;strokeColor=#000000\`
  - ✗ \`ellipse;fillColor=#ffffff;strokeColor=#000000;\`
- Self-closing tags: NO space before />
  - ✓ \`as="geometry"/>\`
  - ✗ \`as="geometry" />\`
- Avoid style props: \`whiteSpace=wrap\`, \`html=1\`, \`aspect=fixed\`
- **NEVER** use \`id: "1"\` (reserved internal parent node)
- Use \`xpath: "/mxfile/diagram/mxGraphModel/root"\` for top-level elements

**Options:**
- \`allow_no_match: true\`: Skip operation if target not found (instead of failing)
- \`description\`: Human-readable description for logging

**Example:**
\`\`\`json
{
  "operations": [
    {
      "type": "insert_element",
      "xpath": "/mxfile/diagram/mxGraphModel/root",
      "position": "append_child",
      "new_xml": "<mxCell id=\\"circle-1\\" value=\\"Label\\" style=\\"ellipse;fillColor=#ffffff;strokeColor=#000000\\" vertex=\\"1\\" parent=\\"1\\"><mxGeometry x=\\"100\\" y=\\"100\\" width=\\"80\\" height=\\"80\\" as=\\"geometry\\"/></mxCell>"
    }
  ],
  "description": "Add circle shape"
}
\`\`\`

**Important:** Always use drawio_read first to verify element IDs exist.`,
    inputSchema: drawioEditBatchInputSchema,
    execute: async ({ operations, description }) => {
      const finalDescription = description?.trim() || "Batch edit diagram";
      return await executeDrawioEditBatchFrontend(
        { operations, description: finalDescription },
        context,
      );
    },
  });
}

export function createFrontendDrawioTools(
  context: FrontendToolContext,
): Record<string, Tool> {
  return {
    [DRAWIO_READ]: createDrawioReadTool(context),
    [DRAWIO_EDIT_BATCH]: createDrawioEditBatchTool(context),
  };
}
