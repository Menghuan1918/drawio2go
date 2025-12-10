"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createLogger } from "@/lib/logger";

const logger = createLogger("useNetworkStatus");

const HEALTH_ENDPOINT = "/api/health";
const DEFAULT_INTERVAL = 60_000; // 60s 心跳节流
const MAX_BACKOFF = DEFAULT_INTERVAL * 5; // 最长 5 分钟回退
const DEFAULT_TIMEOUT = 3_000; // 3s 超时

export type OfflineReason =
  | "browser-offline"
  | "ping-fail"
  | "socket-disconnect";

export interface NetworkStatusResult {
  isOnline: boolean;
  offlineReason: OfflineReason | null;
  lastCheckedAt: number | null;
  isChecking: boolean;
  checkNow: () => Promise<boolean>;
}

interface UseNetworkStatusOptions {
  /**
   * 外部 Socket 连接状态（如有），用于推断更精确的离线原因。
   * 未提供时默认视为已连接。
   */
  socketConnected?: boolean;
  /**
   * 心跳间隔（毫秒），默认 60 秒。
   */
  intervalMs?: number;
  /**
   * 心跳超时时间（毫秒），默认 3 秒。
   */
  timeoutMs?: number;
}

const getNavigatorOnline = () =>
  typeof navigator !== "undefined" ? navigator.onLine : true;

const computeStatus = (
  navOnline: boolean,
  pingHealthy: boolean | null,
  socketConnected: boolean,
): { isOnline: boolean; offlineReason: OfflineReason | null } => {
  if (!navOnline) {
    return { isOnline: false, offlineReason: "browser-offline" };
  }

  if (!socketConnected) {
    return { isOnline: false, offlineReason: "socket-disconnect" };
  }

  if (pingHealthy === false) {
    return { isOnline: false, offlineReason: "ping-fail" };
  }

  return { isOnline: true, offlineReason: null };
};

const checkRealConnectivity = async (timeoutMs: number): Promise<boolean> => {
  if (typeof fetch === "undefined") return true;

  const controller = new AbortController();
  const fetchPromise = fetch(HEALTH_ENDPOINT, {
    method: "HEAD",
    cache: "no-store",
    signal: controller.signal,
  });

  let timeoutId: number | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      controller.abort();
      reject(new Error("timeout"));
    }, timeoutMs);
  });

  try {
    const response = (await Promise.race([
      fetchPromise,
      timeoutPromise,
    ])) as Response;
    return response.ok;
  } catch (error) {
    logger.debug("[Network] 心跳检测失败", { error });
    return false;
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
};

export function useNetworkStatus(
  options: UseNetworkStatusOptions = {},
): NetworkStatusResult {
  const {
    socketConnected = true,
    intervalMs = DEFAULT_INTERVAL,
    timeoutMs = DEFAULT_TIMEOUT,
  } = options;

  const [navOnline, setNavOnline] = useState<boolean>(getNavigatorOnline);
  const [pingHealthy, setPingHealthy] = useState<boolean | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const socketEverConnectedRef = useRef(socketConnected);
  const getEffectiveSocket = useCallback((rawSocketConnected: boolean) => {
    if (rawSocketConnected) {
      socketEverConnectedRef.current = true;
      return true;
    }
    return socketEverConnectedRef.current ? rawSocketConnected : true;
  }, []);
  const [status, setStatus] = useState(() =>
    computeStatus(navOnline, pingHealthy, getEffectiveSocket(socketConnected)),
  );

  const failuresRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const checkingPromiseRef = useRef<Promise<boolean> | null>(null);
  const socketConnectedRef = useRef(socketConnected);
  const heartbeatRunnerRef = useRef<
    | ((reason: "manual" | "scheduled" | "online-event") => Promise<boolean>)
    | null
  >(null);

  // 保持 socket 状态同步
  useEffect(() => {
    socketConnectedRef.current = socketConnected;
    setStatus((prev) => {
      const effectiveSocket = getEffectiveSocket(socketConnectedRef.current);
      const next = computeStatus(navOnline, pingHealthy, effectiveSocket);
      return prev.isOnline === next.isOnline &&
        prev.offlineReason === next.offlineReason
        ? prev
        : next;
    });
  }, [getEffectiveSocket, navOnline, pingHealthy, socketConnected]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleNext = useCallback(
    (delay: number) => {
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        const runner = heartbeatRunnerRef.current;
        if (runner) {
          void runner("scheduled");
        }
      }, delay);
    },
    [clearTimer],
  );

  const updateStatus = useCallback(
    (
      nextNavOnline: boolean,
      nextPingHealthy: boolean | null,
      source: string,
    ) => {
      const effectiveSocket = getEffectiveSocket(socketConnectedRef.current);
      const next = computeStatus(
        nextNavOnline,
        nextPingHealthy,
        effectiveSocket,
      );

      setStatus((prev) => {
        if (
          prev.isOnline === next.isOnline &&
          prev.offlineReason === next.offlineReason
        ) {
          return prev;
        }

        if (next.isOnline) {
          logger.info(`[Network] 网络已恢复 (${source})`);
        } else {
          logger.warn(
            `[Network] 网络已断开 (${next.offlineReason ?? "unknown"})`,
          );
        }

        return next;
      });
    },
    [getEffectiveSocket],
  );

  const computeBackoff = useCallback(
    (success: boolean) => {
      if (success) {
        failuresRef.current = 0;
        return intervalMs;
      }

      failuresRef.current += 1;
      const nextDelay = intervalMs * 2 ** failuresRef.current;
      return Math.min(nextDelay, MAX_BACKOFF);
    },
    [intervalMs],
  );

  const performHeartbeat = useCallback(
    async (reason: "manual" | "scheduled" | "online-event") => {
      if (typeof window === "undefined") return true;
      if (checkingPromiseRef.current) return checkingPromiseRef.current;

      const checkPromise = (async () => {
        setIsChecking(true);
        const success = await checkRealConnectivity(timeoutMs);
        setPingHealthy(success);
        setLastCheckedAt(Date.now());
        updateStatus(navOnline, success, reason);

        const nextDelay = computeBackoff(success);
        scheduleNext(nextDelay);
        setIsChecking(false);
        checkingPromiseRef.current = null;
        return success;
      })();

      checkingPromiseRef.current = checkPromise;
      return checkPromise;
    },
    [computeBackoff, navOnline, scheduleNext, timeoutMs, updateStatus],
  );

  useEffect(() => {
    heartbeatRunnerRef.current = performHeartbeat;
  }, [performHeartbeat]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleOnline = () => {
      setNavOnline(true);
      failuresRef.current = 0; // 恢复后重置回退
      void performHeartbeat("online-event");
    };

    const handleOffline = () => {
      clearTimer();
      setNavOnline(false);
      setPingHealthy(false);
      updateStatus(false, false, "offline-event");
    };

    // 初始化：立即做一次心跳，避免假在线
    void performHeartbeat("manual");

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      clearTimer();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [clearTimer, performHeartbeat, updateStatus]);

  const derived = useMemo<NetworkStatusResult>(
    () => ({
      ...status,
      lastCheckedAt,
      isChecking,
      checkNow: () => performHeartbeat("manual"),
    }),
    [isChecking, lastCheckedAt, performHeartbeat, status],
  );

  return derived;
}
