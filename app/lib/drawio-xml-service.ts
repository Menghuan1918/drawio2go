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
import { toErrorString } from "@/lib/error-handler";
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

/**
 * Merge error and message fields from tool call results
 * When both exist, combines them with " | " separator
 */
function buildToolErrorMessage(
  errorValue: unknown,
  messageValue: unknown,
): string | undefined {
  const errorText =
    errorValue === undefined || errorValue === null
      ? ""
      : toErrorString(errorValue).trim();
  const messageText =
    messageValue === undefined || messageValue === null
      ? ""
      : toErrorString(messageValue).trim();

  if (!errorText && !messageText) return undefined;
  if (!errorText) return messageText;
  if (!messageText) return errorText;

  if (errorText === messageText) return errorText;
  const existingParts = errorText
    .split(" | ")
    .map((part) => part.trim())
    .filter(Boolean);
  if (existingParts.includes(messageText)) return errorText;

  return `${errorText} | ${messageText}`;
}

function ensureContext(
  context: ToolExecutionContext | undefined,
): ToolExecutionContext {
  const projectUuid = context?.projectUuid?.trim();
  const conversationId = context?.conversationId?.trim();
  const chatRunId =
    typeof context?.chatRunId === "string" ? context.chatRunId.trim() : "";
  if (!projectUuid || !conversationId) {
    throw new Error(
      "Missing project or conversation context. Ensure both projectUuid and conversationId are provided.",
    );
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
    throw new Error(
      "DOMParser not available in current environment. This tool requires a browser or Node.js environment with DOM support.",
    );
  }
  return parser;
}

function ensureSerializer(): XMLSerializer {
  const serializer = getXmlSerializer();
  if (!serializer) {
    throw new Error(
      "XMLSerializer not available in current environment. This tool requires a browser or Node.js environment with DOM support.",
    );
  }
  return serializer;
}

/**
 * Resolve id or xpath to a standardized XPath expression
 * - Prioritizes id if both provided
 * - id converts to //mxCell[@id='xxx'], with proper escaping
 */
function resolveLocator(locator: { xpath?: string; id?: string }): string {
  if (locator.id && locator.id.trim() !== "") {
    const id = locator.id.trim();

    // XPath 1.0 string escaping rules
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
  throw new Error(
    "Locator requires either 'xpath' or 'id'. Provide at least one targeting method.",
  );
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
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Invalid XPath expression: "${trimmedXpath}". ${errorMsg}. ` +
        `Common issues: unbalanced quotes, invalid axis, typos in node names.`,
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

  // Mode 1: List query (no xpath/id)
  if (!xpath && !id) {
    return executeListMode(document, filter);
  }

  // Mode 2: ID query
  if (id) {
    const results = executeQueryById(document, id);
    return { success: true, results };
  }

  // Mode 3: XPath query
  if (xpath) {
    const results = executeQueryByXpath(document, xpath);
    return { success: true, results };
  }

  throw new Error(
    `${DRAWIO_READ}: No valid query parameters provided. Use 'id', 'xpath', or leave empty for ls mode.`,
  );
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
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      const locatorInfo = operation.id
        ? 'id="' + operation.id + '"'
        : 'xpath="' + operation.xpath + '"';
      throw new Error(
        `Operation ${index + 1}/${operations.length} failed (${operation.type}): ${errorMsg}. ` +
          `Locator: ${locatorInfo}. ` +
          `All changes have been rolled back.`,
      );
    }
  }

  const serializer = ensureSerializer();
  const updatedXml = serializer.serializeToString(document);

  const finalDescription = description?.trim() || "Batch edit diagram";

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
    logger.error("Batch edit write-back failed", { replaceResult });

    // drawio_syntax_error means frontend already rolled back on parse failure
    const alreadyRolledBack = replaceResult?.error === "drawio_syntax_error";

    if (alreadyRolledBack) {
      const errorMessage =
        buildToolErrorMessage(replaceResult?.error, replaceResult?.message) ||
        "Batch edit failed: DrawIO reported syntax error. Automatically rolled back to previous state.";
      throw new Error(errorMessage);
    }

    let rollbackSucceeded = false;
    let rollbackErrorMessage: string | undefined;

    try {
      const rollbackResult = (await executeToolOnClient(
        REPLACE_DRAWIO_XML,
        { drawio_xml: originalXml },
        resolvedContext.projectUuid,
        resolvedContext.conversationId,
        "Rollback after batch edit failure",
        {
          signal: resolvedContext.abortSignal,
          chatRunId: resolvedContext.chatRunId,
        },
      )) as ReplaceXMLResult;

      if (rollbackResult?.success) {
        rollbackSucceeded = true;
        logger.warn(
          `${REPLACE_DRAWIO_XML} failed, rolled back to original XML`,
        );
      } else {
        rollbackErrorMessage =
          buildToolErrorMessage(
            rollbackResult?.error,
            rollbackResult?.message,
          ) || "Unknown rollback failure reason";
        logger.error("Rollback to original XML failed", { rollbackResult });
      }
    } catch (rollbackError) {
      rollbackErrorMessage =
        rollbackError instanceof Error
          ? rollbackError.message
          : String(rollbackError);
      logger.error("Rollback process error", { rollbackError });
    }

    const originalError =
      buildToolErrorMessage(replaceResult?.error, replaceResult?.message) ||
      "Frontend XML replacement failed (unknown reason)";

    const errorMessage = rollbackSucceeded
      ? `Batch edit failed: ${originalError}. Successfully rolled back to previous state.`
      : `Batch edit failed: ${originalError}. Rollback also failed: ${rollbackErrorMessage ?? "unknown reason"}. Diagram may be in inconsistent state.`;

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
  const finalDescription = description?.trim() || "Read diagram content";
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
    throw new Error(
      response?.error ||
        "Failed to retrieve current DrawIO XML. Ensure the diagram is loaded and accessible.",
    );
  }

  return normalizeDiagramXml(response.xml);
}

function parseXml(xml: string): Document {
  const parser = ensureParser();
  const document = parser.parseFromString(xml, "text/xml");
  const parseErrors = document.getElementsByTagName("parsererror");
  if (parseErrors.length > 0) {
    throw new Error(
      `XML parsing failed: ${parseErrors[0].textContent || "Invalid XML structure"}. Ensure the XML is well-formed.`,
    );
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

  throw new Error(
    `Unknown operation type: "${(operation as { type: string }).type}". Valid types: set_attribute, remove_attribute, insert_element, remove_element, replace_element, set_text_content`,
  );
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
): void {
  const nodes = selectNodes(document, xpath);

  if (nodes.length === 0) {
    if (allowNoMatch) {
      return;
    }
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
): void {
  const targets = selectNodes(document, xpath);

  if (targets.length === 0) {
    if (allowNoMatch) {
      return;
    }
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
): void {
  const nodes = selectNodes(document, xpath);

  if (nodes.length === 0) {
    if (allowNoMatch) {
      return;
    }
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
): void {
  const nodes = selectNodes(document, xpath);

  if (nodes.length === 0) {
    if (allowNoMatch) {
      return;
    }
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
): void {
  const nodes = selectNodes(document, xpath);

  if (nodes.length === 0) {
    if (allowNoMatch) {
      return;
    }
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

function createElementFromXml(document: Document, xml: string): Element {
  const parser = ensureParser();
  const fragment = parser.parseFromString(xml, "text/xml");
  const parseErrors = fragment.getElementsByTagName("parsererror");
  if (parseErrors.length > 0) {
    throw new Error(
      `Failed to parse new_xml: ${parseErrors[0].textContent || "Invalid XML"}. Ensure the XML fragment is well-formed.`,
    );
  }
  const element = fragment.documentElement;
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

function buildLocatorLabel(locator: { xpath?: string; id?: string }): string {
  if (locator.id?.trim()) {
    return `id="${locator.id.trim()}"`;
  }
  if (locator.xpath?.trim()) {
    return `xpath="${locator.xpath.trim()}"`;
  }
  return "no locator provided";
}

function selectNodes(document: Document, expression: string): Node[] {
  let evaluation;
  try {
    evaluation = select(expression, document);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid XPath expression: "${expression}". ${errorMsg}`);
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
