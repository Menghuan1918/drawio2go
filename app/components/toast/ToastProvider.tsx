"use client";

import React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Toast } from "./Toast";
import type { Toast as ToastItem, ToastContextValue } from "@/app/types/toast";

type ToastState = {
  toasts: ToastItem[];
  queue: ToastItem[];
};

type ToastAction =
  | { type: "PUSH"; toast: ToastItem }
  | { type: "DISMISS"; id: string }
  | { type: "CLEAR" };

const MAX_VISIBLE = 3;
const DEFAULT_DURATION = 3200;
const EXIT_DURATION = 200;
const MAX_TIMEOUT = 2147483647;

export const normalizeDuration = (value: number): number | null => {
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.min(value, MAX_TIMEOUT);
};

const ToastContext = createContext<ToastContextValue | null>(null);

const toastReducer = (state: ToastState, action: ToastAction): ToastState => {
  switch (action.type) {
    case "PUSH": {
      if (state.toasts.length < MAX_VISIBLE) {
        return { ...state, toasts: [...state.toasts, action.toast] };
      }
      return { ...state, queue: [...state.queue, action.toast] };
    }
    case "DISMISS": {
      const wasVisible = state.toasts.some((item) => item.id === action.id);
      const remainingToasts = state.toasts.filter(
        (item) => item.id !== action.id,
      );
      const filteredQueue = state.queue.filter((item) => item.id !== action.id);

      if (!wasVisible) {
        // 仅从队列中移除被取消的 toast，不触发补位
        return { ...state, queue: filteredQueue };
      }

      const nextFromQueue = filteredQueue[0];
      if (nextFromQueue) {
        return {
          toasts: [...remainingToasts, nextFromQueue],
          queue: filteredQueue.slice(1),
        };
      }
      return { ...state, toasts: remainingToasts, queue: filteredQueue };
    }
    case "CLEAR":
      return { toasts: [], queue: [] };
    default:
      return state;
  }
};

type TimerMeta = {
  timeoutId?: ReturnType<typeof setTimeout>;
  remaining: number; // Infinity 表示持久化 toast
  startedAt: number;
};

const generateId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(toastReducer, { toasts: [], queue: [] });
  const [mounted, setMounted] = useState(false);
  const [leavingIds, setLeavingIds] = useState<Set<string>>(new Set());
  const timersRef = useRef<Record<string, TimerMeta>>({});
  const exitTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {},
  );

  useEffect(() => {
    setMounted(true);
    return () => {
      Object.values(timersRef.current).forEach((meta) => {
        clearTimeout(meta.timeoutId);
      });
      Object.values(exitTimersRef.current).forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      timersRef.current = {};
      exitTimersRef.current = {};
    };
  }, []);

  const clearTimer = useCallback((id: string) => {
    const meta = timersRef.current[id];
    if (meta?.timeoutId) {
      clearTimeout(meta.timeoutId);
    }
    delete timersRef.current[id];
  }, []);

  const clearExitTimer = useCallback((id: string) => {
    const timeoutId = exitTimersRef.current[id];
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    delete exitTimersRef.current[id];
  }, []);

  const finalizeDismiss = useCallback(
    (id: string) => {
      clearTimer(id);
      clearExitTimer(id);
      dispatch({ type: "DISMISS", id });
      setLeavingIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [clearExitTimer, clearTimer],
  );

  const requestDismiss = useCallback(
    (id: string) => {
      setLeavingIds((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      clearTimer(id);
      clearExitTimer(id);
      const timeoutId = setTimeout(() => finalizeDismiss(id), EXIT_DURATION);
      exitTimersRef.current[id] = timeoutId;
    },
    [clearExitTimer, clearTimer, finalizeDismiss],
  );

  const startTimer = useCallback(
    (toast: ToastItem) => {
      if (timersRef.current[toast.id]) return;
      const rawDuration = toast.duration ?? DEFAULT_DURATION;
      const duration = normalizeDuration(rawDuration);

      if (duration === null) {
        timersRef.current[toast.id] = {
          remaining: Infinity,
          startedAt: Date.now(),
        };
        return;
      }

      const timeoutId = setTimeout(() => requestDismiss(toast.id), duration);
      timersRef.current[toast.id] = {
        timeoutId,
        remaining: duration,
        startedAt: Date.now(),
      };
    },
    [requestDismiss],
  );

  // 修正 pause 实现，确保真正暂停
  const handlePause = useCallback((id: string) => {
    const meta = timersRef.current[id];
    if (!meta) return;
    // 持久化 toast 不需要暂停
    if (!Number.isFinite(meta.remaining)) return;
    if (!meta.timeoutId) return;
    const elapsed = Date.now() - meta.startedAt;
    const remaining = Math.max(meta.remaining - elapsed, 0);
    clearTimeout(meta.timeoutId);
    timersRef.current[id] = {
      remaining,
      startedAt: 0,
      // 删除 timeoutId 字段，表示计时器已暂停
    };
  }, []);

  const handleResume = useCallback(
    (id: string) => {
      const meta = timersRef.current[id];
      if (!meta) return;
      // 持久化 toast 不需要恢复
      if (!Number.isFinite(meta.remaining)) return;
      // 已经在运行中的计时器不需要恢复
      if (meta.timeoutId) return;
      const timeoutId = setTimeout(() => requestDismiss(id), meta.remaining);
      timersRef.current[id] = {
        timeoutId,
        remaining: meta.remaining,
        startedAt: Date.now(),
      };
    },
    [requestDismiss],
  );

  useEffect(() => {
    state.toasts.forEach((toast) => startTimer(toast));
  }, [state.toasts, startTimer]);

  const push = useCallback((toast: Omit<ToastItem, "id">) => {
    const id = generateId();
    const toastWithId: ToastItem = { ...toast, id };
    dispatch({ type: "PUSH", toast: toastWithId });
    return id;
  }, []);

  const clear = useCallback(() => {
    Object.values(timersRef.current).forEach((meta) => {
      clearTimeout(meta.timeoutId);
    });
    Object.values(exitTimersRef.current).forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    timersRef.current = {};
    exitTimersRef.current = {};
    dispatch({ type: "CLEAR" });
  }, []);

  const contextValue = useMemo<ToastContextValue>(
    () => ({
      push,
      dismiss: requestDismiss,
      clear,
    }),
    [clear, push, requestDismiss],
  );

  const portal =
    mounted &&
    typeof document !== "undefined" &&
    createPortal(
      <div className="toast-stack" role="presentation">
        {state.toasts.map((toast) => (
          <Toast
            key={toast.id}
            toast={toast}
            onDismiss={requestDismiss}
            onPause={handlePause}
            onResume={handleResume}
            isLeaving={leavingIds.has(toast.id)}
          />
        ))}
      </div>,
      document.body,
    );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {portal}
    </ToastContext.Provider>
  );
}

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};
