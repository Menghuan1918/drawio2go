import i18n from "@/app/i18n/client";
import {
  ErrorCodes,
  type ErrorCode,
  getErrorI18nKey,
} from "@/app/errors/error-codes";

type InterpolationParams = Record<string, unknown>;

const ERROR_SECTIONS: { section: string; min: number; max: number }[] = [
  { section: "common", min: 1000, max: 1999 },
  { section: "storage", min: 2000, max: 2999 },
  { section: "chat", min: 3000, max: 3999 },
  { section: "version", min: 4000, max: 4999 },
  { section: "validation", min: 5000, max: 5999 },
  { section: "xml", min: 6000, max: 6999 },
];

const UNKNOWN_I18N_KEY = "errors:common.unknownError";

function camelCaseFromUpper(key: string): string {
  return key
    .toLowerCase()
    .split("_")
    .map((part, index) =>
      index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join("");
}

function getSectionByCode(code: ErrorCode): string {
  const hit = ERROR_SECTIONS.find(({ min, max }) => code >= min && code <= max);
  return hit?.section ?? "common";
}

function buildValidationKey(trimmedKey: string): string {
  const parts = trimmedKey.split("_");
  if (parts.length >= 2) {
    const group = parts[0].toLowerCase();
    const rest = camelCaseFromUpper(parts.slice(1).join("_"));
    return `validation:${group}.${rest}`;
  }
  return `validation:${camelCaseFromUpper(trimmedKey)}`;
}

function resolveI18nKeyFromCode(code: ErrorCode): string {
  const section = getSectionByCode(code);
  const entry = Object.entries(ErrorCodes).find(([, value]) => value === code);
  const rawKey = entry?.[0];

  if (!rawKey) {
    return UNKNOWN_I18N_KEY;
  }

  const sectionPrefix = `${section.toUpperCase()}_`;
  const trimmedKey = rawKey.startsWith(sectionPrefix)
    ? rawKey.slice(sectionPrefix.length)
    : rawKey;

  if (section === "validation") {
    return buildValidationKey(trimmedKey);
  }

  return `errors:${section}.${camelCaseFromUpper(trimmedKey)}`;
}

/**
 * 应用错误类 - 支持错误码和国际化
 */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public i18nKey: string = resolveI18nKeyFromCode(code),
    public params?: InterpolationParams,
  ) {
    super(i18n.t(i18nKey, params));
    this.name = "AppError";

    Object.setPrototypeOf(this, AppError.prototype);
  }

  static fromCode(code: ErrorCode, params?: InterpolationParams): AppError {
    const i18nKey = resolveI18nKeyFromCode(code) || getErrorI18nKey(code);
    return new AppError(code, i18nKey, params);
  }

  getLocalizedMessage(locale?: string): string {
    if (locale) {
      return i18n.t(this.i18nKey, { lng: locale, ...this.params });
    }
    return this.message;
  }
}

function translateByCode(
  code: ErrorCode,
  params?: InterpolationParams,
): string {
  const i18nKey = resolveI18nKeyFromCode(code);
  return i18n.t(i18nKey, params);
}

/**
 * 统一错误处理 - 返回用户友好的本地化消息
 */
export function handleError(error: unknown, locale?: string): string {
  // AppError - 已包含本地化
  if (error instanceof AppError) {
    return error.getLocalizedMessage(locale);
  }

  // 原生 Error
  if (error instanceof Error) {
    return error.message;
  }

  // API 错误响应对象 { code, message }
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "number"
  ) {
    const apiError = error as {
      code: ErrorCode;
      message?: string;
      params?: InterpolationParams;
    };
    try {
      return translateByCode(apiError.code, apiError.params);
    } catch {
      return apiError.message ?? i18n.t(UNKNOWN_I18N_KEY);
    }
  }

  // 错误码数字
  if (typeof error === "number") {
    return translateByCode(error as ErrorCode);
  }

  // 字符串错误
  if (typeof error === "string") {
    return error;
  }

  // 未知错误
  return i18n.t(UNKNOWN_I18N_KEY);
}

/**
 * 从错误对象中提取消息（用于 console.error 等场景）
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  return String(error);
}

export interface ToastErrorOptions {
  title?: string;
  error: unknown;
  defaultMessage?: string;
}

export function getToastErrorMessage(options: ToastErrorOptions): {
  title: string;
  description: string;
} {
  const { title, error, defaultMessage } = options;

  return {
    title: title || i18n.t("common:toasts.operationFailedTitle"),
    description:
      handleError(error) || defaultMessage || i18n.t(UNKNOWN_I18N_KEY),
  };
}

export interface ApiErrorResult {
  status: number;
  body: { code: ErrorCode; message: string };
}

/**
 * 为 API 路由创建标准化错误响应结构
 */
export function createApiError(
  error: unknown,
  status = 500,
  fallbackCode: ErrorCode = ErrorCodes.UNKNOWN_ERROR,
): ApiErrorResult {
  const code = error instanceof AppError ? error.code : fallbackCode;
  const message = handleError(error);

  return {
    status,
    body: { code, message },
  };
}

/**
 * 可选增强：错误日志记录
 */
export function logError(error: unknown, context?: string): void {
  const prefix = context ? `[${context}]` : "[Error]";
  console.error(prefix, getErrorMessage(error), error);
}

/**
 * 可选增强：错误码合法性校验
 */
export function isValidErrorCode(code: number): code is ErrorCode {
  return Object.values(ErrorCodes).includes(code as ErrorCode);
}

/**
 * 使用示例：
 *
 * // 1. 创建并抛出 AppError
 * throw new AppError(
 *   ErrorCodes.VERSION_PARENT_NOT_FOUND,
 *   "errors:version.parentNotFound",
 *   { parent: "1.0.0" },
 * );
 *
 * // 2. 通过错误码创建 AppError
 * throw AppError.fromCode(ErrorCodes.STORAGE_PROJECT_NOT_FOUND, {
 *   projectId: "abc-123",
 * });
 *
 * // 3. 统一错误处理
 * try {
 *   await someOperation();
 * } catch (error) {
 *   const message = handleError(error);
 *   console.error(message);
 *   // 或显示 toast
 * }
 *
 * // 4. Toast 通知
 * import { pushToast } from "@/app/components/toast-provider";
 *
 * try {
 *   await someOperation();
 * } catch (error) {
 *   const { title, description } = getToastErrorMessage({ error });
 *   pushToast({
 *     variant: "danger",
 *     title,
 *     description,
 *   });
 * }
 *
 * // 5. API 路由错误响应
 * catch (error) {
 *   const apiError = createApiError(error, 500, ErrorCodes.UNKNOWN_ERROR);
 *   return NextResponse.json(apiError.body, { status: apiError.status });
 * }
 */
