import { tool, type Tool } from "ai";

import { AI_TOOL_NAMES } from "@/lib/constants/tool-names";
import { createLogger } from "@/lib/logger";

import { normalizeDiagramXml, validateXMLFormat } from "./drawio-xml-utils";
import { toErrorString } from "./error-handler";
import {
  drawioEditBatchInputSchema,
  drawioOverwriteInputSchema,
  drawioReadInputSchema,
  type DrawioEditBatchRequest,
  type DrawioEditOperation,
  type DrawioOverwriteInput,
  type DrawioReadInput,
} from "./schemas/drawio-tool-schemas";
import type {
  DrawioEditBatchResult,
  DrawioListResult,
  DrawioQueryResult,
  DrawioReadResult,
  ReplaceXMLResult,
} from "@/app/types/drawio-tools";

const logger = createLogger("Frontend DrawIO Tools");
const { DRAWIO_READ, DRAWIO_EDIT_BATCH, DRAWIO_OVERWRITE } = AI_TOOL_NAMES;

type InsertPosition = "append_child" | "prepend_child" | "before" | "after";

export interface FrontendToolContext {
  getDrawioXML: () => Promise<string>;
  replaceDrawioXML: (
    xml: string,
    options?: { description?: string },
  ) => Promise<{ success: boolean; error?: string }>;
  onVersionSnapshot?: (description: string) => Promise<void>;
}

function ensureDomParser(): DOMParser {
  const parser = globalThis.DOMParser ? new globalThis.DOMParser() : null;
  if (!parser) {
    throw new Error(
      "DOMParser not available in current environment. This tool must run in a browser-like runtime.",
    );
  }
  return parser;
}

function ensureXmlSerializer(): XMLSerializer {
  const serializer = globalThis.XMLSerializer
    ? new globalThis.XMLSerializer()
    : null;
  if (!serializer) {
    throw new Error(
      "XMLSerializer not available in current environment. This tool must run in a browser-like runtime.",
    );
  }
  return serializer;
}

function parseXml(xml: string): Document {
  const parser = ensureDomParser();
  const document = parser.parseFromString(xml, "text/xml");
  const parseErrors =
    document.getElementsByTagName?.("parsererror") ??
    (document as unknown as Document).querySelectorAll?.("parsererror");
  if (parseErrors && parseErrors.length > 0) {
    const message =
      parseErrors[0]?.textContent?.trim() || "Invalid XML structure";
    throw new Error(
      `XML parsing failed: ${message}. Ensure the XML is well-formed.`,
    );
  }
  return document;
}

function normalizeIds(id?: string | string[]): string[] {
  if (!id) return [];
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

function buildLocatorLabel(locator: { xpath?: string; id?: string }): string {
  if (locator.id?.trim()) {
    return `id="${locator.id.trim()}"`;
  }
  if (locator.xpath?.trim()) {
    return `xpath="${locator.xpath.trim()}"`;
  }
  return "no locator provided";
}

/**
 * Resolve id or xpath to a standardized XPath expression.
 * - Prioritizes id if both provided
 * - id converts to //mxCell[@id='xxx'], with XPath 1.0 string escaping
 */
function resolveLocator(locator: { xpath?: string; id?: string }): string {
  if (locator.id && locator.id.trim() !== "") {
    const id = locator.id.trim();

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

function evaluateXPath(document: Document, expression: string): XPathResult {
  try {
    const resolver = document.documentElement
      ? document.createNSResolver(document.documentElement)
      : null;
    return document.evaluate(
      expression,
      document,
      resolver,
      XPathResult.ANY_TYPE,
      null,
    );
  } catch (error) {
    const errorMsg = toErrorString(error);
    throw new Error(`Invalid XPath expression: "${expression}". ${errorMsg}`);
  }
}

function selectNodes(document: Document, expression: string): Node[] {
  try {
    const resolver = document.documentElement
      ? document.createNSResolver(document.documentElement)
      : null;
    const snapshot = document.evaluate(
      expression,
      document,
      resolver,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null,
    );

    const nodes: Node[] = [];
    for (let i = 0; i < snapshot.snapshotLength; i++) {
      const item = snapshot.snapshotItem(i);
      if (item) nodes.push(item);
    }
    return nodes;
  } catch (error) {
    const errorMsg = toErrorString(error);
    throw new Error(`Invalid XPath expression: "${expression}". ${errorMsg}`);
  }
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
  const serializer = ensureXmlSerializer();
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
      if (converted) results.push(converted);
    }
  }

  return results;
}

function executeQueryByXpath(
  document: Document,
  xpath: string,
): DrawioQueryResult[] {
  const trimmedXpath = xpath.trim();
  const evaluation = evaluateXPath(document, trimmedXpath);

  const results: DrawioQueryResult[] = [];

  switch (evaluation.resultType) {
    case XPathResult.STRING_TYPE: {
      const value = evaluation.stringValue ?? "";
      results.push({ type: "text", value, matched_xpath: trimmedXpath });
      return results;
    }
    case XPathResult.NUMBER_TYPE: {
      results.push({
        type: "text",
        value: String(evaluation.numberValue),
        matched_xpath: trimmedXpath,
      });
      return results;
    }
    case XPathResult.BOOLEAN_TYPE: {
      results.push({
        type: "text",
        value: String(evaluation.booleanValue),
        matched_xpath: trimmedXpath,
      });
      return results;
    }
    case XPathResult.ANY_UNORDERED_NODE_TYPE:
    case XPathResult.FIRST_ORDERED_NODE_TYPE: {
      const node = evaluation.singleNodeValue;
      const converted = node ? convertNodeToResult(node) : null;
      return converted ? [converted] : [];
    }
    default:
      break;
  }

  // Node-set results (iterator/snapshot)
  const nodes = selectNodes(document, trimmedXpath);
  for (const node of nodes) {
    const converted = convertNodeToResult(node);
    if (converted) results.push(converted);
  }
  return results;
}

function createElementFromXml(document: Document, xml: string): Element {
  const parser = ensureDomParser();
  const fragment = parser.parseFromString(xml, "text/xml");
  const parseErrors =
    fragment.getElementsByTagName?.("parsererror") ??
    (fragment as unknown as Document).querySelectorAll?.("parsererror");
  if (parseErrors && parseErrors.length > 0) {
    const message = parseErrors[0]?.textContent?.trim() || "Invalid XML";
    throw new Error(
      `Failed to parse new_xml: ${message}. Ensure the XML fragment is well-formed.`,
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
): void {
  const nodes = selectNodes(document, xpath);
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
): void {
  const targets = selectNodes(document, xpath);
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
): void {
  const nodes = selectNodes(document, xpath);
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
): void {
  const nodes = selectNodes(document, xpath);
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
): void {
  const nodes = selectNodes(document, xpath);
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
  const { xpath, id, filter = "all", description } = input ?? {};

  const xmlString = await fetchCurrentDiagramXml(context);
  const document = parseXml(xmlString);

  const trimmedXpath = xpath?.trim() || undefined;
  const finalDescription = description?.trim() || "Read diagram content";
  logger.debug("drawio_read", { description: finalDescription });

  if (!trimmedXpath && !id) {
    return executeListMode(document, filter);
  }

  if (id) {
    const results = executeQueryById(document, id);
    return { success: true, results };
  }

  if (trimmedXpath) {
    const results = executeQueryByXpath(document, trimmedXpath);
    return { success: true, results };
  }

  throw new Error(
    `${DRAWIO_READ}: No valid query parameters provided. Use 'id', 'xpath', or leave empty for ls mode.`,
  );
}

async function executeDrawioEditBatchFrontend(
  request: DrawioEditBatchRequest & { description?: string },
  context: FrontendToolContext,
): Promise<DrawioEditBatchResult> {
  const { operations, description } = request;

  if (!operations.length) {
    return { success: true, operations_applied: 0 };
  }

  const originalXml = await fetchCurrentDiagramXml(context);
  const document = parseXml(originalXml);

  for (let index = 0; index < operations.length; index++) {
    const operation = operations[index];
    try {
      applyOperation(document, operation);
    } catch (error) {
      const errorMsg = toErrorString(error) || "Unknown error";
      const locatorInfo = operation.id
        ? `id="${operation.id}"`
        : `xpath="${operation.xpath}"`;
      throw new Error(
        `Operation ${index + 1}/${operations.length} failed (${operation.type}): ${errorMsg}. ` +
          `Locator: ${locatorInfo}. ` +
          `All changes have been rolled back.`,
      );
    }
  }

  const serializer = ensureXmlSerializer();
  const updatedXml = serializer.serializeToString(document);

  const finalDescription = description?.trim() || "Batch edit diagram";
  await context.onVersionSnapshot?.(finalDescription);

  const replaceResult = await context.replaceDrawioXML(updatedXml, {
    description: finalDescription,
  });

  if (!replaceResult?.success) {
    logger.error("Batch edit write-back failed", { replaceResult });

    let rollbackSucceeded = false;
    let rollbackErrorMessage: string | undefined;

    try {
      const rollbackResult = await context.replaceDrawioXML(originalXml, {
        description: "Rollback after batch edit failure",
      });
      rollbackSucceeded = Boolean(rollbackResult?.success);
      if (!rollbackSucceeded) {
        rollbackErrorMessage =
          rollbackResult?.error || "Unknown rollback failure reason";
      }
    } catch (rollbackError) {
      rollbackErrorMessage =
        rollbackError instanceof Error
          ? rollbackError.message
          : String(rollbackError);
    }

    const originalError =
      replaceResult?.error ||
      "Frontend XML replacement failed (unknown reason)";

    const errorMessage = rollbackSucceeded
      ? `Batch edit failed: ${originalError}. Successfully rolled back to previous state.`
      : `Batch edit failed: ${originalError}. Rollback also failed: ${rollbackErrorMessage ?? "unknown reason"}. Diagram may be in inconsistent state.`;

    throw new Error(errorMessage);
  }

  return { success: true, operations_applied: operations.length };
}

async function executeDrawioOverwriteFrontend(
  input: DrawioOverwriteInput,
  context: FrontendToolContext,
): Promise<ReplaceXMLResult> {
  const { drawio_xml, description } = input;
  const validation = validateXMLFormat(drawio_xml);
  if (!validation.valid) {
    throw new Error(validation.error || "XML validation failed");
  }

  const finalDescription = description?.trim() || "Overwrite entire diagram";
  await context.onVersionSnapshot?.(finalDescription);

  const result = await context.replaceDrawioXML(drawio_xml, {
    description: finalDescription,
  });

  if (!result.success) {
    return {
      success: false,
      message: "操作失败",
      error: result.error || "replace_failed",
    };
  }

  return {
    success: true,
    message: "XML 已替换",
    xml: drawio_xml,
  };
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
    description: `Batch edit DrawIO diagram with atomic execution (all succeed or all rollback).

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

function createDrawioOverwriteTool(context: FrontendToolContext) {
  return tool({
    description: `Completely replace the entire DrawIO diagram XML content.

**When to Use:**
- Apply a new template from scratch
- Complete diagram restructure
- Restore from a saved state

**When NOT to Use:**
- Modifying specific elements → use \`drawio_edit_batch\` instead
- Adding/removing single elements → use \`drawio_edit_batch\` instead

**Input Requirements:**
- \`drawio_xml\`: Complete, valid DrawIO XML string
- Must include proper \`<mxGraphModel>\` root structure
- XML format is validated before applying

**Warning:** This replaces the ENTIRE diagram. All existing content will be lost.`,
    inputSchema: drawioOverwriteInputSchema,
    execute: async ({ drawio_xml, description }) => {
      return await executeDrawioOverwriteFrontend(
        { drawio_xml, description },
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
    [DRAWIO_OVERWRITE]: createDrawioOverwriteTool(context),
  };
}
