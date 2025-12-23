import type {
  ToolDrawioOperationErrorDetails,
  ToolErrorDetails,
  ToolPageFilterErrorDetails,
  ToolReplaceXmlErrorDetails,
  ToolXpathErrorDetails,
  ToolXmlParseErrorDetails,
  ToolZodValidationErrorDetails,
} from "@/app/types/tool-errors";

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normalizeRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  return value as Record<string, unknown>;
}

function formatZodValidationDetails(
  details: ToolZodValidationErrorDetails,
): string {
  if (!Array.isArray(details.issues) || details.issues.length === 0) {
    return safeJsonStringify(details);
  }

  return details.issues
    .map((issue) => {
      const path = Array.isArray(issue.path)
        ? issue.path.map(String).join(".")
        : "";
      const label = path ? path : "(root)";
      const msg =
        typeof issue.message === "string" && issue.message.trim()
          ? issue.message
          : safeJsonStringify(issue);
      return `- ${label}: ${msg}`;
    })
    .join("\n");
}

function formatXmlParseDetails(details: ToolXmlParseErrorDetails): string {
  if (typeof details.formatted === "string" && details.formatted.trim()) {
    return details.formatted;
  }

  const header = details.stage ? `Stage: ${String(details.stage)}` : null;
  const base = details.error ? `Error: ${details.error}` : null;
  const loc =
    details.location && typeof details.location === "object"
      ? `Location: line ${details.location.line}, column ${details.location.column}`
      : null;

  const lines = [header, base, loc].filter(
    (v): v is string => typeof v === "string" && v.trim() !== "",
  );

  return lines.length > 0 ? lines.join("\n") : safeJsonStringify(details);
}

function formatXpathErrorDetails(details: ToolXpathErrorDetails): string {
  const lines = [
    `Expression: ${details.expression}`,
    `Error: ${details.error}`,
  ];
  return lines.join("\n");
}

function formatDrawioOperationDetails(
  details: ToolDrawioOperationErrorDetails,
): string {
  const locator = details.locator || {};
  const locatorParts: string[] = [];
  if (locator.id) locatorParts.push(`id="${locator.id}"`);
  if (locator.xpath) locatorParts.push(`xpath="${locator.xpath}"`);
  const locatorLabel =
    locatorParts.length > 0 ? `Locator: ${locatorParts.join(", ")}` : null;

  const lines = [
    `Operation: ${details.operationIndex + 1}/${details.operationsTotal}`,
    `Type: ${details.operationType}`,
    locatorLabel,
    `allowNoMatch: ${String(Boolean(details.allowNoMatch))}`,
    `Error: ${details.error}`,
  ].filter((v): v is string => Boolean(v && v.trim()));

  return lines.join("\n");
}

function formatPageFilterDetails(details: ToolPageFilterErrorDetails): string {
  const selected = Array.isArray(details.selectedPageIds)
    ? details.selectedPageIds.join(", ")
    : "";
  const invalid = Array.isArray(details.invalidPageIds)
    ? details.invalidPageIds.join(", ")
    : "";

  const lines = [
    selected ? `selectedPageIds: ${selected}` : null,
    invalid ? `invalidPageIds: ${invalid}` : null,
  ].filter((v): v is string => Boolean(v && v.trim()));

  return lines.length > 0 ? lines.join("\n") : safeJsonStringify(details);
}

function formatReplaceXmlDetails(details: ToolReplaceXmlErrorDetails): string {
  const record = normalizeRecord(details) ?? {};
  const requestId =
    typeof record.requestId === "string" && record.requestId.trim()
      ? record.requestId
      : undefined;

  const rollbackSucceeded =
    typeof record.rollbackSucceeded === "boolean"
      ? record.rollbackSucceeded
      : undefined;

  const rollbackErrorMessage =
    typeof record.rollbackErrorMessage === "string" &&
    record.rollbackErrorMessage.trim()
      ? record.rollbackErrorMessage
      : undefined;

  const lines = [
    details.error ? `error: ${details.error}` : null,
    typeof details.message === "string" && details.message.trim()
      ? `message: ${details.message}`
      : null,
    requestId ? `requestId: ${requestId}` : null,
    typeof details.isRollback === "boolean"
      ? `isRollback: ${String(details.isRollback)}`
      : null,
    rollbackSucceeded !== undefined
      ? `rollbackSucceeded: ${String(rollbackSucceeded)}`
      : null,
    rollbackErrorMessage
      ? `rollbackErrorMessage: ${rollbackErrorMessage}`
      : null,
  ].filter((v): v is string => Boolean(v && v.trim()));

  return lines.length > 0 ? lines.join("\n") : safeJsonStringify(details);
}

/**
 * 将 ToolErrorDetails（或任意 unknown）格式化为可读的纯文本，用于拼接到 message/errorText。
 *
 * 约定：
 * - 返回 null 表示没有可用的详情文本
 * - 返回的字符串应为纯文本（便于模型阅读/自修复）
 */
export function formatToolErrorDetailsToText(
  errorDetails: unknown,
): string | null {
  if (errorDetails == null) return null;

  if (typeof errorDetails !== "object") {
    return safeJsonStringify(errorDetails);
  }

  const details = errorDetails as ToolErrorDetails;
  const kind =
    typeof (details as { kind?: unknown }).kind === "string"
      ? String((details as { kind?: unknown }).kind)
      : "";

  switch (kind) {
    case "zod_validation":
      return formatZodValidationDetails(
        details as ToolZodValidationErrorDetails,
      );
    case "xml_parse":
      return formatXmlParseDetails(details as ToolXmlParseErrorDetails);
    case "xpath_error":
      return formatXpathErrorDetails(details as ToolXpathErrorDetails);
    case "drawio_operation":
      return formatDrawioOperationDetails(
        details as ToolDrawioOperationErrorDetails,
      );
    case "page_filter":
      return formatPageFilterDetails(details as ToolPageFilterErrorDetails);
    case "replace_xml":
      return formatReplaceXmlDetails(details as ToolReplaceXmlErrorDetails);
    case "timeout":
      return "操作超时";
    case "aborted":
      return "已取消";
    default:
      return safeJsonStringify(details);
  }
}
