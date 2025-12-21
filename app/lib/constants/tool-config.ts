import type { AIToolName, ClientToolName, ToolName } from "./tool-names";
import { AI_TOOL_NAMES, CLIENT_TOOL_NAMES } from "./tool-names";

/**
 * DrawIO 工具超时层级（从外到内）：
 *
 * 1) **工具执行超时（最外层）**：`useChatToolExecution` 对 `tool.execute()` 包一层 `withTimeout`。
 * 2) **编辑器内操作超时（内层）**：
 *    - export（读取/验证 XML）：`DrawioEditorNative` 内 `EXPORT_TIMEOUT_MS = 20_000`
 *    - merge 等待：`drawio-tools.waitForMergeValidation(..., 10_500)`
 * 3) **失败回滚（可选）**：批量编辑失败时可能会触发一次额外的 replace/merge/export 以回滚。
 *
 * 设计原则：
 * - 工具执行超时（最外层）必须 **大于** 其路径上所有内层操作的最坏情况耗时之和。
 *
 * 关键路径（以 `drawio_edit_batch` 为例）：
 * - 读取当前 XML（export）：≤ 20s
 * - merge 等待：≤ 10.5s
 * - export 验证：≤ 20s
 * - 余量：用于序列化/存储写入/事件调度/偶发回滚等
 *
 * 因此：20s + 10.5s + 20s = 50.5s，外层工具超时设为 60s 可避免“外层先超时但底层仍在运行”的不一致问题。
 *
 * 工具默认超时配置（毫秒）。
 *
 * - LLM 工具（前端执行）：读取通常 30s 足够；批量编辑/覆盖需要覆盖 export+merge+验证的最坏路径，提升到 60s。
 * - 客户端桥接工具（同样在前端执行）：读取/写入设为 60s，多页导出更耗时，提升到 120s。
 */
export const TOOL_TIMEOUT_CONFIG = {
  [AI_TOOL_NAMES.DRAWIO_READ]: 30_000,
  [AI_TOOL_NAMES.DRAWIO_EDIT_BATCH]: 60_000,
  [AI_TOOL_NAMES.DRAWIO_OVERWRITE]: 60_000,
  [CLIENT_TOOL_NAMES.GET_DRAWIO_XML]: 60_000,
  [CLIENT_TOOL_NAMES.REPLACE_DRAWIO_XML]: 60_000,
  [CLIENT_TOOL_NAMES.EXPORT_DRAWIO]: 120_000,
} as const satisfies Record<ToolName, number>;

export type ToolTimeoutConfig = Record<ToolName, number>;
export type AIToolTimeoutConfig = Record<AIToolName, number>;
export type ClientToolTimeoutConfig = Record<ClientToolName, number>;
