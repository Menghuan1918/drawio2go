"use client";

import {
  useState,
  useEffect,
  useRef,
  useMemo,
  type Key,
  type RefObject,
} from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Tabs } from "@heroui/react";
import { History, MessageSquare, Settings } from "lucide-react";
import ChatSidebar from "./ChatSidebar";
import SettingsSidebar from "./SettingsSidebar";
import { VersionSidebar } from "./VersionSidebar";
import { SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH } from "./constants/sidebar";
import { useStorageSettings } from "@/app/hooks/useStorageSettings";
import { useAppTranslation } from "@/app/i18n/hooks";
import type { DrawioEditorRef } from "@/app/components/DrawioEditorNative";
import { createLogger } from "@/lib/logger";

const logger = createLogger("UnifiedSidebar");

export type SidebarTab = "chat" | "settings" | "version";

interface UnifiedSidebarProps {
  isOpen: boolean;
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  onClose: () => void;
  onSettingsChange?: (settings: { defaultPath: string }) => void;
  currentProjectId?: string;
  projectUuid?: string | null;
  onVersionRestore?: (versionId: string) => void;
  editorRef: RefObject<DrawioEditorRef | null>;
  isSocketConnected?: boolean;
}

type SidebarPointerEvent = ReactPointerEvent<HTMLDivElement>;

export default function UnifiedSidebar({
  isOpen,
  activeTab,
  onTabChange,
  onClose,
  onSettingsChange,
  currentProjectId,
  projectUuid,
  onVersionRestore,
  editorRef,
  isSocketConnected = true,
}: UnifiedSidebarProps) {
  const { t } = useAppTranslation("sidebar");
  // 存储 Hook
  const { getSetting, setSetting } = useStorageSettings();

  const TAB_ITEMS = useMemo(
    () => [
      { key: "chat", label: t("tabs.chat"), Icon: MessageSquare },
      { key: "settings", label: t("tabs.settings"), Icon: Settings },
      { key: "version", label: t("tabs.version"), Icon: History },
    ],
    [t],
  );

  const [sidebarWidth, setSidebarWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarWidthRef = useRef(sidebarWidth);
  const handleTabSelection = (key: Key) => {
    onTabChange(key as SidebarTab);
  };

  const applySidebarWidth = (width: number) => {
    setSidebarWidth(width);
    document.documentElement.style.setProperty("--sidebar-width", `${width}px`);
  };

  const calculateWidth = (clientX: number) => {
    const viewportWidth = window.innerWidth;
    const rawWidth = viewportWidth - clientX;
    const clampedMax = Math.min(SIDEBAR_MAX_WIDTH, viewportWidth);
    return Math.max(SIDEBAR_MIN_WIDTH, Math.min(rawWidth, clampedMax));
  };

  const finalizeResize = async () => {
    setIsResizing(false);
    try {
      await setSetting(
        "unifiedSidebarWidth",
        sidebarWidthRef.current.toString(),
      );
    } catch (e) {
      logger.error("Failed to save sidebar width:", e);
    }
  };

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  // 从存储恢复侧栏宽度
  useEffect(() => {
    const loadWidth = async () => {
      try {
        const savedWidth = await getSetting("unifiedSidebarWidth");
        if (savedWidth) {
          const width = parseInt(savedWidth);
          applySidebarWidth(width);
        }
      } catch (e) {
        logger.error("Failed to load sidebar width:", e);
      }
    };

    loadWidth();
  }, [getSetting]);

  const handlePointerDown = (e: SidebarPointerEvent) => {
    if (e.button !== 0 && e.pointerType !== "touch") {
      return;
    }
    e.preventDefault();
    setIsResizing(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {
      logger.warn("Failed to capture pointer event:", err);
    }
  };

  const handlePointerMove = (e: SidebarPointerEvent) => {
    if (!isResizing) return;
    const newWidth = calculateWidth(e.clientX);
    applySidebarWidth(newWidth);
  };

  const handlePointerUp = async (e: SidebarPointerEvent) => {
    if (!isResizing) return;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch (err) {
      logger.warn("Failed to release pointer capture:", err);
    }
    await finalizeResize();
  };

  return (
    <div
      className={`unified-sidebar ${isOpen ? "open" : ""} ${
        isResizing ? "resizing" : ""
      }`}
      style={{ width: `${sidebarWidth}px` }}
    >
      {/* 拖拽分隔条 */}
      <div
        className="resize-handle sidebar-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label={t("aria.resizeHandle")}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      <div className="sidebar-tabs-shell">
        <Tabs
          aria-label={t("aria.navigation")}
          selectedKey={activeTab}
          onSelectionChange={handleTabSelection}
        >
          <Tabs.ListContainer className="sidebar-tab-strip">
            <Tabs.List
              aria-label={t("aria.tabsList")}
              className="sidebar-tab-list"
            >
              {TAB_ITEMS.map(({ key, label, Icon }) => (
                <Tabs.Tab key={key} id={key} className="sidebar-tab-item">
                  <Icon size={16} />
                  <span>{label}</span>
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>

        <div className="sidebar-panels">
          <div
            id="chat-panel"
            role="tabpanel"
            aria-labelledby="chat"
            aria-hidden={activeTab !== "chat"}
            className="sidebar-panel"
            style={{ display: activeTab === "chat" ? "block" : "none" }}
          >
            <ChatSidebar
              isOpen={activeTab === "chat"}
              onClose={onClose}
              currentProjectId={currentProjectId}
              isSocketConnected={isSocketConnected}
            />
          </div>

          <div
            id="settings-panel"
            role="tabpanel"
            aria-labelledby="settings"
            aria-hidden={activeTab !== "settings"}
            className="sidebar-panel"
            style={{ display: activeTab === "settings" ? "block" : "none" }}
          >
            <SettingsSidebar
              isOpen={true}
              onClose={onClose}
              onSettingsChange={onSettingsChange}
            />
          </div>

          <div
            id="version-panel"
            role="tabpanel"
            aria-labelledby="version"
            aria-hidden={activeTab !== "version"}
            className="sidebar-panel"
            style={{ display: activeTab === "version" ? "block" : "none" }}
          >
            <VersionSidebar
              projectUuid={projectUuid || null}
              onVersionRestore={onVersionRestore}
              editorRef={editorRef}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
