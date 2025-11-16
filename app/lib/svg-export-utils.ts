import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

export interface DiagramPageInfo {
  id: string;
  name: string;
  index: number;
  xmlContent: string;
  element: Element;
}

export interface SvgPageExport {
  id: string;
  name: string;
  index: number;
  svg: string;
}

export interface SvgExportProgress {
  id: string;
  name: string;
  index: number;
  total: number;
}

export interface SvgExportAdapter {
  loadDiagram: (xml: string) => Promise<void> | void;
  exportSVG: () => Promise<string>;
}

const DEFAULT_WAIT_AFTER_LOAD_MS = 150;

function createParser() {
  return new DOMParser();
}

function normalizePageName(name: string | null, index: number) {
  return name && name.trim().length > 0 ? name : `Page ${index + 1}`;
}

export function parsePages(xml: string): DiagramPageInfo[] {
  if (!xml || xml.trim().length === 0) {
    return [];
  }

  const parser = createParser();
  const document = parser.parseFromString(xml, "text/xml");
  const diagrams = Array.from(document.getElementsByTagName("diagram"));

  return diagrams.map((diagram, index) => ({
    id: diagram.getAttribute("id") || `page-${index + 1}`,
    name: normalizePageName(diagram.getAttribute("name"), index),
    index,
    xmlContent: diagram.textContent || "",
    element: diagram,
  }));
}

function escapeAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function createSinglePageXml(diagram: Element): string {
  if (!diagram) {
    throw new Error("必须提供 diagram 元素");
  }

  const serializer = new XMLSerializer();
  const diagramString = serializer.serializeToString(diagram.cloneNode(true));
  const mxfile = diagram.ownerDocument?.documentElement;

  const baseAttributes: Record<string, string> = {
    host: mxfile?.getAttribute("host") || "drawio2go",
    agent: mxfile?.getAttribute("agent") || "drawio2go",
    modified: new Date().toISOString(),
    version: mxfile?.getAttribute("version") || "1.0",
  };

  if (mxfile) {
    Array.from(mxfile.attributes).forEach((attr) => {
      if (!(attr.name in baseAttributes)) {
        baseAttributes[attr.name] = attr.value;
      }
    });
  }

  const attributeString = Object.entries(baseAttributes)
    .map(([key, value]) => `${key}="${escapeAttribute(value)}"`)
    .join(" ");

  return `<mxfile ${attributeString}>${diagramString}</mxfile>`;
}

function delay(ms: number) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function exportAllPagesSVG(
  editor: SvgExportAdapter | null | undefined,
  fullXml: string,
  options?: {
    onProgress?: (progress: SvgExportProgress) => void;
    waitAfterLoadMs?: number;
  },
): Promise<SvgPageExport[]> {
  if (!editor) {
    throw new Error("编辑器实例不可用，无法导出 SVG");
  }

  if (typeof editor.exportSVG !== "function") {
    throw new Error("当前编辑器不支持 exportSVG");
  }

  const pages = parsePages(fullXml);

  if (pages.length === 0) {
    return [];
  }

  const waitAfterLoad = options?.waitAfterLoadMs ?? DEFAULT_WAIT_AFTER_LOAD_MS;
  const handleProgress = options?.onProgress;
  const results: SvgPageExport[] = [];

  try {
    for (const page of pages) {
      handleProgress?.({
        id: page.id,
        name: page.name,
        index: page.index,
        total: pages.length,
      });

      const singlePageXml = createSinglePageXml(page.element);
      await editor.loadDiagram(singlePageXml);
      await delay(waitAfterLoad);
      const svgContent = await editor.exportSVG();

      if (!svgContent) {
        throw new Error(`导出页面 ${page.name} 的 SVG 失败（结果为空）`);
      }

      results.push({
        id: page.id,
        name: page.name,
        index: page.index,
        svg: svgContent,
      });
    }
  } finally {
    await editor.loadDiagram(fullXml);
  }

  return results;
}

export function serializeSVGsToBlob(svgs: SvgPageExport[]): Blob {
  return new Blob([JSON.stringify(svgs)], {
    type: "application/json",
  });
}

export async function deserializeSVGsFromBlob(
  blob: Blob,
): Promise<SvgPageExport[]> {
  const text = await blob.text();
  if (!text) {
    return [];
  }

  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.map((item, index) => ({
    id: String(item.id ?? `page-${index + 1}`),
    name: String(item.name ?? `Page ${index + 1}`),
    index: typeof item.index === "number" ? item.index : index,
    svg: String(item.svg ?? ""),
  }));
}
