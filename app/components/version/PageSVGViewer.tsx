"use client";

/* eslint-disable @next/next/no-img-element */

import React, { type Key } from "react";
import {
  Button,
  Card,
  TooltipContent,
  TooltipRoot,
  Spinner,
  Select,
  ListBox,
} from "@heroui/react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  Maximize2,
  Minimize2,
} from "lucide-react";
import type { XMLVersion } from "@/app/lib/storage/types";
import { deserializeSVGsFromBlob } from "@/app/lib/svg-export-utils";
import { createBlobFromSource, type BinarySource } from "./version-utils";

interface PageSVGViewerProps {
  version: XMLVersion;
  isOpen: boolean;
  onClose: () => void;
  defaultPageIndex?: number;
}

interface PageState {
  id: string;
  name: string;
  index: number;
  svg: string;
}

interface Point {
  x: number;
  y: number;
}

export function PageSVGViewer({
  version,
  isOpen,
  onClose,
  defaultPageIndex = 0,
}: PageSVGViewerProps) {
  const [pages, setPages] = React.useState<PageState[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = React.useState(defaultPageIndex);
  const [scale, setScale] = React.useState(1);
  const [offset, setOffset] = React.useState<Point>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = React.useState(false);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const pointerStart = React.useRef<{ point: Point; offset: Point } | null>(
    null,
  );
  const imageNaturalSize = React.useRef<{
    width: number;
    height: number;
  } | null>(null);

  // 打开时加载 pages_svg
  React.useEffect(() => {
    if (!isOpen) {
      setPages(null);
      setError(null);
      setLoading(false);
      setScale(1);
      setOffset({ x: 0, y: 0 });
      setIsFullscreen(false);
      setIsPanning(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        if (!version.pages_svg) {
          throw new Error("该版本未包含多页 SVG 数据");
        }

        const blob = createBlobFromSource(
          version.pages_svg as BinarySource,
          "application/json",
        );

        if (!blob) {
          throw new Error("无法解析 pages_svg 数据");
        }

        const parsed = await deserializeSVGsFromBlob(blob);
        if (cancelled) return;

        const normalized = parsed
          .map((item, idx) => ({
            id: item.id ?? `page-${idx + 1}`,
            name: item.name ?? `Page ${idx + 1}`,
            index: typeof item.index === "number" ? item.index : idx,
            svg: item.svg,
          }))
          .sort((a, b) => a.index - b.index);

        if (!normalized.length) {
          throw new Error("多页 SVG 数据为空");
        }

        setPages(normalized);
        const safeIndex = Math.min(
          Math.max(defaultPageIndex, 0),
          normalized.length - 1,
        );
        setCurrentIndex(safeIndex);
        setScale(1);
        setOffset({ x: 0, y: 0 });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "加载多页 SVG 失败");
          setPages(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, version.id, version.pages_svg, defaultPageIndex]);

  const currentPage = React.useMemo(() => {
    if (!pages || pages.length === 0) return null;
    return pages[Math.min(Math.max(currentIndex, 0), pages.length - 1)];
  }, [pages, currentIndex]);

  const canPrev = currentIndex > 0;
  const canNext = pages ? currentIndex < pages.length - 1 : false;
  const isPannable = scale > 1.01;

  const handlePrev = React.useCallback(() => {
    if (!pages) return;
    setCurrentIndex((idx) => Math.max(0, idx - 1));
    setOffset({ x: 0, y: 0 });
  }, [pages]);

  const handleNext = React.useCallback(() => {
    if (!pages) return;
    setCurrentIndex((idx) => Math.min(pages.length - 1, Math.max(0, idx + 1)));
    setOffset({ x: 0, y: 0 });
  }, [pages]);

  const zoomIn = React.useCallback(() => {
    setScale((s) => Math.min(4, parseFloat((s + 0.2).toFixed(2))));
  }, []);

  const zoomOut = React.useCallback(() => {
    setScale((s) => Math.max(0.2, parseFloat((s - 0.2).toFixed(2))));
    setOffset((o) => ({ x: o.x * 0.8, y: o.y * 0.8 }));
  }, []);

  const resetView = React.useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const fitToStage = React.useCallback(() => {
    if (!stageRef.current || !currentPage || !imageNaturalSize.current) {
      resetView();
      return;
    }
    const { clientWidth, clientHeight } = stageRef.current;
    const { width, height } = imageNaturalSize.current;
    if (!width || !height) {
      resetView();
      return;
    }
    const scaleX = clientWidth / width;
    const scaleY = clientHeight / height;
    const best = Math.max(0.2, Math.min(scaleX, scaleY) * 0.98);
    setScale(parseFloat(best.toFixed(2)));
    setOffset({ x: 0, y: 0 });
  }, [currentPage, resetView]);

  const handleSelectPage = React.useCallback(
    (value: Key | null) => {
      if (!pages || !pages.length) return;
      if (value === null) return;
      const target = Number(value);
      if (Number.isNaN(target)) return;
      const clamped = Math.min(Math.max(target, 0), pages.length - 1);
      setCurrentIndex(clamped);
      setOffset({ x: 0, y: 0 });
    },
    [pages],
  );

  React.useEffect(() => {
    if (!isOpen) return;

    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        handlePrev();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        handleNext();
      } else if (event.key === "=" || event.key === "+") {
        event.preventDefault();
        zoomIn();
      } else if (event.key === "-") {
        event.preventDefault();
        zoomOut();
      } else if (event.key === "0") {
        event.preventDefault();
        resetView();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose, handlePrev, handleNext, zoomIn, zoomOut, resetView]);

  const handleExportCurrent = React.useCallback(() => {
    if (!currentPage) return;
    const blob = new Blob([currentPage.svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentPage.name || "page"}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [currentPage]);

  const handleExportAll = React.useCallback(() => {
    if (!pages || !pages.length) return;
    const blob = new Blob([JSON.stringify(pages)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `version-${version.semantic_version}-pages.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [pages, version.semantic_version]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isPannable) return;
    setIsPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerStart.current = {
      point: { x: event.clientX, y: event.clientY },
      offset,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning || !pointerStart.current) return;
    const dx = event.clientX - pointerStart.current.point.x;
    const dy = event.clientY - pointerStart.current.point.y;
    setOffset({
      x: pointerStart.current.offset.x + dx,
      y: pointerStart.current.offset.y + dy,
    });
  };

  const endPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsPanning(false);
    pointerStart.current = null;
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    if (event.deltaY < 0) {
      zoomIn();
    } else {
      zoomOut();
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen((prev) => !prev);
  };

  const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const target = event.currentTarget;
    imageNaturalSize.current = {
      width: target.naturalWidth,
      height: target.naturalHeight,
    };
  };

  React.useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className={`page-svg-viewer__overlay${isFullscreen ? " page-svg-viewer__overlay--fullscreen" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`多页面 SVG 查看器，版本 ${version.semantic_version}`}
      onClick={onClose}
    >
      <Card.Root
        className={`page-svg-viewer__container${isFullscreen ? " page-svg-viewer__container--fullscreen" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <Card.Header className="page-svg-viewer__header">
          <div className="page-svg-viewer__title">
            <span className="page-svg-viewer__heading">多页面查看器</span>
            <span className="page-svg-viewer__subtext">
              v{version.semantic_version} · {version.page_count} 页
            </span>
          </div>

          <div className="page-svg-viewer__header-actions">
            <Button
              size="sm"
              variant="ghost"
              isIconOnly
              aria-label="适应窗口"
              onPress={fitToStage}
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              isIconOnly
              aria-label={isFullscreen ? "退出全屏" : "进入全屏"}
              onPress={toggleFullscreen}
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              isIconOnly
              aria-label="关闭"
              onPress={onClose}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </Card.Header>

        <Card.Content className="page-svg-viewer__body">
          <div className="page-svg-viewer__toolbar">
            <div className="page-svg-viewer__nav">
              <Button
                size="sm"
                variant="secondary"
                onPress={handlePrev}
                isDisabled={!canPrev}
                aria-label="上一页"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="page-svg-viewer__counter" role="status">
                {pages ? currentIndex + 1 : 0} / {pages?.length ?? 0}
              </div>
              <Button
                size="sm"
                variant="secondary"
                onPress={handleNext}
                isDisabled={!canNext}
                aria-label="下一页"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            <div className="page-svg-viewer__meta">
              <TooltipRoot delay={0}>
                <span className="page-svg-viewer__page-name" role="text">
                  {currentPage?.name || "-"}
                </span>
                <TooltipContent placement="bottom">
                  <p>使用键盘左右方向键切换页面</p>
                </TooltipContent>
              </TooltipRoot>
              {pages && pages.length > 1 && (
                <Select
                  className="page-svg-viewer__select"
                  value={String(currentIndex)}
                  onChange={handleSelectPage}
                >
                  <Select.Trigger className="page-svg-viewer__select-trigger">
                    <Select.Value className="page-svg-viewer__select-value" />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Content className="page-svg-viewer__select-content">
                    <ListBox className="page-svg-viewer__select-list">
                      {pages.map((page) => (
                        <ListBox.Item
                          key={page.index}
                          id={String(page.index)}
                          textValue={page.name}
                          className="page-svg-viewer__select-item"
                        >
                          {page.index + 1}. {page.name}
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Content>
                </Select>
              )}
            </div>

            <div className="page-svg-viewer__actions">
              <Button size="sm" variant="ghost" onPress={zoomOut}>
                <ZoomOut className="w-4 h-4" />
                缩小
              </Button>
              <Button size="sm" variant="ghost" onPress={zoomIn}>
                <ZoomIn className="w-4 h-4" />
                放大
              </Button>
              <Button size="sm" variant="ghost" onPress={resetView}>
                重置
              </Button>
              <Button size="sm" variant="ghost" onPress={fitToStage}>
                适应
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onPress={handleExportCurrent}
                isDisabled={!currentPage}
              >
                <Download className="w-4 h-4" />
                导出当前页
              </Button>
              <Button
                size="sm"
                variant="tertiary"
                onPress={handleExportAll}
                isDisabled={!pages?.length}
              >
                导出所有页
              </Button>
            </div>
          </div>

          <div
            className={`page-svg-viewer__stage${isPannable ? " page-svg-viewer__stage--pannable" : ""}${isPanning ? " page-svg-viewer__stage--panning" : ""}`}
            ref={stageRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endPan}
            onPointerCancel={endPan}
            onWheel={handleWheel}
          >
            {loading && (
              <div className="page-svg-viewer__status">
                <Spinner size="sm" />
                <span>正在加载多页 SVG ...</span>
              </div>
            )}

            {!loading && error && (
              <div className="page-svg-viewer__status page-svg-viewer__status--error">
                <span>{error}</span>
              </div>
            )}

            {!loading && !error && currentPage && (
              <div
                className="page-svg-viewer__canvas"
                style={{
                  transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                  cursor: isPannable
                    ? isPanning
                      ? "grabbing"
                      : "grab"
                    : "default",
                }}
              >
                <img
                  src={`data:image/svg+xml;utf8,${encodeURIComponent(currentPage.svg)}`}
                  alt={currentPage.name}
                  onLoad={handleImageLoad}
                  draggable={false}
                  className="page-svg-viewer__image"
                />
              </div>
            )}
          </div>
        </Card.Content>

        <Card.Footer className="page-svg-viewer__footer">
          <div className="page-svg-viewer__hint">
            • 支持方向键切页、Ctrl/Cmd + 滚轮缩放 • 空格或回车点击预览可进入全屏
          </div>
        </Card.Footer>
      </Card.Root>
    </div>
  );
}
