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
});
