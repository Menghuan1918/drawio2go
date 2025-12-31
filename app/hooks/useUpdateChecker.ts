"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/app/components/toast";
import { useAppTranslation } from "@/app/i18n/hooks";
import { createLogger } from "@/lib/logger";

const logger = createLogger("useUpdateChecker");

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseNotes?: string;
}

export interface UseUpdateCheckerReturn {
  isChecking: boolean;
  lastCheckTime: Date | null;
  updateInfo: UpdateCheckResult | null;
  checkForUpdates: () => Promise<void>;
  openReleasePage: () => void;
}

export interface UseUpdateCheckerOptions {
  /**
   * 是否订阅 Electron 主进程的自动检查结果（update:available）。
   * 默认为 true；关闭后仍可手动调用 checkForUpdates。
   */
  autoCheckEnabled?: boolean;
}

const isElectronManualUpdateAvailable = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.electron?.checkForUpdates === "function";

const isElectronUpdateSubscriptionAvailable = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.electron?.onUpdateAvailable === "function";

const normalizeUrl = (raw: string | null | undefined): string | null => {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
};

const openExternalUrl = async (rawUrl: string): Promise<void> => {
  const url = normalizeUrl(rawUrl);
  if (!url) return;

  if (typeof window !== "undefined") {
    const electron = window.electron;
    if (electron?.openReleasePage) {
      await electron.openReleasePage(url);
      return;
    }

    if (electron?.openExternal) {
      await electron.openExternal(url);
      return;
    }
  }

  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
};

export function useUpdateChecker(
  options: UseUpdateCheckerOptions = {},
): UseUpdateCheckerReturn {
  const { autoCheckEnabled = true } = options;

  const { t } = useAppTranslation("settings");
  const { push } = useToast();

  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState<Date | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);

  const updateInfoRef = useRef<UpdateCheckResult | null>(null);
  useEffect(() => {
    updateInfoRef.current = updateInfo;
  }, [updateInfo]);

  const lastNotifiedVersionRef = useRef<string | null>(null);
  const checkingPromiseRef = useRef<Promise<void> | null>(null);

  const canManualCheck = useMemo(() => isElectronManualUpdateAvailable(), []);
  const canSubscribe = useMemo(
    () => isElectronUpdateSubscriptionAvailable(),
    [],
  );

  const notifyIfHasUpdate = useCallback(
    (result: UpdateCheckResult, force: boolean) => {
      if (!result.hasUpdate) return;

      if (!force && lastNotifiedVersionRef.current === result.latestVersion) {
        return;
      }

      lastNotifiedVersionRef.current = result.latestVersion;

      push({
        variant: "info",
        duration: 30_000,
        title: t("about.update.toastTitle", {
          defaultValue: "New version available",
        }),
        description: t("about.update.toastDescription", {
          defaultValue:
            "v{{latest}} is available (current v{{current}}). Click to open download page.",
          latest: result.latestVersion,
          current: result.currentVersion,
        }),
        action: {
          label: t("about.update.toastAction", {
            defaultValue: "Open download page",
          }),
          onPress: async () => {
            try {
              await openExternalUrl(result.releaseUrl);
            } catch (error) {
              logger.warn("[Update] openReleasePage failed", { error });
            }
          },
        },
      });
    },
    [push, t],
  );

  const applyResult = useCallback(
    (result: UpdateCheckResult | null, toast: boolean, forceToast: boolean) => {
      setLastCheckTime(new Date());
      setUpdateInfo(result);

      if (!result) return;
      if (!toast) return;

      notifyIfHasUpdate(result, forceToast);
    },
    [notifyIfHasUpdate],
  );

  const checkForUpdates = useCallback(async () => {
    if (!canManualCheck) {
      setLastCheckTime(new Date());
      setUpdateInfo(null);
      return;
    }

    if (checkingPromiseRef.current) {
      return checkingPromiseRef.current;
    }

    const run = async () => {
      setIsChecking(true);
      try {
        const result = await window.electron?.checkForUpdates?.();
        applyResult(result ?? null, true, true);
      } catch (error) {
        logger.warn("[Update] checkForUpdates failed", { error });
        applyResult(null, false, false);
      } finally {
        setIsChecking(false);
        checkingPromiseRef.current = null;
      }
    };

    const promise = run();
    checkingPromiseRef.current = promise;
    return promise;
  }, [applyResult, canManualCheck]);

  const openReleasePage = useCallback(() => {
    const url = updateInfoRef.current?.releaseUrl;
    if (!url) return;
    openExternalUrl(url).catch((error) => {
      logger.warn("[Update] openReleasePage failed", { error });
    });
  }, []);

  useEffect(() => {
    if (!autoCheckEnabled) return;
    if (!canSubscribe) return;

    const unsubscribe = window.electron?.onUpdateAvailable?.((result) => {
      applyResult(result ?? null, true, false);
    });

    return () => {
      try {
        unsubscribe?.();
      } catch (error) {
        logger.warn("[Update] unsubscribe failed", { error });
      }
    };
  }, [applyResult, autoCheckEnabled, canSubscribe]);

  return {
    isChecking,
    lastCheckTime,
    updateInfo,
    checkForUpdates,
    openReleasePage,
  };
}
