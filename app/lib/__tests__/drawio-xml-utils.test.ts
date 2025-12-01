import { describe, expect, it } from "vitest";
import { deflateRaw } from "pako";
import { normalizeDiagramXml } from "../drawio-xml-utils";

const SAMPLE_XML = `<mxfile><diagram id="1">Hello</diagram></mxfile>`;
const BASE64_XML = Buffer.from(SAMPLE_XML, "utf-8").toString("base64");
const DATA_URI_XML = `data:image/svg+xml;base64,${BASE64_XML}`;
const GRAPH_MODEL_XML =
  '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>';

const COMPRESSED_DIAGRAM_XML = (() => {
  const compressed = deflateRaw(encodeURIComponent(GRAPH_MODEL_XML), {
    to: "uint8array",
  });
  const base64 = Buffer.from(compressed).toString("base64");
  return `<mxfile><diagram id="demo" name="Page-1" compressed="true">${base64}</diagram></mxfile>`;
})();

describe("normalizeDiagramXml", () => {
  it("直接返回纯 XML", () => {
    expect(normalizeDiagramXml(SAMPLE_XML)).toBe(SAMPLE_XML);
  });

  it("解码 data URI 前缀的 Base64", () => {
    expect(normalizeDiagramXml(DATA_URI_XML)).toBe(SAMPLE_XML);
  });

  it("解码裸 Base64", () => {
    expect(normalizeDiagramXml(BASE64_XML)).toBe(SAMPLE_XML);
  });

  it("空字符串抛出明确错误", () => {
    expect(() => normalizeDiagramXml("")).toThrow(
      "[6001] XML payload cannot be empty",
    );
  });

  it("无法识别的输入抛出统一错误信息", () => {
    expect(() => normalizeDiagramXml("not-xml-or-base64")).toThrow(
      "[6003] Decoded result is not valid XML",
    );
  });

  it("解压 DrawIO 压缩的 diagram 内容并移除 compressed 属性", () => {
    const result = normalizeDiagramXml(COMPRESSED_DIAGRAM_XML);
    expect(result).toContain(GRAPH_MODEL_XML);
    expect(result).not.toMatch(/compressed=/i);
  });
});
