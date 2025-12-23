import { extractPagesFromXml } from "@/lib/storage/page-metadata";
import { XMLSerializer as XmldomSerializer } from "@xmldom/xmldom";
import { tryParseXmlWithLocator } from "./xml-parse-utils";

function normalizePageId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function getOwnerElementForNode(node: Node): Element | null {
  if (node.nodeType === node.ATTRIBUTE_NODE) {
    return (node as Attr).ownerElement;
  }

  if (node.nodeType === node.ELEMENT_NODE) {
    return node as Element;
  }

  const parent = node.parentNode;
  return parent && parent.nodeType === node.ELEMENT_NODE
    ? (parent as Element)
    : null;
}

function findAncestorDiagramElement(node: Node): Element | null {
  let current: Node | null = node;

  if (current.nodeType === current.DOCUMENT_NODE) {
    const doc = current as Document;
    current = doc.documentElement;
  }

  const startElement = getOwnerElementForNode(current);
  current = startElement;

  while (current) {
    if (current.nodeType === current.ELEMENT_NODE) {
      const element = current as Element;
      if (element.tagName?.toLowerCase() === "diagram") {
        return element;
      }
    }
    current = current.parentNode;
  }

  return null;
}

function resolveDiagramEffectiveId(diagram: Element): string | null {
  const direct = normalizePageId(diagram.getAttribute("id"));
  if (direct) return direct;

  const parent = diagram.parentNode;
  if (!parent) return null;

  let diagramIndex = 0;
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes.item(i);
    if (!child || child.nodeType !== child.ELEMENT_NODE) continue;

    const element = child as Element;
    if (element.tagName?.toLowerCase() !== "diagram") continue;

    diagramIndex += 1;
    if (element === diagram) {
      return `page-${diagramIndex}`;
    }
  }

  return null;
}

function getDirectChildDiagrams(mxfile: Element): Element[] {
  const diagrams: Element[] = [];

  for (let i = 0; i < mxfile.childNodes.length; i++) {
    const child = mxfile.childNodes.item(i);
    if (!child || child.nodeType !== child.ELEMENT_NODE) continue;

    const element = child as Element;
    if (element.tagName?.toLowerCase() === "diagram") {
      diagrams.push(element);
    }
  }

  return diagrams;
}

function parseXmlDocument(
  xml: string,
): { success: true; document: Document } | { success: false; error: string } {
  try {
    const parsed = tryParseXmlWithLocator(xml, "text/xml");
    if (!parsed.success) {
      return { success: false, error: parsed.formatted };
    }
    return { success: true, document: parsed.document };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message || "XML 解析异常" };
  }
}

/**
 * 检查节点是否在指定页面内
 * @param node - DOM 节点
 * @param allowedPageIds - 允许的页面 ID 集合
 * @returns 是否在允许范围内
 */
export function isNodeInAllowedPages(
  node: Node,
  allowedPageIds: Set<string>,
): boolean {
  const diagram = findAncestorDiagramElement(node);
  if (!diagram) return false;

  const diagramId = resolveDiagramEffectiveId(diagram);
  if (!diagramId) return false;

  return allowedPageIds.has(diagramId);
}

/**
 * 过滤节点列表，保留在允许页面内的节点
 * @param nodes - 节点列表
 * @param allowedPageIds - 允许的页面 ID 集合
 * @returns 过滤后的节点列表
 */
export function filterNodesByPages(
  nodes: Node[],
  allowedPageIds: Set<string>,
): Node[] {
  return nodes.filter((node) => isNodeInAllowedPages(node, allowedPageIds));
}

/**
 * 检查节点是否为全局节点（不属于任何 diagram）
 */
export function isGlobalNode(node: Node): boolean {
  return findAncestorDiagramElement(node) === null;
}

/**
 * 验证页面 ID 是否存在于 XML 中
 */
export function validatePageIds(
  xml: string,
  pageIds: string[],
): { valid: true } | { valid: false; invalidIds: string[] } {
  const normalized = pageIds
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  const pages = extractPagesFromXml(xml);
  const knownIds = new Set(pages.map((page) => page.id));

  const invalidIds = normalized.filter((id) => !knownIds.has(id));
  if (invalidIds.length > 0) {
    return { valid: false, invalidIds };
  }

  return { valid: true };
}

function normalizeIdList(ids: string[]): string[] {
  return ids.map((id) => id.trim()).filter((id) => id.length > 0);
}

function collectDiagramElements(document: Document): Element[] {
  return Array.from(document.getElementsByTagName("diagram")).filter(
    (node): node is Element => node.nodeType === node.ELEMENT_NODE,
  );
}

function collectDiagramIds(
  diagrams: Element[],
):
  | { success: true; ids: string[]; map: Map<string, Element> }
  | { success: false; error: string } {
  const ids: string[] = [];
  const map = new Map<string, Element>();

  for (let index = 0; index < diagrams.length; index++) {
    const diagram = diagrams[index];
    const id = normalizePageId(diagram.getAttribute("id"));
    if (!id) {
      return {
        success: false,
        error: `输入 XML 的第 ${index + 1} 个 <diagram> 缺少 id 属性，无法按页面 ID 合并`,
      };
    }

    if (map.has(id)) {
      return {
        success: false,
        error: "输入 XML 存在重复的页面 ID（<diagram id=...>）",
      };
    }

    ids.push(id);
    map.set(id, diagram);
  }

  return { success: true, ids, map };
}

function validateIncomingIdsMatchTargets(
  incomingIds: string[],
  targetIds: string[],
): { success: true } | { success: false; error: string } {
  const targetIdSet = new Set(targetIds);
  const incomingIdSet = new Set(incomingIds);

  const extraIncoming = incomingIds.filter((id) => !targetIdSet.has(id));
  const missingIncoming = Array.from(targetIdSet).filter(
    (id) => !incomingIdSet.has(id),
  );

  if (!extraIncoming.length && !missingIncoming.length) {
    return { success: true };
  }

  const parts: string[] = [];
  if (extraIncoming.length) {
    parts.push(`输入 XML 包含未选中的页面 ID：${extraIncoming.join(", ")}`);
  }
  if (missingIncoming.length) {
    parts.push(`输入 XML 缺少选中的页面 ID：${missingIncoming.join(", ")}`);
  }

  return { success: false, error: parts.join("；") };
}

function buildOriginalDiagramMap(
  originalMxfile: Element,
):
  | { success: true; map: Map<string, Element> }
  | { success: false; error: string } {
  const diagrams = getDirectChildDiagrams(originalMxfile);
  const map = new Map<string, Element>();

  for (let index = 0; index < diagrams.length; index++) {
    const diagram = diagrams[index];
    const id = resolveDiagramEffectiveId(diagram) ?? `page-${index + 1}`;
    if (map.has(id)) {
      return {
        success: false,
        error: `原始 XML 存在重复的页面 ID="${id}"，无法安全合并`,
      };
    }
    map.set(id, diagram);
  }

  return { success: true, map };
}

function buildImportedDiagramReplacement(params: {
  originalDoc: Document;
  incomingDiagram: Element;
  incomingId: string;
  originalDiagram: Element;
}): Element {
  const { originalDoc, incomingDiagram, incomingId, originalDiagram } = params;

  const replacement = incomingDiagram.cloneNode(true) as Element;
  replacement.setAttribute("id", incomingId);

  if (!normalizePageId(replacement.getAttribute("name"))) {
    const originalName = normalizePageId(originalDiagram.getAttribute("name"));
    if (originalName) {
      replacement.setAttribute("name", originalName);
    }
  }

  return typeof originalDoc.importNode === "function"
    ? (originalDoc.importNode(replacement, true) as Element)
    : (replacement.cloneNode(true) as Element);
}

function applyIncomingDiagramReplacements(params: {
  originalDoc: Document;
  incomingIds: string[];
  incomingDiagramMap: Map<string, Element>;
  originalDiagramMap: Map<string, Element>;
}): { success: true } | { success: false; error: string } {
  const { originalDoc, incomingIds, incomingDiagramMap, originalDiagramMap } =
    params;

  for (const incomingId of incomingIds) {
    const incomingDiagram = incomingDiagramMap.get(incomingId);
    if (!incomingDiagram) {
      return { success: false, error: `无法读取输入页面 ID="${incomingId}"` };
    }

    const originalDiagram = originalDiagramMap.get(incomingId);
    if (!originalDiagram) {
      return {
        success: false,
        error: `原始 XML 中不存在页面 ID="${incomingId}"，无法合并`,
      };
    }

    const imported = buildImportedDiagramReplacement({
      originalDoc,
      incomingDiagram,
      incomingId,
      originalDiagram,
    });

    const parent = originalDiagram.parentNode;
    if (!parent) {
      return {
        success: false,
        error: `无法替换页面 ID="${incomingId}"：原始 <diagram> 缺少父节点`,
      };
    }

    parent.replaceChild(imported, originalDiagram);
  }

  return { success: true };
}

function serializeXmlDocument(
  serializer: XMLSerializer,
  document: Document,
): { success: true; xml: string } | { success: false; error: string } {
  try {
    const xml = serializer.serializeToString(document);
    return { success: true, xml };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message || "序列化 XML 失败" };
  }
}

/**
 * 合并部分页面 XML 到完整文件
 * @param originalXml - 原始完整 XML
 * @param incomingXml - 输入的部分页面 XML
 * @param targetPageIds - 目标页面 ID 数组
 * @returns 合并后的完整 XML
 */
export function mergePartialPagesXml(
  originalXml: string,
  incomingXml: string,
  targetPageIds: string[],
): { success: true; xml: string } | { success: false; error: string } {
  const normalizedTargetIds = normalizeIdList(targetPageIds);
  if (!normalizedTargetIds.length) {
    return { success: false, error: "未提供需要合并的目标页面 ID" };
  }

  const originalParsed = parseXmlDocument(originalXml);
  if (!originalParsed.success) {
    return {
      success: false,
      error: `原始 XML 解析失败：${originalParsed.error}`,
    };
  }

  const incomingParsed = parseXmlDocument(incomingXml);
  if (!incomingParsed.success) {
    return {
      success: false,
      error: `输入 XML 解析失败：${incomingParsed.error}`,
    };
  }

  const originalDoc = originalParsed.document;
  const incomingDoc = incomingParsed.document;

  const originalRoot = originalDoc.documentElement;
  if (!originalRoot || originalRoot.tagName?.toLowerCase() !== "mxfile") {
    return {
      success: false,
      error: "原始 XML 根节点不是 <mxfile>，无法合并页面",
    };
  }

  const incomingDiagrams = collectDiagramElements(incomingDoc);

  if (incomingDiagrams.length !== normalizedTargetIds.length) {
    return {
      success: false,
      error: `输入 XML 的页面数量(${incomingDiagrams.length})与选中页面数量(${targetPageIds.length})不匹配`,
    };
  }

  const incomingIdsResult = collectDiagramIds(incomingDiagrams);
  if (!incomingIdsResult.success) {
    return { success: false, error: incomingIdsResult.error };
  }

  const incomingIds = incomingIdsResult.ids;
  const incomingDiagramMap = incomingIdsResult.map;

  const validateIds = validateIncomingIdsMatchTargets(
    incomingIds,
    normalizedTargetIds,
  );
  if (!validateIds.success) {
    return { success: false, error: validateIds.error };
  }

  const serializer = new XmldomSerializer();

  const originalDiagramMapResult = buildOriginalDiagramMap(originalRoot);
  if (!originalDiagramMapResult.success) {
    return { success: false, error: originalDiagramMapResult.error };
  }
  const originalDiagramMap = originalDiagramMapResult.map;

  const applyResult = applyIncomingDiagramReplacements({
    originalDoc,
    incomingIds,
    incomingDiagramMap,
    originalDiagramMap,
  });
  if (!applyResult.success) {
    return { success: false, error: applyResult.error };
  }

  const serialized = serializeXmlDocument(serializer, originalDoc);
  if (!serialized.success) {
    return { success: false, error: serialized.error };
  }

  return { success: true, xml: serialized.xml };
}
