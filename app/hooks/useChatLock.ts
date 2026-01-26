"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createLogger } from "@/lib/logger";
import { generateUUID } from "@/lib/utils";

type ChatLockMessageType =
  | "acquired"
  | "released"
  | "heartbeat"
  | "request-sync"
  | "status";

interface ChatLockMessage {
  type: ChatLockMessageType;
  projectUuid: string;
  clientId: string;
  timestamp: number;
}

interface LockRecord {
  clientId: string;
  timestamp: number;
}

const LOCK_CHANNEL_NAME = "drawio2go-chat-lock";
const LOCK_TTL_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 10_000;
const CHECK_INTERVAL_MS = 5_000;

const logger = createLogger("useChatLock");

const isLockExpired = (record: LockRecord | null): boolean => {
  if (!record) return true;
  return Date.now() - record.timestamp > LOCK_TTL_MS;
};

const parseLockRecord = (raw: string | null): LockRecord | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LockRecord>;
    if (
      parsed &&
      typeof parsed.clientId === "string" &&
      typeof parsed.timestamp === "number"
    ) {
      return { clientId: parsed.clientId, timestamp: parsed.timestamp };
    }
  } catch (error) {
    logger.warn("[useChatLock] 解析锁数据失败", { error });
  }
  return null;
};

const readLock = (lockKey: string): LockRecord | null => {
  try {
    return parseLockRecord(localStorage.getItem(lockKey));
  } catch (error) {
    logger.warn("[useChatLock] 读取锁失败", { error });
    return null;
  }
};

const writeLock = (lockKey: string, record: LockRecord) => {
  try {
    localStorage.setItem(lockKey, JSON.stringify(record));
  } catch (error) {
    logger.warn("[useChatLock] 写入锁失败", { error, lockKey });
  }
};

const removeLock = (lockKey: string) => {
  try {
    localStorage.removeItem(lockKey);
  } catch (error) {
    logger.warn("[useChatLock] 移除锁失败", { error, lockKey });
  }
};

export function useChatLock(projectUuid?: string | null) {
  const [canChat, setCanChat] = useState(true);
  const [lockHolder, setLockHolder] = useState<string | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const clientIdRef = useRef<string | null>(null);
  const prevLockKeyRef = useRef<string | null>(null);
  const prevProjectUuidRef = useRef<string | null>(null);

  const lockKey = useMemo(() => {
    if (!projectUuid) return null;
    return `chat-lock-${projectUuid}`;
  }, [projectUuid]);

  useEffect(() => {
    if (!clientIdRef.current) {
      clientIdRef.current = generateUUID("chat-lock");
    }
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  const broadcast = useCallback((message: ChatLockMessage) => {
    if (!broadcastChannelRef.current) return;
    try {
      broadcastChannelRef.current.postMessage(message);
    } catch (error) {
      logger.warn("[useChatLock] 广播锁事件失败", { error, message });
    }
  }, []);

  const refreshLockState = useCallback(
    (allowCleanup = false) => {
      if (!lockKey) {
        setCanChat(true);
        setLockHolder(null);
        stopHeartbeat();
        return;
      }

      const record = readLock(lockKey);

      if (record && !isLockExpired(record)) {
        setLockHolder(record.clientId);
        setCanChat(record.clientId === clientIdRef.current);

        if (record.clientId !== clientIdRef.current) {
          stopHeartbeat();
        }
        return;
      }

      if (record && allowCleanup) {
        removeLock(lockKey);
        broadcast({
          type: "released",
          projectUuid: projectUuid ?? "",
          clientId: record.clientId,
          timestamp: Date.now(),
        });
      }

      setLockHolder(null);
      setCanChat(true);
      stopHeartbeat();
    },
    [broadcast, lockKey, projectUuid, stopHeartbeat],
  );

  useEffect(() => {
    if (!clientIdRef.current || !lockKey) return;
    refreshLockState(true);
  }, [lockKey, refreshLockState]);

  useEffect(() => {
    if (!clientIdRef.current) return;

    const prevLockKey = prevLockKeyRef.current;
    const prevProjectId = prevProjectUuidRef.current;

    if (prevLockKey && prevLockKey !== lockKey) {
      const record = readLock(prevLockKey);
      if (record && record.clientId === clientIdRef.current) {
        removeLock(prevLockKey);
        broadcast({
          type: "released",
          projectUuid: prevProjectId ?? "",
          clientId: record.clientId,
          timestamp: Date.now(),
        });
      }
    }

    prevLockKeyRef.current = lockKey;
    prevProjectUuidRef.current = projectUuid ?? null;
  }, [broadcast, lockKey, projectUuid]);

  const startHeartbeat = useCallback(() => {
    if (!lockKey || !clientIdRef.current) return;
    stopHeartbeat();

    const refresh = () => {
      const record: LockRecord = {
        clientId: clientIdRef.current!,
        timestamp: Date.now(),
      };
      writeLock(lockKey, record);
      broadcast({
        type: "heartbeat",
        projectUuid: projectUuid ?? "",
        clientId: record.clientId,
        timestamp: record.timestamp,
      });
    };

    refresh();
    heartbeatTimerRef.current = window.setInterval(
      refresh,
      HEARTBEAT_INTERVAL_MS,
    );
  }, [broadcast, lockKey, projectUuid, stopHeartbeat]);

  const acquireLock = useCallback(() => {
    if (!lockKey || !clientIdRef.current) {
      setCanChat(true);
      return true;
    }

    const existing = readLock(lockKey);

    if (existing && !isLockExpired(existing)) {
      if (existing.clientId === clientIdRef.current) {
        startHeartbeat();
        setLockHolder(existing.clientId);
        setCanChat(true);
        return true;
      }

      setLockHolder(existing.clientId);
      setCanChat(false);
      return false;
    }

    const nextRecord: LockRecord = {
      clientId: clientIdRef.current,
      timestamp: Date.now(),
    };

    writeLock(lockKey, nextRecord);
    setLockHolder(nextRecord.clientId);
    setCanChat(true);
    startHeartbeat();
    broadcast({
      type: "acquired",
      projectUuid: projectUuid ?? "",
      clientId: nextRecord.clientId,
      timestamp: nextRecord.timestamp,
    });
    return true;
  }, [broadcast, lockKey, projectUuid, startHeartbeat]);

  const releaseLock = useCallback(() => {
    if (!lockKey || !clientIdRef.current) return;

    const record = readLock(lockKey);
    if (record && record.clientId !== clientIdRef.current) {
      return;
    }

    removeLock(lockKey);
    stopHeartbeat();
    setLockHolder(null);
    setCanChat(true);
    broadcast({
      type: "released",
      projectUuid: projectUuid ?? "",
      clientId: clientIdRef.current,
      timestamp: Date.now(),
    });
  }, [broadcast, lockKey, projectUuid, stopHeartbeat]);

  useEffect(() => {
    if (!clientIdRef.current) return undefined;

    if (!lockKey) {
      setCanChat(true);
      setLockHolder(null);
      return undefined;
    }

    refreshLockState(true);

    const supportsBroadcastChannel =
      typeof BroadcastChannel !== "undefined" && BroadcastChannel !== null;

    if (supportsBroadcastChannel) {
      const channel = new BroadcastChannel(LOCK_CHANNEL_NAME);
      broadcastChannelRef.current = channel;

      const handleMessage = (event: MessageEvent<ChatLockMessage>) => {
        const data = event.data;
        if (!data || data.projectUuid !== (projectUuid ?? "")) return;

        if (data.type === "request-sync") {
          const record = readLock(lockKey);
          if (record && record.clientId === clientIdRef.current) {
            broadcast({
              type: "status",
              projectUuid: projectUuid ?? "",
              clientId: record.clientId,
              timestamp: record.timestamp,
            });
          }
          return;
        }

        if (data.type === "released") {
          if (lockKey) {
            const record = readLock(lockKey);
            if (!record || record.clientId === data.clientId) {
              removeLock(lockKey);
            }
          }
          stopHeartbeat();
          setLockHolder(null);
          setCanChat(true);
          return;
        }

        if (data.type === "acquired" || data.type === "status") {
          if (
            isLockExpired({
              clientId: data.clientId,
              timestamp: data.timestamp,
            })
          ) {
            refreshLockState(true);
            return;
          }

          setLockHolder(data.clientId);
          setCanChat(data.clientId === clientIdRef.current);
          if (data.clientId !== clientIdRef.current) {
            stopHeartbeat();
          }
          return;
        }

        if (data.type === "heartbeat") {
          if (data.clientId === clientIdRef.current) return;
          setLockHolder(data.clientId);
          setCanChat(false);
        }
      };

      channel.addEventListener("message", handleMessage);
      if (clientIdRef.current) {
        channel.postMessage({
          type: "request-sync",
          projectUuid: projectUuid ?? "",
          clientId: clientIdRef.current,
          timestamp: Date.now(),
        });
      }

      return () => {
        channel.removeEventListener("message", handleMessage);
        channel.close();
        broadcastChannelRef.current = null;
      };
    }

    logger.warn(
      "[useChatLock] 当前环境不支持 BroadcastChannel，使用 storage 轮询",
    );
    return undefined;
  }, [lockKey, projectUuid, refreshLockState, broadcast, stopHeartbeat]);

  useEffect(() => {
    if (!lockKey) return undefined;

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== lockKey) return;
      refreshLockState(true);
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [lockKey, refreshLockState]);

  useEffect(() => {
    if (!lockKey) return undefined;

    const timer = window.setInterval(() => {
      refreshLockState(true);
    }, CHECK_INTERVAL_MS);

    return () => {
      clearInterval(timer);
    };
  }, [lockKey, refreshLockState]);

  useEffect(() => {
    return () => {
      releaseLock();
    };
  }, [releaseLock]);

  return {
    canChat,
    lockHolder,
    acquireLock,
    releaseLock,
  };
}
