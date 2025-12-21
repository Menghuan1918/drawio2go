import i18n from "@/app/i18n/client";
import {
  ErrorCodes,
  type ErrorCode,
  getErrorI18nKey,
} from "@/app/errors/error-codes";
import { createLogger } from "@/lib/logger";

const logger = createLogger("ErrorHandler");

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
 * 将任意错误对象转换为可读字符串
 * @param error - 任意类型的错误
 * @returns 规范化的错误字符串
 */
export function toErrorString(error: unknown): string {
  const seen = new WeakSet<object>();

  const inner = (value: unknown): string => {
    if (typeof value === "string") {
      return value;
    }

    const formatErrorLike = (err: {
      name?: unknown;
      message?: unknown;
      stack?: unknown;
      cause?: unknown;
    }): string => {
      const name = typeof err.name === "string" ? err.name : "";
      const message = typeof err.message === "string" ? err.message : "";
      const stack = typeof err.stack === "string" ? err.stack : "";
      const cause = err.cause;

      if (message) {
        if (cause !== undefined) {
          return `${message}\nCaused by: ${inner(cause)}`;
        }
        return message;
      }

      if (stack) {
        return stack;
      }

      if (name) {
        return name;
      }

      if (cause !== undefined) {
        return `Caused by: ${inner(cause)}`;
      }

      return "[Unknown error]";
    };

    // 1) Error 对象优先
    if (value instanceof Error) {
      return formatErrorLike(value);
    }

    if (value && typeof value === "object") {
      if (seen.has(value)) {
        return "[Circular]";
      }

      seen.add(value);
      try {
        const obj = value as Record<string, unknown>;

        // 2) 对象有 message 字符串
        if (typeof obj.message === "string") {
          return obj.message;
        }

        // 3) 对象有 error 字符串
        if (typeof obj.error === "string") {
          return obj.error;
        }

        // 4) 其他对象：优先 JSON.stringify，但处理 Error/空对象/不可序列化场景
        let json: string;
        try {
          json = JSON.stringify(value);
        } catch {
          return String(value);
        }

        if (json === "{}") {
          const errorLike =
            typeof obj.name === "string" ||
            typeof obj.stack === "string" ||
            "cause" in obj;

          if (errorLike) {
            return formatErrorLike(obj);
          }

          const tag = Object.prototype.toString.call(value);
          const isPlainObject = tag === "[object Object]";
          if (isPlainObject && Object.keys(obj).length === 0) {
            return "[Empty object]";
          }

          return String(value);
        }

        return json;
      } finally {
        seen.delete(value);
      }
    }

    return String(value);
  };

  return inner(error);
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
  logger.error(toErrorString(error), { context, error });
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
