import React, { act } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ToastProvider, normalizeDuration, useToast } from "../ToastProvider";
import type { ToastContextValue } from "@/app/types/toast";

// i18n hook mock：返回兜底翻译函数，避免依赖真实 i18n 环境
vi.mock("@/app/i18n/hooks", () => ({
  useAppTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

const DEFAULT_DURATION = 3200;
const EXIT_DURATION = 200;
const MAX_VISIBLE = 3;

let idCounter = 0;

const TestConsumer = ({
  onReady,
}: {
  onReady: (ctx: ToastContextValue) => void;
}) => {
  const ctx = useToast();
  onReady(ctx);
  return null;
};

const renderWithProvider = (): {
  api: ToastContextValue;
  unmount: () => void;
} => {
  let captured: ToastContextValue | null = null;
  const onReady = (ctx: ToastContextValue) => {
    captured = ctx;
  };
  let utils: ReturnType<typeof render>;
  act(() => {
    utils = render(
      <ToastProvider>
        <TestConsumer onReady={onReady} />
      </ToastProvider>,
    );
  });
  if (!captured) {
    throw new Error("Toast context is not available");
  }
  return { api: captured!, unmount: utils!.unmount };
};

describe("ToastProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    idCounter = 0;
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => `mock-id-${++idCounter}`),
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  describe("基础显示和关闭", () => {
    it("push() 创建 toast，Portal 渲染到 body，dismiss() 手动关闭", () => {
      const { api } = renderWithProvider();

      let toastId = "";
      act(() => {
        toastId = api.push({
          description: "Hello Toast",
          variant: "info",
        });
      });

      expect(document.body.querySelector(".toast-stack")).not.toBeNull();
      expect(screen.getByText("Hello Toast")).toBeInTheDocument();

      act(() => api.dismiss(toastId));
      act(() => vi.advanceTimersByTime(EXIT_DURATION));

      expect(screen.queryByText("Hello Toast")).toBeNull();
    });

    it("clear() 清空所有 toast", () => {
      const { api } = renderWithProvider();

      act(() => {
        api.push({ description: "A", variant: "info" });
        api.push({ description: "B", variant: "success" });
      });
      expect(screen.getAllByText(/A|B/).length).toBe(2);

      act(() => api.clear());
      expect(screen.queryByText("A")).toBeNull();
      expect(screen.queryByText("B")).toBeNull();
    });
  });

  describe("自动消失计时", () => {
    it("默认 3200ms 后进入退出动画，200ms 后移除", () => {
      const { api } = renderWithProvider();

      act(() => {
        api.push({ description: "Auto close", variant: "info" });
      });

      const toastElement = screen.getByText("Auto close").closest(".toast");
      expect(toastElement).not.toBeNull();

      act(() => vi.advanceTimersByTime(DEFAULT_DURATION));
      expect(toastElement).toHaveClass("toast--leaving");

      act(() => vi.advanceTimersByTime(EXIT_DURATION));
      expect(screen.queryByText("Auto close")).toBeNull();
    });

    it("自定义 duration 生效", () => {
      const { api } = renderWithProvider();

      act(() => {
        api.push({
          description: "Fast close",
          variant: "success",
          duration: 500,
        });
      });

      act(() => vi.advanceTimersByTime(500));
      const toastElement = screen.getByText("Fast close").closest(".toast");
      expect(toastElement).toHaveClass("toast--leaving");

      act(() => vi.advanceTimersByTime(EXIT_DURATION));
      expect(screen.queryByText("Fast close")).toBeNull();
    });
  });

  describe("持久化时长", () => {
    it("duration: Infinity 不自动关闭", () => {
      const { api } = renderWithProvider();

      act(() => {
        api.push({
          description: "Persistent",
          variant: "info",
          duration: Infinity,
        });
      });

      const toastElement = screen.getByText("Persistent").closest(".toast");
      expect(toastElement).not.toBeNull();

      act(() => {
        vi.advanceTimersByTime(10_000);
      });

      expect(toastElement).toBeInTheDocument();
      expect(toastElement).not.toHaveClass("toast--leaving");
    });

    it("duration 为 0/-1/NaN 视为持久化，不自动关闭", () => {
      const { api } = renderWithProvider();

      const values = [0, -1, Number.NaN];
      act(() => {
        values.forEach((value, index) => {
          api.push({
            description: `Persistent-${index}`,
            variant: "info",
            duration: value,
          });
        });
      });

      act(() => {
        vi.advanceTimersByTime(20_000);
      });

      values.forEach((_value, index) => {
        const toastElement = screen
          .getByText(`Persistent-${index}`)
          .closest(".toast");
        expect(toastElement).not.toBeNull();
        expect(toastElement).not.toHaveClass("toast--leaving");
      });
    });

    it("超大 duration 被钳制到 2147483647，避免溢出警告", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const normalized = normalizeDuration(3_000_000_000);
      expect(normalized).toBe(2_147_483_647);

      const timeoutId = setTimeout(() => {}, normalized ?? 0);
      clearTimeout(timeoutId);

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it("持久化 toast 悬停/聚焦暂停与恢复不会触发关闭", () => {
      const { api } = renderWithProvider();

      act(() => {
        api.push({
          description: "HoverPersist",
          variant: "info",
          duration: Infinity,
        });
      });

      const toastElement = screen.getByText("HoverPersist").closest(".toast")!;

      act(() => {
        fireEvent.mouseEnter(toastElement);
        fireEvent.mouseLeave(toastElement);
        fireEvent.focus(toastElement);
        fireEvent.blur(toastElement);
        vi.advanceTimersByTime(15_000);
      });

      expect(toastElement).toBeInTheDocument();
      expect(toastElement).not.toHaveClass("toast--leaving");
    });

    it("持久化 toast 可手动 dismiss", () => {
      const { api } = renderWithProvider();
      let toastId = "";

      act(() => {
        toastId = api.push({
          description: "ManualDismiss",
          variant: "danger",
          duration: Infinity,
        });
      });

      expect(screen.getByText("ManualDismiss")).toBeInTheDocument();

      act(() => api.dismiss(toastId));
      act(() => vi.advanceTimersByTime(EXIT_DURATION));

      expect(screen.queryByText("ManualDismiss")).toBeNull();
    });
  });

  describe("队列管理", () => {
    it("超过可见上限进入队列，关闭后自动补位并继续计时", async () => {
      const { api } = renderWithProvider();

      const ids: string[] = [];
      act(() => {
        ids.push(
          api.push({
            description: "Toast-1",
            variant: "info",
            duration: 10000,
          }),
        );
        ids.push(
          api.push({
            description: "Toast-2",
            variant: "info",
            duration: 10000,
          }),
        );
        ids.push(
          api.push({
            description: "Toast-3",
            variant: "info",
            duration: 10000,
          }),
        );
        ids.push(
          api.push({ description: "Toast-4", variant: "info", duration: 500 }),
        );
      });

      expect(screen.getAllByText(/Toast-/).length).toBe(MAX_VISIBLE);
      expect(screen.queryByText("Toast-4")).toBeNull();

      act(() => api.dismiss(ids[0]));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(EXIT_DURATION);
      });

      expect(screen.getAllByText(/Toast-/).length).toBe(MAX_VISIBLE);
      expect(screen.getByText("Toast-4")).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      const toast4Element = screen.getByText("Toast-4").closest(".toast");
      expect(toast4Element).toHaveClass("toast--leaving");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(EXIT_DURATION);
      });
      expect(screen.queryByText("Toast-4")).toBeNull();

      await act(async () => {
        api.clear();
        await vi.advanceTimersByTimeAsync(0);
      });
    });
  });

  describe("边界情况", () => {
    it("ToastProvider 外部调用 useToast 抛出错误", () => {
      const OutsideConsumer = () => {
        useToast();
        return null;
      };
      expect(() => render(<OutsideConsumer />)).toThrow(
        "useToast must be used within a ToastProvider",
      );
    });

    it("Provider 卸载时清理所有计时器", () => {
      const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");
      const { api, unmount } = renderWithProvider();

      act(() => {
        api.push({ description: "Cleanup", variant: "info" });
      });

      unmount();
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it("push() 返回唯一 ID", async () => {
      const { api } = renderWithProvider();

      let firstId = "";
      let secondId = "";
      await act(async () => {
        firstId = api.push({ description: "ID-1", variant: "info" });
        secondId = api.push({ description: "ID-2", variant: "info" });
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(firstId).toMatch(/^mock-id-/);
      expect(secondId).toMatch(/^mock-id-/);
      expect(firstId).not.toBe(secondId);

      await act(async () => {
        api.clear();
        await vi.advanceTimersByTimeAsync(0);
      });
    });
  });
});
