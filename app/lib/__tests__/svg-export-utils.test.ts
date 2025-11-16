import { describe, expect, it, vi } from "vitest";
import { DOMParser } from "@xmldom/xmldom";

import {
  createSinglePageXml,
  deserializeSVGsFromBlob,
  exportAllPagesSVG,
  parsePages,
  serializeSVGsToBlob,
  type SvgExportAdapter,
  type SvgPageExport,
} from "../svg-export-utils";

const SAMPLE_XML = `
<mxfile host="drawio2go" agent="drawio">
  <diagram id="page-1" name="首页">AAA</diagram>
  <diagram id="page-2">BBB</diagram>
</mxfile>
`;

class MockEditor implements SvgExportAdapter {
  public history: string[] = [];
  async loadDiagram(xml: string) {
    this.history.push(xml);
  }

  async exportSVG() {
    const current = this.history[this.history.length - 1] || "";
    return `<svg data-size="${current.length}">${current.length}</svg>`;
  }
}

describe("svg-export-utils", () => {
  it("parsePages 能提取 diagram 元素信息", () => {
    const pages = parsePages(SAMPLE_XML);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatchObject({
      id: "page-1",
      name: "首页",
      index: 0,
      xmlContent: "AAA",
    });
    expect(pages[1].name).toBe("Page 2");
  });

  it("createSinglePageXml 会生成完整 mxfile", () => {
    const parser = new DOMParser();
    const document = parser.parseFromString(SAMPLE_XML, "text/xml");
    const diagram = document.getElementsByTagName("diagram")[1];
    const singlePage = createSinglePageXml(diagram);

    expect(singlePage).toContain("<mxfile");
    expect(singlePage).toContain("<diagram id=\"page-2\"");
    expect(singlePage).not.toContain("page-1");
  });

  it("exportAllPagesSVG 会依序导出所有页面并最终恢复原始 XML", async () => {
    const editor = new MockEditor();
    const progressSpy = vi.fn();

    const results = await exportAllPagesSVG(editor, SAMPLE_XML, {
      onProgress: progressSpy,
      waitAfterLoadMs: 0,
    });

    expect(results).toHaveLength(2);
    expect(results[0].svg).toContain("data-size");
    expect(progressSpy).toHaveBeenCalledTimes(2);
    expect(editor.history.at(-1)).toContain("mxfile");
  });

  it("serialize/deserialize 可以往返保持数据", async () => {
    const sample: SvgPageExport[] = [
      { id: "p1", name: "首页", index: 0, svg: "<svg></svg>" },
    ];

    const blob = serializeSVGsToBlob(sample);
    const restored = await deserializeSVGsFromBlob(blob);

    expect(restored).toEqual(sample);
  });
});
