import { describe, expect, it } from "vitest";
import { toErrorString } from "../error-handler";

describe("toErrorString", () => {
  it("Error 对象返回 message", () => {
    expect(toErrorString(new Error("test"))).toBe("test");
  });

  it("对象含 message 字符串时返回 message", () => {
    expect(toErrorString({ message: "custom" })).toBe("custom");
  });

  it("空对象返回可读兜底字符串", () => {
    expect(toErrorString({})).toBe("[Empty object]");
  });

  it("普通对象返回 JSON 字符串", () => {
    expect(toErrorString({ a: 1 })).toBe('{"a":1}');
  });

  it("Error cause 自引用时不会无限递归", () => {
    const err = new Error("self-referential") as Error & { cause: Error };
    err.cause = err; // 自引用
    expect(toErrorString(err)).toBe("self-referential\nCaused by: [Circular]");
  });

  it("Error cause 循环引用链时不会无限递归", () => {
    const err1 = new Error("error1") as Error & { cause: Error };
    const err2 = new Error("error2") as Error & { cause: Error };
    err1.cause = err2;
    err2.cause = err1; // 形成循环
    expect(toErrorString(err1)).toBe(
      "error1\nCaused by: error2\nCaused by: [Circular]",
    );
  });
});
