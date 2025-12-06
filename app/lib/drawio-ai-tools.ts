import { tool } from "ai";
import { z } from "zod";

import {
  executeDrawioEditBatch,
  executeDrawioRead,
} from "./drawio-xml-service";
import { executeToolOnClient } from "./tool-executor";
import type {
  DrawioEditOperation,
  ReplaceXMLResult,
} from "@/app/types/drawio-tools";
import { validateXMLFormat } from "./drawio-xml-utils";

const operationSchema = z
  .object({
    type: z.enum([
      "set_attribute",
      "remove_attribute",
      "insert_element",
      "remove_element",
      "replace_element",
      "set_text_content",
    ]),
    xpath: z.string().optional(),
    id: z.string().optional(),
    key: z.string().optional(),
    value: z.string().optional(),
    new_xml: z.string().optional(),
    position: z
      .enum(["append_child", "prepend_child", "before", "after"])
      .optional(),
    allow_no_match: z.boolean().optional(),
  })
  .superRefine((operation, ctx) => {
    const ensureNonEmptyIfProvided = (
      value: string | undefined,
      path: (string | number)[],
      message: string,
    ) => {
      if (value === undefined) return;

      if (typeof value !== "string" || value.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message,
        });
      }
    };

    const hasXpath =
      typeof operation.xpath === "string" && operation.xpath.trim() !== "";
    const hasId =
      typeof operation.id === "string" && operation.id.trim() !== "";

    if (!hasXpath && !hasId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "xpath 或 id 至少需要提供一个定位方式",
      });
    }

    ensureNonEmptyIfProvided(operation.xpath, ["xpath"], "xpath 不能为空");
    ensureNonEmptyIfProvided(operation.id, ["id"], "id 不能为空");

    switch (operation.type) {
      case "set_attribute": {
        if (operation.key === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["key"],
            message: "key 不能为空",
          });
        }
        ensureNonEmptyIfProvided(operation.key, ["key"], "key 不能为空");
        if (typeof operation.value !== "string") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["value"],
            message: "value 必须是字符串",
          });
        }
        break;
      }
      case "remove_attribute": {
        if (operation.key === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["key"],
            message: "key 不能为空",
          });
        }
        ensureNonEmptyIfProvided(operation.key, ["key"], "key 不能为空");
        break;
      }
      case "insert_element": {
        if (operation.new_xml === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["new_xml"],
            message: "new_xml 不能为空",
          });
        }
        ensureNonEmptyIfProvided(
          operation.new_xml,
          ["new_xml"],
          "new_xml 不能为空",
        );
        break;
      }
      case "remove_element": {
        break;
      }
      case "replace_element": {
        if (operation.new_xml === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["new_xml"],
            message: "new_xml 不能为空",
          });
        }
        ensureNonEmptyIfProvided(
          operation.new_xml,
          ["new_xml"],
          "new_xml 不能为空",
        );
        break;
      }
      case "set_text_content": {
        if (typeof operation.value !== "string") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["value"],
            message: "value 必须是字符串",
          });
        }
        break;
      }
      default:
        break;
    }
  });

export const drawioReadTool = tool({
  description:
    "读取 DrawIO 图表内容。支持三种方式：\n1. ls 模式（默认）：列出所有 mxCell，可用 filter 筛选 vertices（形状）或 edges（连线）\n2. xpath：XPath 精确查询，返回匹配的节点详细信息\n3. id：按 mxCell id 查询（支持单个或数组），快捷定位特定元素",
  inputSchema: z
    .object({
      xpath: z.string().optional(),
      id: z.union([z.string(), z.array(z.string())]).optional(),
      filter: z.enum(["all", "vertices", "edges"]).optional(),
    })
    .superRefine((data, ctx) => {
      if (data.xpath && data.id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "xpath 和 id 不能同时提供，请仅使用其中一个定位方式",
        });
      }

      if (data.filter && (data.xpath || data.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "filter 参数仅在 ls 模式（未提供 xpath 或 id）时生效",
        });
      }
    })
    .optional(),
  execute: async (input) => {
    const xpath = input?.xpath?.trim();
    const id = input?.id;
    const filter = input?.filter ?? "all";
    return await executeDrawioRead({ xpath, id, filter });
  },
});

export const drawioEditBatchTool = tool({
  description:
    "批量编辑 DrawIO 图表（原子操作：全部成功或全部回滚）。\n\n定位方式（二选一，同时提供时优先使用 id）：\n- id: 直接指定 mxCell id（转换为 //mxCell[@id='xxx']）\n- xpath: XPath 表达式\n\n操作类型：\n- set_attribute: 设置属性\n- remove_attribute: 移除属性\n- insert_element: 插入元素（使用 xpath/id 定位目标父节点）\n- remove_element: 删除元素\n- replace_element: 替换元素\n- set_text_content: 设置文本内容",
  inputSchema: z.object({
    operations: z.array(operationSchema).min(1, "operations 至少包含一项操作"),
  }),
  execute: async ({ operations }) => {
    return await executeDrawioEditBatch({
      operations: operations as DrawioEditOperation[],
    });
  },
});

export const drawioOverwriteTool = tool({
  description:
    "完整覆写 DrawIO XML 内容。此操作会替换整个图表，用于模板替换等场景。XML 格式会被强制验证。",
  inputSchema: z.object({
    drawio_xml: z.string().min(1, "drawio_xml 不能为空"),
  }),
  execute: async ({ drawio_xml }) => {
    const validation = validateXMLFormat(drawio_xml);
    if (!validation.valid) {
      throw new Error(validation.error || "XML 验证失败");
    }

    // 调用前端工具覆写 XML
    return (await executeToolOnClient(
      "replace_drawio_xml",
      { drawio_xml, _originalTool: "drawio_overwrite" },
      60000, // 60 秒超时，支持自动版本创建
    )) as ReplaceXMLResult;
  },
});

export const drawioTools = {
  drawio_read: drawioReadTool,
  drawio_edit_batch: drawioEditBatchTool,
  drawio_overwrite: drawioOverwriteTool,
};
