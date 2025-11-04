import { tool } from 'ai';
import { z } from 'zod';
import { DOMParser } from '@xmldom/xmldom';

import {
  executeDrawioEditBatch,
  executeDrawioRead,
} from './drawio-xml-service';
import { executeToolOnClient } from './tool-executor';
import type {
  DrawioEditOperation,
  ReplaceXMLResult,
} from '@/app/types/drawio-tools';

const operationSchema = z
  .object({
    type: z.enum([
      'set_attribute',
      'remove_attribute',
      'insert_element',
      'remove_element',
      'replace_element',
      'set_text_content',
    ]),
    xpath: z.string().optional(),
    target_xpath: z.string().optional(),
    key: z.string().optional(),
    value: z.string().optional(),
    new_xml: z.string().optional(),
    position: z.enum(['append_child', 'prepend_child', 'before', 'after']).optional(),
    allow_no_match: z.boolean().optional(),
  })
  .superRefine((operation, ctx) => {
    const ensureNonEmpty = (
      value: string | undefined,
      path: (string | number)[],
      message: string
    ) => {
      if (typeof value !== 'string' || value.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message,
        });
      }
    };

    switch (operation.type) {
      case 'set_attribute': {
        ensureNonEmpty(operation.xpath, ['xpath'], 'xpath 不能为空');
        ensureNonEmpty(operation.key, ['key'], 'key 不能为空');
        if (typeof operation.value !== 'string') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['value'],
            message: 'value 必须是字符串',
          });
        }
        break;
      }
      case 'remove_attribute': {
        ensureNonEmpty(operation.xpath, ['xpath'], 'xpath 不能为空');
        ensureNonEmpty(operation.key, ['key'], 'key 不能为空');
        break;
      }
      case 'insert_element': {
        ensureNonEmpty(operation.target_xpath, ['target_xpath'], 'target_xpath 不能为空');
        ensureNonEmpty(operation.new_xml, ['new_xml'], 'new_xml 不能为空');
        break;
      }
      case 'remove_element': {
        ensureNonEmpty(operation.xpath, ['xpath'], 'xpath 不能为空');
        break;
      }
      case 'replace_element': {
        ensureNonEmpty(operation.xpath, ['xpath'], 'xpath 不能为空');
        ensureNonEmpty(operation.new_xml, ['new_xml'], 'new_xml 不能为空');
        break;
      }
      case 'set_text_content': {
        ensureNonEmpty(operation.xpath, ['xpath'], 'xpath 不能为空');
        if (typeof operation.value !== 'string') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['value'],
            message: 'value 必须是字符串',
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
    '使用 XPath 精确读取 DrawIO XML 内容。默认返回根节点，可传入 xpath 参数精确查询元素、属性或文本，结果会包含 matched_xpath 以便后续调用。',
  inputSchema: z
    .object({
      xpath: z.string().optional(),
    })
    .optional(),
  execute: async (input) => {
    const xpath = input?.xpath?.trim();
    return await executeDrawioRead(xpath);
  },
});

export const drawioEditBatchTool = tool({
  description:
    '基于 XPath 的原子化批量编辑工具。所有操作要么全部成功，要么在任意一步失败时回滚并返回错误。',
  inputSchema: z.object({
    operations: z
      .array(operationSchema)
      .min(1, 'operations 至少包含一项操作'),
  }),
  execute: async ({ operations }) => {
    return await executeDrawioEditBatch({
      operations: operations as DrawioEditOperation[],
    });
  },
});

export const drawioOverwriteTool = tool({
  description:
    '完整覆写 DrawIO XML 内容。此操作会替换整个图表，用于模板替换等场景。XML 格式会被强制验证。',
  inputSchema: z.object({
    drawio_xml: z.string().min(1, 'drawio_xml 不能为空'),
  }),
  execute: async ({ drawio_xml }) => {
    // 强制验证 XML 格式
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(drawio_xml, 'text/xml');
      const parseErrors = doc.getElementsByTagName('parsererror');

      if (parseErrors.length > 0) {
        return {
          success: false,
          error: 'XML 格式无效: 解析失败',
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `XML 验证失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    // 调用前端工具覆写 XML
    return (await executeToolOnClient(
      'replace_drawio_xml',
      { drawio_xml },
      30000
    )) as ReplaceXMLResult;
  },
});

export const drawioTools = {
  drawio_read: drawioReadTool,
  drawio_edit_batch: drawioEditBatchTool,
  drawio_overwrite: drawioOverwriteTool,
};
