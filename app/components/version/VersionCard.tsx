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

interface VersionCardProps {
  version: XMLVersion;
  isLatest?: boolean;
  onRestore?: (versionId: string) => void;
  defaultExpanded?: boolean;
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
  onRestore,
  defaultExpanded = false,
}: VersionCardProps) {
  const [isExporting, setIsExporting] = React.useState(false);
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [showAllPages, setShowAllPages] = React.useState(false);
  const [pageThumbs, setPageThumbs] = React.useState<PageThumbnail[]>([]);
  const [isLoadingPages, setIsLoadingPages] = React.useState(false);
  const [pagesError, setPagesError] = React.useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = React.useState(false);
  const [viewerInitialPage, setViewerInitialPage] = React.useState(0);
  const pageObjectUrlsRef = React.useRef<string[]>([]);
  const { getXMLVersion } = useStorageXMLVersions();

  const versionLabel = `v${version.semantic_version}`;
  const diffLabel = version.is_keyframe
    ? "关键帧快照"
    : `Diff 链 +${version.diff_chain_depth}`;
  const diffIcon = version.is_keyframe ? (
    <Key className="w-3.5 h-3.5" />
  ) : (
    <GitBranch className="w-3.5 h-3.5" />
  );

  const pageNames = React.useMemo(
    () => parsePageNames(version.page_names),
    [version.page_names],
  );

  const hasMultiplePages = (version.page_count ?? 0) > 1;

  const openViewer = React.useCallback((pageIndex: number) => {
    setViewerInitialPage(Math.max(0, pageIndex));
    setViewerOpen(true);
  }, []);

  const handlePreviewActivate = React.useCallback(() => {
    if (!hasMultiplePages) return;
    openViewer(0);
  }, [hasMultiplePages, openViewer]);

  const handleThumbnailActivate = React.useCallback(
    (pageIndex: number) => {
      openViewer(pageIndex);
    },
    [openViewer],
  );

  // 格式化创建时间
  const createdAt = new Date(version.created_at).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  // 管理 preview_svg 的 Object URL
  React.useEffect(() => {
    const blob = createBlobFromSource(
      version.preview_svg as BinarySource,
      "image/svg+xml",
    );

    if (!blob) {
      setPreviewUrl(null);
      return () => undefined;
    }

    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [version.id, version.preview_svg]);

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

    if (!version.pages_svg) {
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
          version.pages_svg as BinarySource,
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
  }, [cleanupPageUrls, showAllPages, version.id, version.pages_svg]);

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
        getXMLVersion(id),
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
      className={`version-card${isLatest ? " version-card--latest" : ""}${isExpanded ? " version-card--expanded" : " version-card--collapsed"}`}
      variant="secondary"
    >
      <Card.Content className="version-card__content">
        <Disclosure isExpanded={isExpanded} onExpandedChange={setIsExpanded}>
          {/* 折叠状态的紧凑视图 - 始终显示 */}
          <Disclosure.Heading>
            <button
              type="button"
              className="version-card__trigger"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              <div className="version-card__compact-view">
                <div className="version-card__compact-left">
                  <span className="version-number">{versionLabel}</span>
                  {isLatest && <span className="latest-badge">最新</span>}
                  {version.is_keyframe ? (
                    <span className="keyframe-badge">
                      <Key className="w-2.5 h-2.5" />
                      关键帧
                    </span>
                  ) : (
                    <span className="diff-badge">
                      <GitBranch className="w-2.5 h-2.5" />
                      Diff +{version.diff_chain_depth}
                    </span>
                  )}
                </div>
                <div className="version-card__compact-right">
                  <span className="version-card__time">
                    <Clock className="w-3 h-3" />
                    {createdAt}
                  </span>
                  <ChevronDown
                    className={`version-card__chevron${isExpanded ? " rotated" : ""}`}
                  />
                </div>
              </div>
            </button>
          </Disclosure.Heading>

          {/* 展开状态的完整内容 */}
          <Disclosure.Content>
            <div className="version-card__expanded-content">
              {version.name && version.name !== version.semantic_version && (
                <h4 className="version-card__name">{version.name}</h4>
              )}

              {version.description && (
                <p className="version-card__description">
                  {version.description}
                </p>
              )}

              <div className="version-card__media">
                {previewUrl ? (
                  <div
                    className={`version-preview${hasMultiplePages ? " version-preview--interactive" : ""}`}
                    role={hasMultiplePages ? "button" : undefined}
                    tabIndex={hasMultiplePages ? 0 : undefined}
                    aria-label={
                      hasMultiplePages
                        ? `打开多页 SVG 查看器，当前共 ${version.page_count} 页`
                        : undefined
                    }
                    onClick={
                      hasMultiplePages ? handlePreviewActivate : undefined
                    }
                    onKeyDown={
                      hasMultiplePages
                        ? (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              handlePreviewActivate();
                            }
                          }
                        : undefined
                    }
                  >
                    <img
                      src={previewUrl}
                      alt={`${versionLabel} 预览图`}
                      className="version-preview__image"
                      loading="lazy"
                    />
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
                  {diffIcon}
                  <span>{diffLabel}</span>
                </div>
                <div className="version-card__meta-item">
                  <Clock className="w-3 h-3" />
                  <span>{createdAt}</span>
                </div>
              </div>

              <div className="version-card__actions">
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
                  <Button size="sm" variant="secondary" onPress={handleRestore}>
                    <RotateCcw className="w-3.5 h-3.5" />
                    回滚
                  </Button>
                )}
              </div>
            </div>
          </Disclosure.Content>
        </Disclosure>
      </Card.Content>
      <PageSVGViewer
        version={version}
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        defaultPageIndex={viewerInitialPage}
      />
    </Card.Root>
  );
}
