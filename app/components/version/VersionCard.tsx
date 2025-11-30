"use client";

/* eslint-disable @next/next/no-img-element */

import React from "react";
import {
  Button,
  Card,
  Disclosure,
  TooltipContent,
  TooltipRoot,
} from "@heroui/react";
import {
  Clock,
  Key,
  GitBranch,
  RotateCcw,
  Download,
  ChevronDown,
  ImageOff,
  LayoutGrid,
  Loader2,
  Maximize2,
  CheckSquare,
  Square,
  Activity,
  ZoomIn,
  Layers,
} from "lucide-react";
import { materializeVersionXml } from "@/app/lib/storage/xml-version-engine";
import { useStorageXMLVersions } from "@/app/hooks/useStorageXMLVersions";
import { deserializeSVGsFromBlob } from "@/app/lib/svg-export-utils";
import type { XMLVersion } from "@/app/lib/storage/types";
import { PageSVGViewer } from "./PageSVGViewer";
import {
  createBlobFromSource,
  parsePageNames,
  type BinarySource,
} from "./version-utils";
import { decompressBlob } from "@/app/lib/compression-utils";
import { countSubVersions, isSubVersion } from "@/app/lib/version-utils";
import { formatVersionTimestamp } from "@/app/lib/format-utils";
import { useAppTranslation } from "@/app/i18n/hooks";

interface VersionCardProps {
  version: XMLVersion;
  isLatest?: boolean;
  isWIP?: boolean;
  onRestore?: (versionId: string) => void;
  defaultExpanded?: boolean;
  compareMode?: boolean;
  selected?: boolean;
  compareOrder?: number | null;
  onToggleSelect?: (versionId: string) => void;
  onQuickCompare?: () => void;
  allVersions: XMLVersion[];
  onNavigateToSubVersions?: (parentVersion: string) => void;
}

interface PageThumbnail {
  index: number;
  name: string;
  url: string;
}

/**
 * 版本卡片组件 - 紧凑折叠模式
 * 默认显示折叠视图(版本号+徽章+时间),点击展开查看完整信息
 */
export function VersionCard({
  version,
  isLatest,
  isWIP = false,
  onRestore,
  defaultExpanded = false,
  compareMode = false,
  selected = false,
  compareOrder = null,
  onToggleSelect,
  onQuickCompare,
  allVersions,
  onNavigateToSubVersions,
}: VersionCardProps) {
  const [isExporting, setIsExporting] = React.useState(false);
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded && !isWIP);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [showAllPages, setShowAllPages] = React.useState(false);
  const [pageThumbs, setPageThumbs] = React.useState<PageThumbnail[]>([]);
  const [isLoadingPages, setIsLoadingPages] = React.useState(false);
  const [pagesError, setPagesError] = React.useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = React.useState(false);
  const [viewerInitialPage, setViewerInitialPage] = React.useState(0);
  const pageObjectUrlsRef = React.useRef<string[]>([]);
  const { getXMLVersion, loadVersionSVGFields } = useStorageXMLVersions();
  const { i18n } = useAppTranslation("version");
  const [resolvedVersion, setResolvedVersion] =
    React.useState<XMLVersion>(version);
  const isSubVersionEntry = React.useMemo(
    () => isSubVersion(version.semantic_version),
    [version.semantic_version],
  );
  const subVersionCount = React.useMemo(() => {
    if (isSubVersionEntry) return 0;
    return countSubVersions(allVersions, version.semantic_version);
  }, [allVersions, isSubVersionEntry, version.semantic_version]);
  const shouldShowSubVersionBadge =
    !isWIP && !isSubVersionEntry && subVersionCount > 0;
  const shouldShowSubVersionButton =
    shouldShowSubVersionBadge && Boolean(onNavigateToSubVersions);

  React.useEffect(() => {
    let cancelled = false;
    setResolvedVersion(version);

    const needsPreview = !version.preview_svg;
    const needsPages = (version.page_count ?? 0) > 1 && !version.pages_svg;
    if (!needsPreview && !needsPages) {
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const enriched = await loadVersionSVGFields(version);
        if (!cancelled) {
          setResolvedVersion(enriched);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("加载版本 SVG 数据失败", error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [version, loadVersionSVGFields]);
  const effectiveExpanded = isWIP ? false : isExpanded;

  const versionLabel = isWIP ? "WIP" : `v${version.semantic_version}`;
  const diffLabel = isWIP
    ? "当前画布内容"
    : resolvedVersion.is_keyframe
      ? "关键帧快照"
      : `Diff 链 +${resolvedVersion.diff_chain_depth}`;
  const diffIcon = isWIP ? null : resolvedVersion.is_keyframe ? (
    <Key className="w-3.5 h-3.5" />
  ) : (
    <GitBranch className="w-3.5 h-3.5" />
  );

  const pageNames = React.useMemo(
    () => parsePageNames(resolvedVersion.page_names),
    [resolvedVersion.page_names],
  );

  const hasMultiplePages = (resolvedVersion.page_count ?? 0) > 1;

  // WIP 卡片保持折叠状态
  React.useEffect(() => {
    if (isWIP && isExpanded) {
      setIsExpanded(false);
    }
  }, [isExpanded, isWIP]);

  const openViewer = React.useCallback((pageIndex: number) => {
    setViewerInitialPage(Math.max(0, pageIndex));
    setViewerOpen(true);
  }, []);

  const handlePreviewActivate = React.useCallback(() => {
    openViewer(0);
  }, [openViewer]);

  const handleThumbnailActivate = React.useCallback(
    (pageIndex: number) => {
      openViewer(pageIndex);
    },
    [openViewer],
  );

  const handleCardAreaClick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (isWIP) return;
      const target = event.target as HTMLElement | null;

      if (target?.closest(".version-card__trigger")) {
        return;
      }

      if (!isExpanded) {
        setIsExpanded(true);
        return;
      }

      const isInExpandedContent = Boolean(
        target?.closest(".version-card__expanded-content"),
      );

      if (!isInExpandedContent) {
        setIsExpanded(false);
      }
    },
    [isExpanded, isWIP],
  );

  // 格式化创建时间
  const createdAtFull = formatVersionTimestamp(
    resolvedVersion.created_at,
    "full",
    i18n.language,
  );

  const createdAtCompact = formatVersionTimestamp(
    resolvedVersion.created_at,
    "compact",
    i18n.language,
  );

  // 管理 preview_svg 的 Object URL（需要先解压）
  React.useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    (async () => {
      if (!resolvedVersion.preview_svg) {
        setPreviewUrl(null);
        return;
      }

      const compressedBlob = createBlobFromSource(
        resolvedVersion.preview_svg as BinarySource,
        "application/octet-stream",
      );

      if (!compressedBlob) {
        setPreviewUrl(null);
        return;
      }

      try {
        const decompressed = await decompressBlob(compressedBlob);
        if (cancelled) return;
        const typedBlob = decompressed.type
          ? decompressed
          : new Blob([await decompressed.arrayBuffer()], {
              type: "image/svg+xml",
            });
        objectUrl = URL.createObjectURL(typedBlob);
        setPreviewUrl(objectUrl);
      } catch (error) {
        console.warn("解压 preview_svg 失败", error);
        if (!cancelled) {
          setPreviewUrl(null);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [resolvedVersion.id, resolvedVersion.preview_svg]);

  const cleanupPageUrls = React.useCallback(() => {
    pageObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    pageObjectUrlsRef.current = [];
  }, []);

  React.useEffect(() => {
    if (!hasMultiplePages && showAllPages) {
      setShowAllPages(false);
    }
  }, [hasMultiplePages, showAllPages]);

  // 折叠时关闭全部页面视图并清理
  React.useEffect(() => {
    if (!isExpanded) {
      setShowAllPages(false);
      setPageThumbs([]);
      setPagesError(null);
      cleanupPageUrls();
    }
  }, [cleanupPageUrls, isExpanded]);

  // 懒加载 pages_svg
  React.useEffect(() => {
    if (!showAllPages) {
      cleanupPageUrls();
      setPageThumbs([]);
      setPagesError(null);
      setIsLoadingPages(false);
      return;
    }

    if (!resolvedVersion.pages_svg) {
      setPagesError("暂无多页 SVG 数据");
      setPageThumbs([]);
      return;
    }

    let cancelled = false;
    cleanupPageUrls();
    setIsLoadingPages(true);
    setPagesError(null);

    (async () => {
      try {
        const blob = createBlobFromSource(
          resolvedVersion.pages_svg as BinarySource,
          "application/json",
        );
        if (!blob) {
          throw new Error("无法解析 pages_svg 数据");
        }

        const pages = await deserializeSVGsFromBlob(blob);
        if (cancelled) return;

        if (!pages.length) {
          throw new Error("多页数据为空");
        }

        const thumbs = pages
          .sort((a, b) => a.index - b.index)
          .map((page) => {
            const svgBlob = new Blob([page.svg], { type: "image/svg+xml" });
            const url = URL.createObjectURL(svgBlob);
            pageObjectUrlsRef.current.push(url);
            return {
              index: page.index,
              name:
                typeof page.name === "string" && page.name.trim().length > 0
                  ? page.name
                  : `Page ${page.index + 1}`,
              url,
            };
          });

        setPageThumbs(thumbs);
      } catch (error) {
        console.error("解析多页 SVG 失败", error);
        if (!cancelled) {
          setPagesError((error as Error).message || "无法加载页面 SVG");
          setPageThumbs([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPages(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      cleanupPageUrls();
    };
  }, [
    cleanupPageUrls,
    showAllPages,
    resolvedVersion.id,
    resolvedVersion.pages_svg,
  ]);

  // 处理回滚按钮点击
  const handleRestore = () => {
    if (onRestore) {
      try {
        onRestore(version.id);
      } catch (error) {
        console.error("回滚版本失败:", error);
      }
    }
  };

  // 处理导出按钮点击
  const handleExport = async () => {
    setIsExporting(true);
    try {
      // 恢复完整 XML
      const fullXml = await materializeVersionXml(version, (id) =>
        getXMLVersion(id, version.project_uuid),
      );

      // 创建下载
      const blob = new Blob([fullXml], { type: "text/xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `diagram-v${version.semantic_version}.drawio`;
      a.click();
      URL.revokeObjectURL(url);

      console.log(`✅ 版本 ${version.semantic_version} 导出成功`);
    } catch (error) {
      console.error("导出版本失败:", error);
      alert("导出失败");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Card.Root
      className={`version-card${isLatest ? " version-card--latest" : ""}${effectiveExpanded ? " version-card--expanded" : " version-card--collapsed"}${compareMode ? " version-card--compare" : ""}${selected ? " version-card--selected" : ""}${isSubVersionEntry ? " version-card--sub-version" : ""}${isWIP ? " version-card--wip" : ""}`}
      variant="secondary"
      onClick={handleCardAreaClick}
    >
      <Card.Content className="version-card__content">
        <Disclosure
          isExpanded={effectiveExpanded}
          onExpandedChange={(expanded) => {
            if (isWIP) return;
            setIsExpanded(expanded);
          }}
        >
          {/* 折叠状态的紧凑视图 - 始终显示 */}
          <Disclosure.Heading>
            <button
              type="button"
              className="version-card__trigger"
              onClick={() => {
                if (isWIP) return;
                setIsExpanded(!isExpanded);
              }}
              aria-expanded={effectiveExpanded}
              aria-disabled={isWIP}
            >
              <div className="version-card__compact-view">
                {compareMode && !isWIP && (
                  <div
                    role="button"
                    tabIndex={0}
                    aria-pressed={selected}
                    aria-label={
                      selected
                        ? `已选择为对比序号 ${(compareOrder ?? 0) + 1}`
                        : "选择该版本进行对比"
                    }
                    className={`version-card__select-chip${selected ? " version-card__select-chip--active" : ""}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleSelect?.(version.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        onToggleSelect?.(version.id);
                      }
                    }}
                  >
                    {selected ? (
                      <CheckSquare className="w-3.5 h-3.5" />
                    ) : (
                      <Square className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {selected && compareOrder !== null
                        ? `#${compareOrder + 1}`
                        : "加入"}
                    </span>
                  </div>
                )}
                <div className="version-card__compact-left">
                  <span className="version-number">{versionLabel}</span>
                  {isLatest && !isWIP && (
                    <span className="latest-badge">最新</span>
                  )}
                  {!isWIP &&
                    (version.is_keyframe ? (
                      <TooltipRoot>
                        <span className="keyframe-badge">
                          <Key className="w-3 h-3" />
                        </span>
                        <TooltipContent>关键帧</TooltipContent>
                      </TooltipRoot>
                    ) : (
                      <TooltipRoot>
                        <span className="diff-badge">
                          <GitBranch className="w-3 h-3" />+
                          {version.diff_chain_depth}
                        </span>
                        <TooltipContent>
                          差异链深度 +{version.diff_chain_depth}
                        </TooltipContent>
                      </TooltipRoot>
                    ))}
                  {/* 页面数徽章（仅多页时显示） */}
                  {version.page_count > 1 && (
                    <TooltipRoot>
                      <span className="page-count-badge">
                        <LayoutGrid className="w-3 h-3" />
                        {version.page_count}
                      </span>
                      <TooltipContent>
                        {version.page_count} 个页面
                      </TooltipContent>
                    </TooltipRoot>
                  )}
                  {shouldShowSubVersionBadge && (
                    <TooltipRoot>
                      <span
                        className="version-card__sub-version-badge"
                        aria-label={`包含 ${subVersionCount} 个子版本`}
                      >
                        <Layers className="w-3 h-3" />
                        {subVersionCount}
                      </span>
                      <TooltipContent>
                        {`包含 ${subVersionCount} 个子版本`}
                      </TooltipContent>
                    </TooltipRoot>
                  )}
                  {/* 内联描述（自适应宽度，仅有描述时显示） */}
                  {isWIP ? (
                    <span
                      className="version-card__compact-description"
                      title="当前画布内容"
                    >
                      当前画布内容
                    </span>
                  ) : (
                    version.description && (
                      <span
                        className="version-card__compact-description"
                        title={version.description}
                      >
                        {version.description}
                      </span>
                    )
                  )}
                </div>
                <div className="version-card__compact-right">
                  {compareMode && selected && (
                    <span className="version-card__chip">
                      {compareOrder !== null
                        ? `第 ${compareOrder + 1} 个`
                        : "已选"}
                    </span>
                  )}
                  <span className="version-card__time">
                    <Clock className="w-3 h-3" />
                    {createdAtCompact}
                  </span>
                  {!isWIP && (
                    <ChevronDown
                      className={`version-card__chevron${effectiveExpanded ? " rotated" : ""}`}
                    />
                  )}
                </div>
              </div>
            </button>
          </Disclosure.Heading>

          {/* 展开状态的完整内容 */}
          <Disclosure.Content hidden={isWIP}>
            <div className="version-card__expanded-content">
              {!isWIP &&
                version.name &&
                version.name !== version.semantic_version && (
                  <h4 className="version-card__name">{version.name}</h4>
                )}

              {!isWIP && version.description && (
                <p className="version-card__description">
                  {version.description}
                </p>
              )}

              <div className="version-card__media">
                {previewUrl ? (
                  <div
                    className="version-preview version-preview--interactive"
                    role="button"
                    tabIndex={0}
                    aria-label={
                      hasMultiplePages
                        ? `打开全屏查看器，当前共 ${version.page_count} 页`
                        : `全屏查看 ${versionLabel} 预览图`
                    }
                    onClick={handlePreviewActivate}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handlePreviewActivate();
                      }
                    }}
                  >
                    <img
                      src={previewUrl}
                      alt={`${versionLabel} 预览图`}
                      className="version-preview__image"
                      loading="lazy"
                    />
                    <div className="version-preview__overlay">
                      <ZoomIn className="version-preview__zoom-icon" />
                      <span className="version-preview__zoom-text">
                        点击查看大图
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="version-preview version-preview--placeholder">
                    <ImageOff className="version-preview__placeholder-icon" />
                    <p className="version-preview__placeholder-title">
                      暂无 SVG 预览
                    </p>
                    <span className="version-preview__placeholder-text">
                      旧版本可能未导出 SVG，保存新的快照即可生成缩略图
                    </span>
                  </div>
                )}

                <div className="version-preview__meta">
                  <div className="version-preview__badges">
                    {version.page_count > 0 && pageNames.length > 0 && (
                      <TooltipRoot delay={0}>
                        <span className="version-page-badge" role="text">
                          <LayoutGrid className="w-3 h-3" />共{" "}
                          {version.page_count} 页
                        </span>
                        <TooltipContent placement="top">
                          <p>{pageNames.join(" / ")}</p>
                        </TooltipContent>
                      </TooltipRoot>
                    )}
                    {version.page_count > 0 && pageNames.length === 0 && (
                      <span className="version-page-badge" role="text">
                        <LayoutGrid className="w-3 h-3" />共{" "}
                        {version.page_count} 页
                      </span>
                    )}
                    {!previewUrl && (
                      <span className="version-preview__hint">
                        旧版本缺少预览图
                      </span>
                    )}
                  </div>

                  {hasMultiplePages && (
                    <div className="version-preview__actions">
                      <Button
                        size="sm"
                        variant="ghost"
                        onPress={() => setShowAllPages((prev) => !prev)}
                        aria-expanded={showAllPages}
                        aria-label={
                          showAllPages ? "收起页面缩略图" : "展开页面缩略图"
                        }
                      >
                        <LayoutGrid className="w-3.5 h-3.5" />
                        {showAllPages ? "收起缩略图" : "展开缩略图"}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onPress={() => openViewer(0)}
                        aria-label={`打开多页查看器，当前共 ${version.page_count} 页`}
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                        查看所有 {version.page_count} 页
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {showAllPages && (
                <div className="version-pages-grid">
                  {isLoadingPages && (
                    <div className="version-pages-grid__status">
                      <Loader2 className="version-pages-grid__spinner" />
                      <span>正在加载全部页面...</span>
                    </div>
                  )}

                  {!isLoadingPages && pagesError && (
                    <div className="version-pages-grid__status version-pages-grid__status--error">
                      <ImageOff className="version-pages-grid__status-icon" />
                      <span>{pagesError}</span>
                    </div>
                  )}

                  {!isLoadingPages &&
                    !pagesError &&
                    pageThumbs.length === 0 && (
                      <div className="version-pages-grid__status version-pages-grid__status--empty">
                        <ImageOff className="version-pages-grid__status-icon" />
                        <span>暂无页面预览</span>
                      </div>
                    )}

                  {!isLoadingPages && !pagesError && pageThumbs.length > 0 && (
                    <div className="version-pages-grid__inner">
                      {pageThumbs.map((thumb) => (
                        <button
                          key={`${version.id}-page-${thumb.index}`}
                          type="button"
                          className="version-pages-grid__item"
                          onClick={() => handleThumbnailActivate(thumb.index)}
                          title={`打开第 ${thumb.index + 1} 页 ${thumb.name}`}
                        >
                          <div className="version-pages-grid__thumb">
                            <img
                              src={thumb.url}
                              alt={`第 ${thumb.index + 1} 页预览`}
                              loading="lazy"
                            />
                          </div>
                          <div className="version-pages-grid__label">
                            <span className="version-pages-grid__label-index">
                              {thumb.index + 1}
                            </span>
                            <span className="version-pages-grid__label-name">
                              {thumb.name}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="version-card__meta">
                <div className="version-card__meta-item">
                  {isWIP ? <Activity className="w-3 h-3" /> : diffIcon}
                  <span>{diffLabel}</span>
                </div>
                <div className="version-card__meta-item">
                  <Clock className="w-3 h-3" />
                  <span>{createdAtFull}</span>
                </div>
              </div>

              {!isWIP && (
                <div className="version-card__actions">
                  {shouldShowSubVersionButton && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() =>
                        onNavigateToSubVersions?.(version.semantic_version)
                      }
                      aria-label={`查看 ${subVersionCount} 个子版本`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      查看 {subVersionCount} 个子版本
                    </Button>
                  )}
                  {onQuickCompare && (
                    <Button size="sm" variant="ghost" onPress={onQuickCompare}>
                      <LayoutGrid className="w-3.5 h-3.5" />
                      快速对比
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="tertiary"
                    onPress={handleExport}
                    isDisabled={isExporting}
                    aria-label={`导出 ${versionLabel}`}
                  >
                    <Download className="w-3.5 h-3.5" />
                    导出
                  </Button>

                  {onRestore && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onPress={handleRestore}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      回滚
                    </Button>
                  )}
                </div>
              )}
            </div>
          </Disclosure.Content>
        </Disclosure>
      </Card.Content>
      <PageSVGViewer
        version={resolvedVersion}
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        defaultPageIndex={viewerInitialPage}
      />
    </Card.Root>
  );
}
