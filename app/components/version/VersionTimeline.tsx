"use client";

import React from "react";
import { Button, Skeleton } from "@heroui/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowLeft, History } from "lucide-react";
import { VersionCard } from "./VersionCard";
import { WIP_VERSION } from "@/app/lib/storage/constants";
import { filterSubVersions, isSubVersion } from "@/app/lib/version-utils";
import type { XMLVersion } from "@/app/lib/storage/types";
import type { VersionPair } from "@/app/hooks/useVersionCompare";

// 虚拟滚动阈值 - 版本数量超过此值时启用虚拟滚动（极致紧凑优化）
const VIRTUAL_SCROLL_THRESHOLD = 30;

export type VersionTimelineViewMode =
  | { type: "main" }
  | { type: "sub"; parentVersion: string };

interface VersionTimelineProps {
  projectUuid: string;
  versions: XMLVersion[];
  onVersionRestore?: (versionId: string) => void;
  onVersionCreated?: () => void;
  isLoading?: boolean;
  compareMode?: boolean;
  selectedIds?: string[];
  onToggleSelect?: (versionId: string) => void;
  onQuickCompare?: (pair: VersionPair) => void;
  viewMode?: VersionTimelineViewMode;
  onViewModeChange?: (mode: VersionTimelineViewMode) => void;
  onNavigateToSubVersions?: (parentVersion: string) => void;
}

/**
 * 版本时间线组件 - 支持虚拟滚动
 * 显示所有历史版本的时间线列表（不包括 WIP 版本）
 * 当版本数 > 30 时自动启用虚拟滚动优化性能（极致紧凑优化）
 */
export function VersionTimeline({
  versions,
  onVersionRestore,
  isLoading = false,
  compareMode = false,
  selectedIds = [],
  onToggleSelect,
  onQuickCompare,
  viewMode,
  onViewModeChange,
  onNavigateToSubVersions,
}: VersionTimelineProps) {
  const parentRef = React.useRef<HTMLDivElement>(null);
  const skeletonItems = React.useMemo(() => Array.from({ length: 3 }), []);
  const selectedIdSet = React.useMemo(
    () => new Set(selectedIds),
    [selectedIds],
  );
  const [internalViewMode, setInternalViewMode] =
    React.useState<VersionTimelineViewMode>({ type: "main" });
  const resolvedViewMode = viewMode ?? internalViewMode;
  const updateViewMode = React.useCallback(
    (next: VersionTimelineViewMode) => {
      if (!viewMode) {
        setInternalViewMode(next);
      }
      onViewModeChange?.(next);
    },
    [viewMode, onViewModeChange],
  );
  const getCompareOrder = React.useCallback(
    (id: string) => {
      if (!compareMode) return null;
      const index = selectedIds.indexOf(id);
      return index === -1 ? null : index;
    },
    [compareMode, selectedIds],
  );

  const displayedVersions = React.useMemo(() => {
    if (resolvedViewMode.type === "main") {
      return versions.filter(
        (version) =>
          version.semantic_version === WIP_VERSION ||
          !isSubVersion(version.semantic_version),
      );
    }

    if (!resolvedViewMode.parentVersion) {
      return [];
    }

    return filterSubVersions(versions, resolvedViewMode.parentVersion);
  }, [versions, resolvedViewMode]);

  // 拆分 WIP 与历史版本，确保只保留最新的 WIP 并放在列表首位
  const { timelineVersions, displayedHistoricalVersions, hasWip } =
    React.useMemo(() => {
      try {
        const wipCandidates = displayedVersions
          .filter((version) => version.semantic_version === WIP_VERSION)
          .sort((a, b) => b.created_at - a.created_at);
        const wip = wipCandidates[0] ?? null;

        const historical = displayedVersions
          .filter((version) => version.semantic_version !== WIP_VERSION)
          .sort((a, b) => b.created_at - a.created_at);

        const combined = wip ? [wip, ...historical] : historical;

        return {
          timelineVersions: combined,
          displayedHistoricalVersions: historical,
          hasWip: Boolean(wip),
        };
      } catch (error) {
        console.error("版本排序失败:", error);
        return {
          timelineVersions: [],
          displayedHistoricalVersions: [],
          hasWip: false,
        };
      }
    }, [displayedVersions]);

  const allHistoricalVersions = React.useMemo(() => {
    try {
      return versions
        .filter((version) => version.semantic_version !== WIP_VERSION)
        .sort((a, b) => b.created_at - a.created_at);
    } catch (error) {
      console.error("全量历史版本排序失败:", error);
      return [];
    }
  }, [versions]);

  const mainSnapshotCount = React.useMemo(() => {
    return versions.filter(
      (version) =>
        version.semantic_version !== WIP_VERSION &&
        !isSubVersion(version.semantic_version),
    ).length;
  }, [versions]);

  const navigateToSubVersions = React.useCallback(
    (parentVersion: string) => {
      updateViewMode({ type: "sub", parentVersion });
      onNavigateToSubVersions?.(parentVersion);
    },
    [updateViewMode, onNavigateToSubVersions],
  );

  const navigateToMain = React.useCallback(() => {
    updateViewMode({ type: "main" });
  }, [updateViewMode]);

  // 是否启用虚拟滚动
  const enableVirtualScroll =
    !isLoading && timelineVersions.length > VIRTUAL_SCROLL_THRESHOLD;

  const mainDescriptionText = React.useMemo(() => {
    const parts = ["按时间倒序的快照记录"];
    if (enableVirtualScroll) {
      parts.push("虚拟滚动已启用");
    }
    if (compareMode) {
      parts.push("对比模式");
    }
    return parts.join(" • ");
  }, [enableVirtualScroll, compareMode]);

  React.useEffect(() => {
    if (!parentRef.current) return;
    parentRef.current.scrollTo({ top: 0 });
  }, [resolvedViewMode]);

  // 配置虚拟滚动器
  const virtualizer = useVirtualizer({
    count: timelineVersions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 70,
    overscan: 5,
    enabled: enableVirtualScroll,
  });

  if (isLoading) {
    return (
      <div className="version-timeline">
        <div className="timeline-header">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32 rounded-lg" />
            <Skeleton className="h-3 w-48 rounded-lg" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <div className="timeline-list timeline-list--skeleton">
          {skeletonItems.map((_, index) => (
            <Skeleton
              key={`timeline-skeleton-${index}`}
              className="h-20 rounded-xl"
            />
          ))}
        </div>
      </div>
    );
  }

  // 渲染虚拟滚动列表
  const renderVirtualList = () => {
    const virtualItems = virtualizer.getVirtualItems();

    return (
      <div
        ref={parentRef}
        className="timeline-list"
        style={{
          height: "100%",
          overflow: "auto",
        }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualItems.map((virtualItem) => {
            const version = timelineVersions[virtualItem.index];
            const isWipEntry = version.semantic_version === WIP_VERSION;
            const isLatestEntry = hasWip
              ? virtualItem.index === 1
              : virtualItem.index === 0;
            return (
              <div
                key={version.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <VersionCard
                  version={version}
                  isLatest={!isWipEntry && isLatestEntry}
                  isWIP={isWipEntry}
                  onRestore={onVersionRestore}
                  compareMode={compareMode}
                  selected={!isWipEntry && selectedIdSet.has(version.id)}
                  compareOrder={isWipEntry ? null : getCompareOrder(version.id)}
                  onToggleSelect={isWipEntry ? undefined : onToggleSelect}
                  onQuickCompare={(() => {
                    if (isWipEntry) return undefined;
                    const previous = timelineVersions[virtualItem.index + 1];
                    if (
                      !previous ||
                      previous.semantic_version === WIP_VERSION ||
                      !onQuickCompare
                    )
                      return undefined;
                    return () => {
                      const [older, newer] =
                        previous.created_at <= version.created_at
                          ? [previous, version]
                          : [version, previous];
                      onQuickCompare({ versionA: older, versionB: newer });
                    };
                  })()}
                  allVersions={allHistoricalVersions}
                  onNavigateToSubVersions={navigateToSubVersions}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // 渲染普通列表（无虚拟滚动）
  const renderNormalList = () => (
    <div className="timeline-list">
      {timelineVersions.map((version, index) => {
        const isWipEntry = version.semantic_version === WIP_VERSION;
        const isLatestEntry = hasWip ? index === 1 : index === 0;
        return (
          <VersionCard
            key={version.id}
            version={version}
            isLatest={!isWipEntry && isLatestEntry}
            isWIP={isWipEntry}
            onRestore={onVersionRestore}
            compareMode={compareMode}
            selected={!isWipEntry && selectedIdSet.has(version.id)}
            compareOrder={isWipEntry ? null : getCompareOrder(version.id)}
            onToggleSelect={isWipEntry ? undefined : onToggleSelect}
            onQuickCompare={(() => {
              if (isWipEntry) return undefined;
              const previous = timelineVersions[index + 1];
              if (
                !previous ||
                previous.semantic_version === WIP_VERSION ||
                !onQuickCompare
              )
                return undefined;
              return () => {
                const [older, newer] =
                  previous.created_at <= version.created_at
                    ? [previous, version]
                    : [version, previous];
                onQuickCompare({ versionA: older, versionB: newer });
              };
            })()}
            allVersions={allHistoricalVersions}
            onNavigateToSubVersions={navigateToSubVersions}
          />
        );
      })}
    </div>
  );

  const emptyState = (
    <div className="version-timeline-empty">
      <div className="empty-state-small">
        <div className="empty-state-icon">
          <History className="w-5 h-5" />
        </div>
        <p>
          {resolvedViewMode.type === "main" ? "暂无历史版本" : "暂无子版本"}
        </p>
        <p>
          {resolvedViewMode.type === "main"
            ? "点击“保存版本”创建第一份快照"
            : resolvedViewMode.parentVersion
              ? `v${resolvedViewMode.parentVersion} 尚未创建子版本`
              : "请选择一个主版本"}
        </p>
      </div>
    </div>
  );

  const listContent =
    timelineVersions.length === 0
      ? emptyState
      : enableVirtualScroll
        ? renderVirtualList()
        : renderNormalList();

  return (
    <div className="version-timeline">
      {/* 时间线头部 */}
      <div className="timeline-header">
        <div className="flex items-center gap-3">
          {resolvedViewMode.type === "sub" && (
            <Button
              size="sm"
              variant="ghost"
              onPress={navigateToMain}
              className="timeline-back-button"
            >
              <ArrowLeft className="w-4 h-4" />
              返回
            </Button>
          )}
          <div>
            {resolvedViewMode.type === "main" ? (
              <h3>历史版本</h3>
            ) : (
              <h3>子版本视图</h3>
            )}
            <p className="timeline-description">
              {resolvedViewMode.type === "main"
                ? mainDescriptionText
                : `版本管理 > v${resolvedViewMode.parentVersion ?? "未知"} 的子版本`}
            </p>
          </div>
        </div>
        <div className="timeline-header__actions">
          <span className="timeline-chip">
            {resolvedViewMode.type === "main"
              ? `历史快照 ${mainSnapshotCount} 个${hasWip ? " + WIP" : ""}`
              : `子版本 ${timelineVersions.length} 个`}
          </span>
          {compareMode &&
            resolvedViewMode.type === "main" &&
            displayedHistoricalVersions.length >= 2 && (
              <Button
                size="sm"
                variant="secondary"
                onPress={() => {
                  if (!onQuickCompare) return;
                  const latest = displayedHistoricalVersions[0];
                  const previous = displayedHistoricalVersions[1];
                  if (!latest || !previous) return;
                  const [older, newer] =
                    previous.created_at <= latest.created_at
                      ? [previous, latest]
                      : [latest, previous];
                  onQuickCompare({ versionA: older, versionB: newer });
                }}
              >
                最新 vs 上一版本
              </Button>
            )}
        </div>
      </div>
      {/* 版本列表 - 根据数量选择渲染方式 */}
      {listContent}
    </div>
  );
}
