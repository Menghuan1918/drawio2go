"use client";

import { Button } from "@heroui/react";
import { FolderOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useAppTranslation } from "@/app/i18n/hooks";
import { ThemeToggle } from "./ThemeToggle";

interface TopBarProps {
  selectionLabel?: string;
  currentProjectName?: string;
  onOpenProjectSelector?: () => void;
  onLoad?: () => void;
  onSave?: () => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export default function TopBar({
  selectionLabel,
  currentProjectName = "New Project",
  onOpenProjectSelector,
  onLoad,
  onSave,
  isSidebarOpen,
  onToggleSidebar,
}: TopBarProps) {
  const { t } = useAppTranslation("topbar");

  return (
    <div className="top-bar">
      <div className="top-bar-selection" title={selectionLabel}>
        {selectionLabel || t("selectionLabel.noSelection")}
      </div>

      <div className="top-bar-center">
        {onOpenProjectSelector && (
          <Button
            variant="secondary"
            size="sm"
            className="top-bar-project"
            onPress={onOpenProjectSelector}
          >
            <FolderOpen size={16} />
            <span className="truncate">{currentProjectName}</span>
          </Button>
        )}
      </div>

      <div className="top-bar-actions">
        {onLoad && (
          <Button
            variant="secondary"
            size="sm"
            className="top-bar-button"
            onPress={onLoad}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
            {t("buttons.load")}
          </Button>
        )}

        {onSave && (
          <Button
            variant="primary"
            size="sm"
            className="top-bar-button"
            onPress={onSave}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
              />
            </svg>
            {t("buttons.save")}
          </Button>
        )}

        <ThemeToggle />

        <Button
          isIconOnly
          variant="tertiary"
          size="sm"
          className="top-bar-button"
          aria-label={
            isSidebarOpen ? t("aria.collapseSidebar") : t("aria.expandSidebar")
          }
          onPress={onToggleSidebar}
        >
          {isSidebarOpen ? (
            <PanelRightClose size={18} />
          ) : (
            <PanelRightOpen size={18} />
          )}
        </Button>
      </div>
    </div>
  );
}
