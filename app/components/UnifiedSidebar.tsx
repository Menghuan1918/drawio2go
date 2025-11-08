"use client";

import { useState, useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import ChatSidebar from "./ChatSidebar";
import SettingsSidebar from "./SettingsSidebar";
import { useStorageSettings } from "@/app/hooks/useStorageSettings";

interface UnifiedSidebarProps {
  isOpen: boolean;
  activeSidebar: "none" | "settings" | "chat";
  onClose: () => void;
  onSettingsChange?: (settings: { defaultPath: string }) => void;
}

const MIN_WIDTH = 300;
const MAX_WIDTH = 3000;

type SidebarPointerEvent = ReactPointerEvent<HTMLDivElement>;

export default function UnifiedSidebar({
  isOpen,
  activeSidebar,
  onClose,
  onSettingsChange,
}: UnifiedSidebarProps) {
  // 存储 Hook
  const { getSetting, setSetting } = useStorageSettings();

  const [sidebarWidth, setSidebarWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarWidthRef = useRef(sidebarWidth);

  const applySidebarWidth = (width: number) => {
    setSidebarWidth(width);
    document.documentElement.style.setProperty("--sidebar-width", `${width}px`);
  };

  const calculateWidth = (clientX: number) => {
    const viewportWidth = window.innerWidth;
    const rawWidth = viewportWidth - clientX;
    const clampedMax = Math.min(MAX_WIDTH, viewportWidth);
    return Math.max(MIN_WIDTH, Math.min(rawWidth, clampedMax));
  };

  const finalizeResize = async () => {
    setIsResizing(false);
    try {
      await setSetting(
        "unifiedSidebarWidth",
        sidebarWidthRef.current.toString(),
      );
    } catch (e) {
      console.error("保存侧栏宽度失败:", e);
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
        console.error("加载侧栏宽度失败:", e);
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
      console.warn("无法捕获指针事件:", err);
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
      console.warn("释放指针捕获失败:", err);
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
        className="resize-handle"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      {/* 根据 activeSidebar 渲染不同内容 */}
      {activeSidebar === "settings" && (
        <SettingsSidebar
          isOpen={true}
          onClose={onClose}
          onSettingsChange={onSettingsChange}
        />
      )}
      {activeSidebar === "chat" && (
        <ChatSidebar isOpen={true} onClose={onClose} />
      )}
    </div>
  );
}
