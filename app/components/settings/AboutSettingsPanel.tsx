"use client";

import { useCallback, useMemo } from "react";
import { Button, Chip, Description, Label, Switch } from "@heroui/react";
import { ExternalLink, RefreshCw } from "lucide-react";

import { useAppTranslation } from "@/app/i18n/hooks";
import { useUpdateChecker } from "@/app/hooks/useUpdateChecker";
import { formatConversationDate } from "@/app/lib/format-utils";
import { createLogger } from "@/lib/logger";
import pkg from "@/package.json";

const logger = createLogger("AboutSettingsPanel");

const APP_NAME = "DrawIO2Go";
const GITHUB_REPO_URL = "https://github.com/Menghuan1918/drawio2go";

export interface AboutSettingsPanelProps {
  autoCheckEnabled: boolean;
  onAutoCheckChange: (enabled: boolean) => void;
}

const normalizeVersion = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const openExternalUrl = async (rawUrl: string): Promise<void> => {
  const url = rawUrl.trim();
  if (!url) return;

  if (typeof window !== "undefined" && window.electron?.openExternal) {
    await window.electron.openExternal(url);
    return;
  }

  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
};

export default function AboutSettingsPanel({
  autoCheckEnabled,
  onAutoCheckChange,
}: AboutSettingsPanelProps) {
  const { t, i18n } = useAppTranslation("settings");
  const { isChecking, lastCheckTime, updateInfo, checkForUpdates } =
    useUpdateChecker({ autoCheckEnabled: false });

  const canCheckForUpdates = useMemo(
    () => typeof window !== "undefined" && !!window.electron?.checkForUpdates,
    [],
  );

  const packageVersion = normalizeVersion(
    (pkg as { version?: string }).version,
  );
  const currentVersion =
    normalizeVersion(updateInfo?.currentVersion) ?? packageVersion ?? "0.0.0";
  const latestVersion = normalizeVersion(updateInfo?.latestVersion);

  const statusChip = useMemo(() => {
    if (!updateInfo) {
      return (
        <Chip size="sm" variant="secondary" color="accent">
          {t("about.update.statusUnknown", { defaultValue: "Unknown" })}
        </Chip>
      );
    }

    if (updateInfo.hasUpdate) {
      return (
        <Chip size="sm" variant="secondary" color="accent">
          {t("about.update.statusAvailable", {
            defaultValue: "Update available",
          })}
        </Chip>
      );
    }

    return (
      <Chip size="sm" variant="secondary" color="success">
        {t("about.update.statusUpToDate", { defaultValue: "Up to date" })}
      </Chip>
    );
  }, [t, updateInfo]);

  const lastCheckText = useMemo(() => {
    if (!lastCheckTime) {
      return t("about.update.neverChecked", { defaultValue: "Never" });
    }
    return formatConversationDate(
      lastCheckTime.getTime(),
      "datetime",
      i18n.language,
    );
  }, [i18n.language, lastCheckTime, t]);

  const handleOpenGitHub = useCallback(() => {
    openExternalUrl(GITHUB_REPO_URL).catch((error) => {
      logger.warn("[About] open GitHub failed", { error });
    });
  }, []);

  const handleCheckNow = useCallback(() => {
    checkForUpdates().catch((error) => {
      logger.warn("[About] checkForUpdates failed", { error });
    });
  }, [checkForUpdates]);

  const handleAutoCheckChange = useCallback(
    (isSelected: boolean) => {
      onAutoCheckChange(Boolean(isSelected));
    },
    [onAutoCheckChange],
  );

  return (
    <div className="settings-panel flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h3 className="section-title">{t("about.title")}</h3>
        <p className="section-description">{t("about.description")}</p>
      </div>

      {/* App Info Card */}
      <div className="rounded-xl border border-default-200 bg-content1 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="text-base font-semibold text-foreground">
              {APP_NAME}
            </div>
            <div className="text-sm text-default-500">
              {t("about.appVersionLabel", { defaultValue: "Version" })}:{" "}
              <span className="font-mono">{currentVersion}</span>
            </div>
            {/* License */}
            <div className="text-xs text-default-400">
              {t("about.license", { defaultValue: "MIT License" })}
            </div>
            <div className="mt-1 text-sm text-default-400">
              {t("about.tagline", {
                defaultValue: "AI-Powered, Human-AI Collaboration",
              })}
            </div>
          </div>
          <div className="shrink-0">{statusChip}</div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onPress={handleOpenGitHub}>
            <ExternalLink className="h-4 w-4" />
            {t("about.github.open", { defaultValue: "Open GitHub" })}
          </Button>
        </div>
      </div>

      {/* Version Info */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-default-200 bg-content1 p-4">
          <div className="text-sm font-medium text-foreground">
            {t("about.update.currentVersion", {
              defaultValue: "Current version",
            })}
          </div>
          <div className="mt-2 font-mono text-sm text-default-500">
            {currentVersion}
          </div>
        </div>

        <div className="rounded-xl border border-default-200 bg-content1 p-4">
          <div className="text-sm font-medium text-foreground">
            {t("about.update.latestVersion", {
              defaultValue: "Latest version",
            })}
          </div>
          <div className="mt-2 font-mono text-sm text-default-500">
            {latestVersion ??
              t("about.update.unknownVersion", { defaultValue: "—" })}
          </div>
        </div>
      </div>

      {/* Update Check */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onPress={handleCheckNow}
            isDisabled={!canCheckForUpdates || isChecking}
          >
            <RefreshCw className="h-4 w-4" />
            {isChecking
              ? t("about.update.checking", { defaultValue: "Checking..." })
              : t("about.update.checkNow", {
                  defaultValue: "Check for updates",
                })}
          </Button>
          <Description className="text-sm text-default-500">
            {t("about.update.lastChecked", { defaultValue: "Last checked" })}:{" "}
            {lastCheckText}
          </Description>
        </div>

        {!canCheckForUpdates && (
          <Description className="text-sm text-default-500">
            {t("about.update.desktopOnly", {
              defaultValue: "Update checks are available in the desktop app.",
            })}
          </Description>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Switch isSelected={autoCheckEnabled} onChange={handleAutoCheckChange}>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Label className="text-sm text-foreground">
            {t("about.update.autoCheck.label", {
              defaultValue: "Auto check updates",
            })}
          </Label>
        </Switch>
        <Description className="text-sm text-default-500">
          {t("about.update.autoCheck.description", {
            defaultValue: "Automatically check for updates in the background.",
          })}
        </Description>
      </div>
    </div>
  );
}
