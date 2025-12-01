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
import type { Selection } from "react-aria-components";
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
import { useStorageXMLVersions } from "@/app/hooks/useStorageXMLVersions";
import { useAppTranslation } from "@/app/i18n/hooks";

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

const extractSingleKey = (keys: Selection): string | null => {
  if (keys === "all") return null;
  const keyArray = [...keys];
  if (!keyArray.length) return null;
  const first = keyArray[0];
  if (typeof first === "number" || typeof first === "bigint") {
    return String(first);
  }
  return first as string;
};

const normalizeSelection = (keys: Selection | Key | null): Selection | null => {
  if (keys === null) return null;
  if (keys === "all") return "all";
  if (
    typeof keys === "string" ||
    typeof keys === "number" ||
    typeof keys === "bigint"
  ) {
    return new Set([keys]) as Selection;
  }
  return keys;
};

export function PageSVGViewer({
  version,
  isOpen,
  onClose,
  defaultPageIndex = 0,
}: PageSVGViewerProps) {
  const { t: tVersion } = useAppTranslation("version");
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
  const { loadVersionSVGFields } = useStorageXMLVersions();
  const [resolvedVersion, setResolvedVersion] =
    React.useState<XMLVersion>(version);

  React.useEffect(() => {
    if (!isOpen) {
      setPages(null);
      setError(null);
      setLoading(false);
      setScale(1);
      setOffset({ x: 0, y: 0 });
      setIsFullscreen(false);
      setIsPanning(false);
      setResolvedVersion(version);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setPages(null);
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setIsPanning(false);
    setResolvedVersion(version);

    (async () => {
      try {
        let targetVersion = version;

        if (!version.pages_svg) {
          try {
            const enriched = await loadVersionSVGFields(version);
            if (cancelled) return;
            targetVersion = enriched;
          } catch (err) {
            if (!cancelled) {
              console.warn("加载 PageSVG 数据失败", err);
              throw new Error(tVersion("viewer.error"));
            }
          }
        }

        if (!targetVersion.pages_svg) {
          throw new Error(tVersion("viewer.error"));
        }

        if (cancelled) return;
        setResolvedVersion(targetVersion);

        const blob = createBlobFromSource(
          targetVersion.pages_svg as BinarySource,
          "application/json",
        );

        if (!blob) {
          throw new Error(tVersion("viewer.error"));
        }

        const parsed = await deserializeSVGsFromBlob(blob);
        if (cancelled) return;

        const totalPages = parsed.length;

        const normalized = parsed
          .map((item, idx) => ({
            id: item.id ?? `page-${idx + 1}`,
            name:
              item.name ??
              tVersion("viewer.nav.current", {
                current: idx + 1,
                total: totalPages,
              }),
            index: typeof item.index === "number" ? item.index : idx,
            svg: item.svg,
          }))
          .sort((a, b) => a.index - b.index);

        if (!normalized.length) {
          throw new Error(tVersion("viewer.error"));
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
          setError(
            err instanceof Error ? err.message : tVersion("viewer.error"),
          );
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
  }, [isOpen, version, defaultPageIndex, loadVersionSVGFields, tVersion]);

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
    (keys: Selection) => {
      if (!pages || !pages.length) return;
      const key = extractSingleKey(keys);
      if (key === null) return;
      const target = Number(key);
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
    a.download = `version-${resolvedVersion.semantic_version}-pages.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [pages, resolvedVersion.semantic_version]);

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
      aria-label={tVersion("aria.viewer.root", {
        version: version.semantic_version,
      })}
      onClick={onClose}
    >
      <Card.Root
        className={`page-svg-viewer__container${isFullscreen ? " page-svg-viewer__container--fullscreen" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <Card.Header className="page-svg-viewer__header">
          <div className="page-svg-viewer__title">
            <span className="page-svg-viewer__heading">
              {tVersion("viewer.title")}
            </span>
            <span className="page-svg-viewer__subtext">
              {tVersion("viewer.versionSummary", {
                version: version.semantic_version,
                count: version.page_count,
              })}
            </span>
          </div>

          <div className="page-svg-viewer__header-actions">
            <Button
              size="sm"
              variant="ghost"
              isIconOnly
              aria-label={tVersion("aria.viewer.fit")}
              onPress={fitToStage}
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              isIconOnly
              aria-label={
                isFullscreen
                  ? tVersion("aria.viewer.fullscreenExit")
                  : tVersion("aria.viewer.fullscreenEnter")
              }
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
              aria-label={tVersion("aria.viewer.close")}
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
                aria-label={tVersion("aria.viewer.previous")}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="page-svg-viewer__counter" role="status">
                {pages
                  ? tVersion("viewer.nav.current", {
                      current: currentIndex + 1,
                      total: pages.length,
                    })
                  : tVersion("viewer.nav.current", { current: 0, total: 0 })}
              </div>
              <Button
                size="sm"
                variant="secondary"
                onPress={handleNext}
                isDisabled={!canNext}
                aria-label={tVersion("aria.viewer.next")}
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
                  <p>{tVersion("viewer.nav.hint")}</p>
                </TooltipContent>
              </TooltipRoot>
              {pages && pages.length > 1 && (
                <Select
                  className="page-svg-viewer__select"
                  selectedKey={String(currentIndex)}
                  onSelectionChange={(keys) => {
                    const selection = normalizeSelection(keys);
                    if (!selection) return;
                    handleSelectPage(selection);
                  }}
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
                {tVersion("viewer.zoom.out")}
              </Button>
              <Button size="sm" variant="ghost" onPress={zoomIn}>
                <ZoomIn className="w-4 h-4" />
                {tVersion("viewer.zoom.in")}
              </Button>
              <Button size="sm" variant="ghost" onPress={resetView}>
                {tVersion("viewer.zoom.reset")}
              </Button>
              <Button size="sm" variant="ghost" onPress={fitToStage}>
                {tVersion("viewer.zoom.fit")}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onPress={handleExportCurrent}
                isDisabled={!currentPage}
              >
                <Download className="w-4 h-4" />
                {tVersion("viewer.export.current")}
              </Button>
              <Button
                size="sm"
                variant="tertiary"
                onPress={handleExportAll}
                isDisabled={!pages?.length}
              >
                {tVersion("viewer.export.all")}
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
                <span>{tVersion("viewer.loading")}</span>
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
          <div className="page-svg-viewer__hint">{tVersion("viewer.help")}</div>
        </Card.Footer>
      </Card.Root>
    </div>
  );
}
