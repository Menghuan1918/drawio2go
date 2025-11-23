"use client";

import React from "react";
import { Alert, Button, Skeleton } from "@heroui/react";
import {
  VersionTimeline,
  type VersionTimelineViewMode,
} from "./version/VersionTimeline";
import { CreateVersionDialog } from "./version/CreateVersionDialog";
import { VersionCompare } from "./version/VersionCompare";
import { useVersionCompare } from "@/app/hooks/useVersionCompare";
import {
  useStorageXMLVersions,
  type CreateHistoricalVersionResult,
} from "@/app/hooks/useStorageXMLVersions";
import { History, Save } from "lucide-react";
import type { XMLVersion } from "@/app/lib/storage/types";
import type { DrawioEditorRef } from "@/app/components/DrawioEditorNative";

interface VersionSidebarProps {
  projectUuid: string | null;
  onVersionRestore?: (versionId: string) => void;
  editorRef: React.RefObject<DrawioEditorRef | null>;
}

/**
 * 版本侧边栏主组件
 * 集成 WIP 指示器、版本时间线和创建版本对话框
 */
export function VersionSidebar({
  projectUuid,
  onVersionRestore,
  editorRef,
}: VersionSidebarProps) {
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);
  const [versions, setVersions] = React.useState<XMLVersion[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [creationFeedback, setCreationFeedback] = React.useState<{
    message: string;
    tone: "success" | "warning";
  } | null>(null);
  const feedbackTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [timelineViewMode, setTimelineViewMode] =
    React.useState<VersionTimelineViewMode>({ type: "main" });

  const { subscribeVersions, getAllXMLVersions } = useStorageXMLVersions();
  const compare = useVersionCompare();
  const {
    isCompareMode,
    selectedIds,
    toggleCompareMode,
    resetSelection,
    toggleSelection,
    isDialogOpen,
    activePair,
    openDialogWithPair,
    closeDialog,
  } = compare;

  const selectedVersions = React.useMemo(
    () =>
      selectedIds
        .map((id) => versions.find((item) => item.id === id))
        .filter(Boolean) as XMLVersion[],
    [selectedIds, versions],
  );

  React.useEffect(() => {
    if (!selectedIds.length) return;
    if (selectedVersions.length !== selectedIds.length) {
      resetSelection();
    }
  }, [selectedIds, selectedVersions.length, resetSelection]);

  const comparePair = React.useMemo(() => {
    if (selectedVersions.length !== 2) return null;
    const sorted = [...selectedVersions].sort(
      (a, b) => a.created_at - b.created_at,
    );
    return { versionA: sorted[0], versionB: sorted[1] };
  }, [selectedVersions]);

  const canStartCompare = Boolean(comparePair);
  const activeParentVersion =
    timelineViewMode.type === "sub"
      ? timelineViewMode.parentVersion
      : undefined;

  const handleTimelineViewModeChange = React.useCallback(
    (mode: VersionTimelineViewMode) => {
      setTimelineViewMode(mode);
    },
    [setTimelineViewMode],
  );

  const handleNavigateToSubVersions = React.useCallback(
    (parentVersion: string) => {
      setTimelineViewMode((prev) => {
        if (prev.type === "sub" && prev.parentVersion === parentVersion) {
          return prev;
        }
        return { type: "sub", parentVersion };
      });
    },
    [setTimelineViewMode],
  );

  React.useEffect(() => {
    if (!projectUuid) {
      setVersions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const unsubscribe = subscribeVersions(
      projectUuid,
      (nextVersions) => {
        setVersions(nextVersions);
        setIsLoading(false);
      },
      () => {
        setError("加载版本列表失败");
        setIsLoading(false);
      },
    );

    return () => {
      unsubscribe?.();
    };
  }, [projectUuid, subscribeVersions]);

  React.useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    setTimelineViewMode({ type: "main" });
  }, [projectUuid, setTimelineViewMode]);

  const handleReload = React.useCallback(async () => {
    if (!projectUuid) return;
    setIsLoading(true);
    setError(null);
    try {
      await getAllXMLVersions(projectUuid);
    } catch (err) {
      console.error("加载版本列表失败:", err);
      setError("加载版本列表失败");
    } finally {
      setIsLoading(false);
    }
  }, [getAllXMLVersions, projectUuid]);

  // 版本创建后反馈提示
  const handleVersionCreated = React.useCallback(
    (result?: CreateHistoricalVersionResult) => {
      if (result) {
        const tone = result.svgAttached ? "success" : "warning";
        const message = result.svgAttached
          ? `已保存 ${result.pageCount} 页版本，并缓存 SVG 预览。`
          : `版本已保存（${result.pageCount} 页），但 SVG 导出失败已自动降级。`;
        setCreationFeedback({ message, tone });
        if (feedbackTimerRef.current) {
          clearTimeout(feedbackTimerRef.current);
        }
        feedbackTimerRef.current = setTimeout(() => {
          setCreationFeedback(null);
        }, 4000);
      }
    },
    [],
  );

  // 如果没有选择项目，显示空状态
  if (!projectUuid) {
    return (
      <div className="version-sidebar version-sidebar--empty">
        <div className="empty-state-card">
          <History className="empty-state-card__icon" />
          <p className="empty-state-card__title">尚未选择项目</p>
          <p className="empty-state-card__description">
            选择一个项目后即可查看快照、关键帧与 Diff 历史
          </p>
        </div>
      </div>
    );
  }

  // 如果加载失败，显示错误状态
  if (error) {
    return (
      <div className="version-sidebar">
        <div className="sidebar-header">
          <div className="sidebar-header__info">
            <div className="sidebar-header__icon">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">版本管理</h2>
              <p className="sidebar-header__description">
                快照历史加载失败，请重试
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onPress={handleReload}
            className="version-sidebar__retry"
          >
            重试
          </Button>
        </div>
        <div className="empty-state-card">
          <p className="empty-state-card__description text-red-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="version-sidebar">
      {/* 顶部标题和操作按钮 */}
      <div className="sidebar-header">
        <div className="sidebar-header__info">
          <div className="sidebar-header__icon">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">版本管理</h2>
            <p className="sidebar-header__description">
              追踪关键帧与 Diff 链，快速回溯历史
            </p>
          </div>
        </div>
        <div className="sidebar-header__actions">
          {versions.length > 1 && (
            <Button
              size="sm"
              variant={isCompareMode ? "secondary" : "ghost"}
              onPress={toggleCompareMode}
              className="version-sidebar__compare-btn"
            >
              {isCompareMode ? "退出对比" : "对比版本"}
            </Button>
          )}
          <Button
            size="sm"
            variant="primary"
            onPress={() => setShowCreateDialog(true)}
            className="version-sidebar__cta"
            isDisabled={isLoading}
          >
            <Save className="w-4 h-4" />
            保存版本
          </Button>
        </div>
      </div>

      {/* 滚动内容区域 */}
      <div className="sidebar-content">
        {creationFeedback && (
          <Alert
            status={creationFeedback.tone === "success" ? "success" : "warning"}
            className="mb-4"
          >
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>
                {creationFeedback.tone === "success"
                  ? "版本已保存"
                  : "已降级保存"}
              </Alert.Title>
              <Alert.Description>{creationFeedback.message}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-28 rounded-xl" />
            <VersionTimeline
              projectUuid={projectUuid}
              versions={versions}
              onVersionRestore={onVersionRestore}
              onVersionCreated={handleVersionCreated}
              isLoading
              viewMode={timelineViewMode}
              onViewModeChange={handleTimelineViewModeChange}
              onNavigateToSubVersions={handleNavigateToSubVersions}
            />
          </div>
        ) : (
          <>
            {isCompareMode && (
              <div className="compare-mode-banner">
                <div className="compare-mode-banner__info">
                  <p>
                    对比模式已开启 · 已选择 {selectedVersions.length}/2 个版本
                  </p>
                  <span>
                    {canStartCompare ? "准备就绪" : "请选择两个历史版本"}
                  </span>
                </div>
                {selectedVersions.length > 0 && (
                  <div className="compare-mode-chips">
                    {selectedVersions.map((v, index) => (
                      <span key={v.id} className="compare-mode-chip">
                        #{index + 1} · v{v.semantic_version}
                      </span>
                    ))}
                  </div>
                )}
                <div className="compare-mode-actions">
                  <Button
                    size="sm"
                    variant="primary"
                    onPress={() =>
                      comparePair && openDialogWithPair(comparePair)
                    }
                    isDisabled={!canStartCompare}
                  >
                    开始对比
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={resetSelection}
                    isDisabled={!selectedIds.length}
                  >
                    清空选择
                  </Button>
                </div>
              </div>
            )}
            <VersionTimeline
              projectUuid={projectUuid}
              versions={versions}
              onVersionRestore={onVersionRestore}
              onVersionCreated={handleVersionCreated}
              compareMode={isCompareMode}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelection}
              onQuickCompare={openDialogWithPair}
              viewMode={timelineViewMode}
              onViewModeChange={handleTimelineViewModeChange}
              onNavigateToSubVersions={handleNavigateToSubVersions}
            />
          </>
        )}
      </div>

      {/* 创建版本对话框 */}
      <CreateVersionDialog
        projectUuid={projectUuid}
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onVersionCreated={handleVersionCreated}
        editorRef={editorRef}
        parentVersion={activeParentVersion}
      />

      {isDialogOpen && activePair && (
        <VersionCompare
          versionA={activePair.versionA}
          versionB={activePair.versionB}
          versions={versions}
          isOpen={isDialogOpen}
          onClose={closeDialog}
        />
      )}
    </div>
  );
}
