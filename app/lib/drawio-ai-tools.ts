import { tool } from 'ai';
import { z } from 'zod';
import { executeToolOnClient } from './tool-executor';

/**
 * 工具 1: 获取 DrawIO XML
 * 获取当前 DrawIO 图表的完整 XML 内容
 */
export const getDrawioXMLTool = tool({
  description: '获取当前 DrawIO 图表的完整 XML 内容。使用场景：需要查看当前图表结构时调用此工具。',
  inputSchema: z.object({}),
  execute: async () => {
    return await executeToolOnClient('get_drawio_xml', {}, 10000);
  },
});

/**
 * 工具 2: 完全替换 DrawIO XML
 * 完全替换当前 DrawIO 图表的 XML 内容
 */
export const replaceDrawioXMLTool = tool({
  description: '完全替换当前 DrawIO 图表的 XML 内容。使用场景：需要生成全新的图表或进行大范围修改时使用。注意：此操作会覆盖整个图表。',
  inputSchema: z.object({
    drawio_xml: z.string().describe('新的完整 DrawIO XML 内容，必须是合法的 XML 格式'),
  }),
  execute: async ({ drawio_xml }) => {
    return await executeToolOnClient('replace_drawio_xml', { drawio_xml }, 30000);
  },
});

/**
 * 工具 3: 批量替换 DrawIO XML
 * 批量精准替换 DrawIO XML 中的内容片段
 */
export const batchReplaceDrawioXMLTool = tool({
  description: '批量精准替换 DrawIO XML 中的内容片段。使用场景：需要修改图表中的特定文本、属性或样式时使用。每个 search 字符串必须在 XML 中唯一出现，否则会跳过该替换。建议先使用 get_drawio_xml 获取内容，确认要替换的字符串唯一后再调用。',
  inputSchema: z.object({
    replacements: z.array(
      z.object({
        search: z.string().describe('要搜索的字符串，必须在 XML 中唯一出现'),
        replace: z.string().describe('替换后的字符串'),
      })
    ).describe('替换对数组，每个对象包含 search 和 replace 字段'),
  }),
  execute: async ({ replacements }) => {
    return await executeToolOnClient('batch_replace_drawio_xml', { replacements }, 30000);
  },
});

/**
 * 所有 DrawIO 工具的集合，用于传递给 AI SDK
 */
export const drawioTools = {
  get_drawio_xml: getDrawioXMLTool,
  replace_drawio_xml: replaceDrawioXMLTool,
  batch_replace_drawio_xml: batchReplaceDrawioXMLTool,
};
