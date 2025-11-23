import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { select } from "xpath";

import { executeToolOnClient } from "./tool-executor";
import { normalizeDiagramXml } from "./drawio-xml-utils";
import type {
  DrawioEditBatchRequest,
  DrawioEditBatchResult,
  DrawioEditOperation,
  DrawioQueryResult,
  DrawioReadResult,
  InsertElementOperation,
  InsertPosition,
  ReplaceElementOperation,
  SetAttributeOperation,
  SetTextContentOperation,
  RemoveAttributeOperation,
  RemoveElementOperation,
} from "@/app/types/drawio-tools";
import type { GetXMLResult, ReplaceXMLResult } from "@/app/types/drawio-tools";

let cachedParser: DOMParser | null = null;
let cachedSerializer: XMLSerializer | null = null;

function ensureParser(): DOMParser {
  if (!cachedParser) {
    cachedParser = new DOMParser();
  }
  return cachedParser;
}

function ensureSerializer(): XMLSerializer {
  if (!cachedSerializer) {
    cachedSerializer = new XMLSerializer();
  }
  return cachedSerializer;
}

export async function executeDrawioRead(
  xpathExpression?: string,
): Promise<DrawioReadResult> {
  const xml = await fetchDiagramXml();
  const document = parseXml(xml);

  if (!xpathExpression || xpathExpression.trim() === "") {
    const element = document.documentElement;
    if (!element) {
      return {
        success: true,
        results: [],
      };
    }
    const rootResult = convertNodeToResult(element);
    return {
      success: true,
      results: rootResult ? [rootResult] : [],
    };
  }

  let evaluation;
  try {
    evaluation = select(xpathExpression, document);
  } catch (error) {
    throw new Error(
      `Invalid XPath expression: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!Array.isArray(evaluation)) {
    const scalar = toScalarString(evaluation);
    return {
      success: true,
      results:
        scalar !== undefined
          ? [
              {
                type: "text",
                value: scalar,
                matched_xpath: xpathExpression ?? "",
              },
            ]
          : [],
    };
  }

  const results: DrawioQueryResult[] = [];
  for (const node of evaluation) {
    if (isDomNode(node)) {
      const converted = convertNodeToResult(node);
      if (converted) {
        results.push(converted);
      }
    }
  }

  return {
    success: true,
    results,
  };
}

export async function executeDrawioEditBatch(
  request: DrawioEditBatchRequest,
): Promise<DrawioEditBatchResult> {
  const { operations } = request;

  if (!operations.length) {
    return {
      success: true,
      operations_applied: 0,
    };
  }

  const xml = await fetchDiagramXml();
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

  const replaceResult = (await executeToolOnClient(
    "replace_drawio_xml",
    { drawio_xml: updatedXml, _originalTool: "drawio_edit_batch" },
    60000,
  )) as ReplaceXMLResult;

  if (!replaceResult?.success) {
    console.error("[DrawIO XML Service] 批量编辑写回失败:", replaceResult);

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
        "replace_drawio_xml",
        { drawio_xml: originalXml },
        60000,
      )) as ReplaceXMLResult;

      if (rollbackResult?.success) {
        rollbackSucceeded = true;
        console.warn(
          "[DrawIO XML Service] replace_drawio_xml 失败后已回滚到原始 XML",
        );
      } else {
        rollbackErrorMessage =
          rollbackResult?.error ||
          rollbackResult?.message ||
          "未知原因导致回滚失败";
        console.error(
          "[DrawIO XML Service] 回滚到原始 XML 失败:",
          rollbackResult,
        );
      }
    } catch (rollbackError) {
      rollbackErrorMessage =
        rollbackError instanceof Error
          ? rollbackError.message
          : String(rollbackError);
      console.error("[DrawIO XML Service] 回滚过程异常:", rollbackError);
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

async function fetchDiagramXml(): Promise<string> {
  const response = (await executeToolOnClient(
    "get_drawio_xml",
    {},
    15000,
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

function convertNodeToResult(node: Node): DrawioQueryResult | null {
  const serializer = new XMLSerializer();
  const matchedXPath = buildXPathForNode(node);

  switch (node.nodeType) {
    case node.ELEMENT_NODE: {
      const element = node as Element;
      const attributes: Record<string, string> = {};
      for (let i = 0; i < element.attributes.length; i++) {
        const attribute = element.attributes.item(i);
        if (attribute) {
          attributes[attribute.name] = attribute.value;
        }
      }
      return {
        type: "element",
        tag_name: element.tagName,
        attributes,
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
  switch (operation.type) {
    case "set_attribute":
      setAttribute(document, operation);
      break;
    case "remove_attribute":
      removeAttribute(document, operation);
      break;
    case "insert_element":
      insertElement(document, operation);
      break;
    case "remove_element":
      removeElement(document, operation);
      break;
    case "replace_element":
      replaceElement(document, operation);
      break;
    case "set_text_content":
      setTextContent(document, operation);
      break;
    default:
      throw new Error(`未知操作类型: ${(operation as { type: string }).type}`);
  }
}

function setAttribute(
  document: Document,
  operation: SetAttributeOperation,
): void {
  const nodes = selectNodes(document, operation.xpath);

  if (nodes.length === 0) {
    if (operation.allow_no_match) {
      return;
    }
    throw new Error(`XPath '${operation.xpath}' did not match any elements.`);
  }

  for (const node of nodes) {
    if (node.nodeType !== node.ELEMENT_NODE) {
      throw new Error(`XPath '${operation.xpath}' 匹配的节点不是元素。`);
    }
    (node as Element).setAttribute(operation.key, operation.value);
  }
}

function removeAttribute(
  document: Document,
  operation: RemoveAttributeOperation,
): void {
  const nodes = selectNodes(document, operation.xpath);

  if (nodes.length === 0) {
    if (operation.allow_no_match) {
      return;
    }
    throw new Error(`XPath '${operation.xpath}' did not match any elements.`);
  }

  for (const node of nodes) {
    if (node.nodeType !== node.ELEMENT_NODE) {
      throw new Error(`XPath '${operation.xpath}' 匹配的节点不是元素。`);
    }
    (node as Element).removeAttribute(operation.key);
  }
}

function insertElement(
  document: Document,
  operation: InsertElementOperation,
): void {
  const targets = selectNodes(document, operation.target_xpath);

  if (targets.length === 0) {
    if (operation.allow_no_match) {
      return;
    }
    throw new Error(
      `XPath '${operation.target_xpath}' did not match any elements.`,
    );
  }

  const position: InsertPosition = operation.position ?? "append_child";

  for (const target of targets) {
    const newNode = createElementFromXml(document, operation.new_xml);

    switch (position) {
      case "append_child": {
        if (target.nodeType !== target.ELEMENT_NODE) {
          throw new Error(
            `XPath '${operation.target_xpath}' 仅支持元素节点作为父节点。`,
          );
        }
        (target as Element).appendChild(newNode);
        break;
      }
      case "prepend_child": {
        if (target.nodeType !== target.ELEMENT_NODE) {
          throw new Error(
            `XPath '${operation.target_xpath}' 仅支持元素节点作为父节点。`,
          );
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
        throw new Error(`未知的插入位置: ${String(position)}`);
    }
  }
}

function removeElement(
  document: Document,
  operation: RemoveElementOperation,
): void {
  const nodes = selectNodes(document, operation.xpath);

  if (nodes.length === 0) {
    if (operation.allow_no_match) {
      return;
    }
    throw new Error(`XPath '${operation.xpath}' did not match any elements.`);
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
  operation: ReplaceElementOperation,
): void {
  const nodes = selectNodes(document, operation.xpath);

  if (nodes.length === 0) {
    if (operation.allow_no_match) {
      return;
    }
    throw new Error(`XPath '${operation.xpath}' did not match any elements.`);
  }

  for (const node of nodes) {
    const parent = node.parentNode;
    if (!parent) {
      throw new Error("无法替换根节点。");
    }
    const replacement = createElementFromXml(document, operation.new_xml);
    parent.replaceChild(replacement, node);
  }
}

function setTextContent(
  document: Document,
  operation: SetTextContentOperation,
): void {
  const nodes = selectNodes(document, operation.xpath);

  if (nodes.length === 0) {
    if (operation.allow_no_match) {
      return;
    }
    throw new Error(`XPath '${operation.xpath}' did not match any elements.`);
  }

  for (const node of nodes) {
    if (node.nodeType !== node.ELEMENT_NODE) {
      throw new Error(`XPath '${operation.xpath}' 匹配的节点不是元素。`);
    }

    const element = node as Element;
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
    element.appendChild(document.createTextNode(operation.value));
  }
}

function createElementFromXml(document: Document, xml: string): Element {
  const parser = new DOMParser();
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
