import { select } from "xpath";

import { executeToolOnClient } from "./tool-executor";
import { normalizeDiagramXml } from "./drawio-xml-utils";
import { getDomParser, getXmlSerializer } from "./dom-parser-cache";
import type {
  DrawioEditBatchResult,
  DrawioQueryResult,
  DrawioReadResult,
  DrawioListResult,
} from "@/app/types/drawio-tools";
import type { GetXMLResult, ReplaceXMLResult } from "@/app/types/drawio-tools";
import { createLogger } from "@/lib/logger";
import type { ToolExecutionContext } from "@/app/types/socket";
import type {
  DrawioEditBatchRequest,
  DrawioEditOperation,
  DrawioReadInput,
} from "./schemas/drawio-tool-schemas";
import { AI_TOOL_NAMES, CLIENT_TOOL_NAMES } from "@/lib/constants/tool-names";

const logger = createLogger("DrawIO XML Service");
const { DRAWIO_READ } = AI_TOOL_NAMES;
const { GET_DRAWIO_XML, REPLACE_DRAWIO_XML } = CLIENT_TOOL_NAMES;

type InsertPosition = "append_child" | "prepend_child" | "before" | "after";

function ensureContext(
  context: ToolExecutionContext | undefined,
): ToolExecutionContext {
  const projectUuid = context?.projectUuid?.trim();
  const conversationId = context?.conversationId?.trim();
  const chatRunId =
    typeof context?.chatRunId === "string" ? context.chatRunId.trim() : "";
  if (!projectUuid || !conversationId) {
    throw new Error("缺少项目或会话上下文，无法执行工具");
  }
  return {
    projectUuid,
    conversationId,
    chatRunId: chatRunId || undefined,
    abortSignal: context?.abortSignal,
  };
}

function ensureParser(): DOMParser {
  const parser = getDomParser();
  if (!parser) {
    throw new Error("当前环境不支持 DOMParser");
  }
  return parser;
}

function ensureSerializer(): XMLSerializer {
  const serializer = getXmlSerializer();
  if (!serializer) {
    throw new Error("当前环境不支持 XMLSerializer");
  }
  return serializer;
}

/**
 * 将 id 或 xpath 解析为标准化的 XPath 表达式
 * - 优先使用 id（如果同时提供）
 * - id 转换为 //mxCell[@id='xxx']，注意转义单引号
 */
function resolveLocator(locator: { xpath?: string; id?: string }): string {
  if (locator.id && locator.id.trim() !== "") {
    const id = locator.id.trim();

    // XPath 1.0 字符串转义规则
    if (!id.includes("'")) {
      return `//mxCell[@id='${id}']`;
    }
    if (!id.includes(`"`)) {
      return `//mxCell[@id="${id}"]`;
    }

    const parts = id.split("'");
    const concatParts = parts.map((part) => `'${part}'`).join(', "\"\'\", ');
    return `//mxCell[@id=concat(${concatParts})]`;
  }
  if (locator.xpath && locator.xpath.trim() !== "") {
    return locator.xpath;
  }
  throw new Error("resolveLocator: xpath 或 id 必须至少提供一个");
}

function executeQueryById(
  document: Document,
  id: string | string[],
): DrawioQueryResult[] {
  const ids = normalizeIds(id);
  const results: DrawioQueryResult[] = [];

  for (const currentId of ids) {
    const resolvedXpath = resolveLocator({ id: currentId });
    const nodes = selectNodes(document, resolvedXpath);

    for (const node of nodes) {
      const converted = convertNodeToResult(node);
      if (converted) {
        results.push(converted);
      }
    }
  }

  return results;
}

function executeQueryByXpath(
  document: Document,
  xpath: string,
): DrawioQueryResult[] {
  const trimmedXpath = xpath.trim();
  let evaluation;

  try {
    evaluation = select(trimmedXpath, document);
  } catch (error) {
    throw new Error(
      `Invalid XPath expression: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // 处理标量值
  if (!Array.isArray(evaluation)) {
    const scalar = toScalarString(evaluation);
    return scalar !== undefined
      ? [{ type: "text", value: scalar, matched_xpath: trimmedXpath }]
      : [];
  }

  // 处理数组结果
  const results: DrawioQueryResult[] = [];
  for (const node of evaluation) {
    if (!isDomNode(node)) continue;
    const converted = convertNodeToResult(node);
    if (converted) {
      results.push(converted);
    }
  }

  return results;
}

export async function executeDrawioRead(
  input: DrawioReadInput & { description?: string },
  context: ToolExecutionContext,
): Promise<DrawioReadResult> {
  const resolvedContext = ensureContext(context);
  const { xpath, id, filter = "all", description } = input ?? {};

  const xmlString = await fetchDiagramXml(resolvedContext, description);
  const document = parseXml(xmlString);

  // 模式 1：列表查询（无 xpath/id）
  if (!xpath && !id) {
    return executeListMode(document, filter);
  }

  // 模式 2：ID 查询
  if (id) {
    const results = executeQueryById(document, id);
    return { success: true, results };
  }

  // 模式 3：XPath 查询
  if (xpath) {
    const results = executeQueryByXpath(document, xpath);
    return { success: true, results };
  }

  throw new Error(`${DRAWIO_READ}: 未提供有效的查询参数`);
}

export async function executeDrawioEditBatch(
  request: DrawioEditBatchRequest & { description?: string },
  context: ToolExecutionContext,
): Promise<DrawioEditBatchResult> {
  const resolvedContext = ensureContext(context);
  const { operations, description } = request;

  if (!operations.length) {
    return {
      success: true,
      operations_applied: 0,
    };
  }

  const xml = await fetchDiagramXml(resolvedContext);
  const originalXml = xml;
  const document = parseXml(xml);

  for (let index = 0; index < operations.length; index++) {
    const operation = operations[index];
    try {
      applyOperation(document, operation);
    } catch (error) {
      throw new Error(
        `操作 ${index} 失败: ${error instanceof Error ? error.message : "未知错误"}`,
      );
    }
  }

  const serializer = ensureSerializer();
  const updatedXml = serializer.serializeToString(document);

  const finalDescription = description?.trim() || "批量编辑图表元素";

  const replaceResult = (await executeToolOnClient(
    REPLACE_DRAWIO_XML,
    { drawio_xml: updatedXml, skip_export_validation: true },
    resolvedContext.projectUuid,
    resolvedContext.conversationId,
    finalDescription,
    {
      signal: resolvedContext.abortSignal,
      chatRunId: resolvedContext.chatRunId,
    },
  )) as ReplaceXMLResult;

  if (!replaceResult?.success) {
    logger.error("批量编辑写回失败", { replaceResult });

    // drawio_syntax_error 表示前端在解析失败时已自行回滚，避免重复回滚
    const alreadyRolledBack = replaceResult?.error === "drawio_syntax_error";

    if (alreadyRolledBack) {
      throw new Error(
        replaceResult?.message ||
          "批量编辑失败：DrawIO 报告语法错误，已自动回滚到修改前状态",
      );
    }

    let rollbackSucceeded = false;
    let rollbackErrorMessage: string | undefined;

    try {
      const rollbackResult = (await executeToolOnClient(
        REPLACE_DRAWIO_XML,
        { drawio_xml: originalXml },
        resolvedContext.projectUuid,
        resolvedContext.conversationId,
        "批量编辑失败回滚原始 XML",
        {
          signal: resolvedContext.abortSignal,
          chatRunId: resolvedContext.chatRunId,
        },
      )) as ReplaceXMLResult;

      if (rollbackResult?.success) {
        rollbackSucceeded = true;
        logger.warn(`${REPLACE_DRAWIO_XML} 失败后已回滚到原始 XML`);
      } else {
        rollbackErrorMessage =
          rollbackResult?.error ||
          rollbackResult?.message ||
          "未知原因导致回滚失败";
        logger.error("回滚到原始 XML 失败", { rollbackResult });
      }
    } catch (rollbackError) {
      rollbackErrorMessage =
        rollbackError instanceof Error
          ? rollbackError.message
          : String(rollbackError);
      logger.error("回滚过程异常", { rollbackError });
    }

    const originalError =
      replaceResult?.error ||
      replaceResult?.message ||
      "前端替换 XML 失败（未知原因）";

    const errorMessage = rollbackSucceeded
      ? `批量编辑失败：${originalError}，已自动回滚到修改前状态。\n原始错误：${originalError}`
      : `批量编辑失败：${originalError}，回滚失败：${rollbackErrorMessage ?? "未知原因"}。\n原始错误：${originalError}`;

    throw new Error(errorMessage);
  }

  return {
    success: true,
    operations_applied: operations.length,
  };
}

async function fetchDiagramXml(
  context: ToolExecutionContext,
  description?: string,
): Promise<string> {
  const resolvedContext = ensureContext(context);
  const finalDescription = description?.trim() || "读取图表内容";
  const response = (await executeToolOnClient(
    GET_DRAWIO_XML,
    {},
    resolvedContext.projectUuid,
    resolvedContext.conversationId,
    finalDescription,
    {
      signal: resolvedContext.abortSignal,
      chatRunId: resolvedContext.chatRunId,
    },
  )) as GetXMLResult;

  if (!response?.success || typeof response.xml !== "string") {
    throw new Error(response?.error || "无法获取当前 DrawIO XML");
  }

  return normalizeDiagramXml(response.xml);
}

function parseXml(xml: string): Document {
  const parser = ensureParser();
  const document = parser.parseFromString(xml, "text/xml");
  const parseErrors = document.getElementsByTagName("parsererror");
  if (parseErrors.length > 0) {
    throw new Error(parseErrors[0].textContent || "XML 解析失败");
  }
  return document;
}

function normalizeIds(id?: string | string[]): string[] {
  if (!id) {
    return [];
  }

  const ids = Array.isArray(id) ? id : [id];
  return ids
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
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

function executeListMode(
  document: Document,
  filter: "all" | "vertices" | "edges",
): DrawioReadResult {
  const cells = document.getElementsByTagName("mxCell");
  const results: DrawioListResult[] = [];

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i] as Element;
    const id = cell.getAttribute("id");
    if (!id) continue;

    const isVertex = cell.getAttribute("vertex") === "1";
    const isEdge = cell.getAttribute("edge") === "1";
    let type: "vertex" | "edge" | "unknown" = "unknown";
    if (isVertex) {
      type = "vertex";
    } else if (isEdge) {
      type = "edge";
    }

    if (filter === "vertices" && !isVertex) continue;
    if (filter === "edges" && !isEdge) continue;

    const attributes = collectAttributes(cell);
    const matched_xpath = buildXPathForNode(cell);

    results.push({ id, type, attributes, matched_xpath });
  }

  return {
    success: true,
    list: results,
  };
}

function convertNodeToResult(node: Node): DrawioQueryResult | null {
  const serializer = ensureSerializer();
  const matchedXPath = buildXPathForNode(node);

  switch (node.nodeType) {
    case node.ELEMENT_NODE: {
      const element = node as Element;
      return {
        type: "element",
        tag_name: element.tagName,
        attributes: collectAttributes(element),
        xml_string: serializer.serializeToString(element),
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

function applyOperation(
  document: Document,
  operation: DrawioEditOperation,
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
    );
    return;
  }

  if (operation.type === "remove_element") {
    removeElement(
      document,
      resolvedXpath,
      locatorLabel,
      operation.allow_no_match,
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
    );
    return;
  }

  throw new Error(`未知操作类型: ${(operation as { type: string }).type}`);
}

function setAttribute(
  document: Document,
  xpath: string,
  locatorLabel: string,
  key: string,
  value: string,
  allowNoMatch?: boolean,
): void {
  const nodes = selectNodes(document, xpath);

  if (nodes.length === 0) {
    if (allowNoMatch) {
      return;
    }
    throw new Error(`${locatorLabel} did not match any elements.`);
  }

  for (const node of nodes) {
    if (node.nodeType !== node.ELEMENT_NODE) {
      throw new Error(`${locatorLabel} 匹配的节点不是元素。`);
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
): void {
  const nodes = selectNodes(document, xpath);

  if (nodes.length === 0) {
    if (allowNoMatch) {
      return;
    }
    throw new Error(`${locatorLabel} did not match any elements.`);
  }

  for (const node of nodes) {
    if (node.nodeType !== node.ELEMENT_NODE) {
      throw new Error(`${locatorLabel} 匹配的节点不是元素。`);
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
): void {
  const targets = selectNodes(document, xpath);

  if (targets.length === 0) {
    if (allowNoMatch) {
      return;
    }
    throw new Error(`${locatorLabel} did not match any elements.`);
  }

  const insertPosition: InsertPosition = position ?? "append_child";

  for (const target of targets) {
    const newNode = createElementFromXml(document, newXml);

    switch (insertPosition) {
      case "append_child": {
        if (target.nodeType !== target.ELEMENT_NODE) {
          throw new Error(`${locatorLabel} 仅支持元素节点作为父节点。`);
        }
        (target as Element).appendChild(newNode);
        break;
      }
      case "prepend_child": {
        if (target.nodeType !== target.ELEMENT_NODE) {
          throw new Error(`${locatorLabel} 仅支持元素节点作为父节点。`);
        }
        const element = target as Element;
        element.insertBefore(newNode, element.firstChild);
        break;
      }
      case "before": {
        const parent = target.parentNode;
        if (!parent) {
          throw new Error("目标节点没有父节点，无法执行 before 插入。");
        }
        parent.insertBefore(newNode, target);
        break;
      }
      case "after": {
        const parent = target.parentNode;
        if (!parent) {
          throw new Error("目标节点没有父节点，无法执行 after 插入。");
        }
        parent.insertBefore(newNode, target.nextSibling);
        break;
      }
      default:
        throw new Error(`未知的插入位置: ${String(insertPosition)}`);
    }
  }
}

function removeElement(
  document: Document,
  xpath: string,
  locatorLabel: string,
  allowNoMatch?: boolean,
): void {
  const nodes = selectNodes(document, xpath);

  if (nodes.length === 0) {
    if (allowNoMatch) {
      return;
    }
    throw new Error(`${locatorLabel} did not match any elements.`);
  }

  for (const node of nodes) {
    const parent = node.parentNode;
    if (!parent) {
      throw new Error("无法删除根节点。");
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
): void {
  const nodes = selectNodes(document, xpath);

  if (nodes.length === 0) {
    if (allowNoMatch) {
      return;
    }
    throw new Error(`${locatorLabel} did not match any elements.`);
  }

  for (const node of nodes) {
    const parent = node.parentNode;
    if (!parent) {
      throw new Error("无法替换根节点。");
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
): void {
  const nodes = selectNodes(document, xpath);

  if (nodes.length === 0) {
    if (allowNoMatch) {
      return;
    }
    throw new Error(`${locatorLabel} did not match any elements.`);
  }

  for (const node of nodes) {
    if (node.nodeType !== node.ELEMENT_NODE) {
      throw new Error(`${locatorLabel} 匹配的节点不是元素。`);
    }

    const element = node as Element;
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
    element.appendChild(document.createTextNode(value));
  }
}

function createElementFromXml(document: Document, xml: string): Element {
  const parser = ensureParser();
  const fragment = parser.parseFromString(xml, "text/xml");
  const parseErrors = fragment.getElementsByTagName("parsererror");
  if (parseErrors.length > 0) {
    throw new Error(parseErrors[0].textContent || "new_xml 解析失败");
  }
  const element = fragment.documentElement;
  if (!element) {
    throw new Error("new_xml 必须包含一个元素节点");
  }

  if (typeof document.importNode === "function") {
    return document.importNode(element, true) as Element;
  }

  return element.cloneNode(true) as Element;
}

function buildLocatorLabel(locator: { xpath?: string; id?: string }): string {
  if (locator.id?.trim()) {
    return `id '${locator.id.trim()}'`;
  }
  if (locator.xpath?.trim()) {
    return `XPath '${locator.xpath.trim()}'`;
  }
  return "未提供定位器";
}

function selectNodes(document: Document, expression: string): Node[] {
  let evaluation;
  try {
    evaluation = select(expression, document);
  } catch (error) {
    throw new Error(
      `Invalid XPath expression: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!Array.isArray(evaluation)) {
    return [];
  }

  return evaluation.filter(isDomNode);
}

function isDomNode(value: unknown): value is Node {
  return Boolean(value && typeof (value as Node).nodeType === "number");
}

function toScalarString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (isDomNode(value)) {
    return value.textContent ?? undefined;
  }
  return undefined;
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
  if (!parent) {
    return 1;
  }
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
  if (!parent) {
    return 1;
  }
  const textSiblings = Array.from(parent.childNodes).filter(
    (child): child is ChildNode => child.nodeType === child.TEXT_NODE,
  );
  const position = textSiblings.indexOf(node as ChildNode);
  return position >= 0 ? position + 1 : 1;
}
