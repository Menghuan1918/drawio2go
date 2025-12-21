"use strict";

/**
 * 将任意错误对象转换为可读字符串（Node/Electron 侧）。
 *
 * 说明：
 * - 该实现刻意保持无依赖，避免引入浏览器/i18n 等环境耦合
 * - 用于 Electron 主进程、MCP Server 等纯 Node 运行时
 *
 * @param {unknown} error
 * @returns {string}
 */
function toErrorString(error) {
  const seen = new WeakSet();

  const inner = (value) => {
    if (typeof value === "string") return value;

    const formatErrorLike = (err) => {
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

      if (stack) return stack;
      if (name) return name;

      if (cause !== undefined) {
        return `Caused by: ${inner(cause)}`;
      }

      return "[Unknown error]";
    };

    if (value instanceof Error) {
      return formatErrorLike(value);
    }

    if (value && typeof value === "object") {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);

      const errLike = value;
      if ("message" in errLike || "name" in errLike || "stack" in errLike) {
        return formatErrorLike(errLike);
      }

      try {
        return JSON.stringify(value);
      } catch {
        return Object.prototype.toString.call(value);
      }
    }

    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (typeof value === "number" && Number.isNaN(value)) return "NaN";

    try {
      return String(value);
    } catch {
      return "[Unstringifiable]";
    }
  };

  const result = inner(error).trim();
  return result || "[Unknown error]";
}

module.exports = { toErrorString };
