"use client";

/* eslint-disable @next/next/no-img-element */

import React, { type Key } from "react";
import { createPortal } from "react-dom";
import {
  Button,
  Card,
  Label,
  ListBox,
  Select,
  Spinner,
  TooltipContent,
  TooltipRoot,
} from "@heroui/react";
import type { Selection } from "react-aria-components";
import {
  AlertTriangle,
  ArrowLeftRight,
  Columns,
  Loader2,
  RotateCcw,
  Rows,
  Sparkles,
  SplitSquareHorizontal,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { XMLVersion } from "@/app/lib/storage/types";
import { deserializeSVGsFromBlob } from "@/app/lib/svg-export-utils";
import { createBlobFromSource, type BinarySource } from "./version-utils";
import {
  generateSmartDiffSvg,
  type SmartDiffResult,
} from "@/app/lib/svg-smart-diff";
import { useStorageXMLVersions } from "@/app/hooks/useStorageXMLVersions";
import { formatVersionTimestamp } from "@/app/lib/format-utils";
import { useAppTranslation } from "@/app/i18n/hooks";

interface VersionCompareProps {
  versionA: XMLVersion;
  versionB: XMLVersion;
  versions: XMLVersion[];
  isOpen: boolean;
  onClose: () => void;
}

interface PageRenderState {
  id: string;
  name: string;
  index: number;
  svg: string;
}

interface PagePair {
  index: number;
  name: string;
  left?: PageRenderState;
  right?: PageRenderState;
  smartDiff?: SmartDiffResult;
}

type CompareLayout = "split" | "stack" | "overlay" | "smart";

const MIN_SCALE = 0.3;
const MAX_SCALE = 4;
const SCALE_STEP = 0.2;

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

function formatVersionMeta(version: XMLVersion, locale: string) {
  return `${version.semantic_version} · ${formatVersionTimestamp(
    version.created_at,
    "full",
    locale,
  )}`;
}

function formatVersionLabel(version: XMLVersion, locale: string) {
  return `${version.semantic_version} (${formatVersionTimestamp(
    version.created_at,
    "compact",
    locale,
  )})`;
}

function createSvgUrl(svg?: string) {
  if (!svg) return null;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function VersionCompare({
  versionA: initialVersionA,
  versionB: initialVersionB,
  versions,
  isOpen,
  onClose,
}: VersionCompareProps) {
  const { t: tVersion, i18n } = useAppTranslation("version");
  const [isPortalReady, setIsPortalReady] = React.useState(false);
  const [currentVersionA, setCurrentVersionA] =
    React.useState<XMLVersion>(initialVersionA);
  const [currentVersionB, setCurrentVersionB] =
    React.useState<XMLVersion>(initialVersionB);
  const [pagePairs, setPagePairs] = React.useState<PagePair[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [warning, setWarning] = React.useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [scale, setScale] = React.useState(1);
  const [layout, setLayout] = React.useState<CompareLayout>("split");
  const [overlayOpacity, setOverlayOpacity] = React.useState(0.55);
  const [isPanning, setIsPanning] = React.useState(false);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const pointerStart = React.useRef<{
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const { loadVersionSVGFields } = useStorageXMLVersions();

  React.useEffect(() => {
    setIsPortalReady(true);
    return () => setIsPortalReady(false);
  }, []);

  // 当 props 中的版本变化时，重置内部状态
  React.useEffect(() => {
    setCurrentVersionA(initialVersionA);
    setCurrentVersionB(initialVersionB);
  }, [initialVersionA, initialVersionB]);

  const currentPair = React.useMemo(() => {
    if (!pagePairs.length) return null;
    const safeIndex = Math.min(Math.max(currentIndex, 0), pagePairs.length - 1);
    return pagePairs[safeIndex];
  }, [currentIndex, pagePairs]);

  // 自适应布局：小屏默认上下堆叠
  React.useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 960) {
        setLayout((prev) => (prev === "overlay" ? prev : "stack"));
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 打开时加载 pages_svg 数据
  React.useEffect(() => {
    if (!isOpen) {
      setPagePairs([]);
      setError(null);
      setWarning(null);
      setScale(1);
      setOffset({ x: 0, y: 0 });
      setCurrentIndex(0);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const loadPages = async (
          version: XMLVersion,
        ): Promise<{ pages: PageRenderState[]; hasPagesSvg: boolean }> => {
          let working = version;
          let hasPagesSvg = Boolean(working.pages_svg);
          if (!hasPagesSvg) {
            working = await loadVersionSVGFields(version);
            hasPagesSvg = Boolean(working.pages_svg);
          }

          if (!working.pages_svg) {
            return { pages: [], hasPagesSvg: false };
          }

          const blob = createBlobFromSource(
            working.pages_svg as BinarySource,
            "application/json",
          );
          if (!blob) {
            return { pages: [], hasPagesSvg };
          }
          const parsed = await deserializeSVGsFromBlob(blob);
          const pages = parsed
            .map((item, idx) => ({
              id: item.id ?? `page-${idx + 1}`,
              name:
                typeof item.name === "string" && item.name.trim().length > 0
                  ? item.name
                  : tVersion("compare.pages.indicator", {
                      version: "",
                      count: idx + 1,
                    }),
              index: typeof item.index === "number" ? item.index : idx,
              svg: item.svg,
            }))
            .sort((a, b) => a.index - b.index);
          return { pages, hasPagesSvg };
        };

        const [resultA, resultB] = await Promise.all([
          loadPages(currentVersionA),
          loadPages(currentVersionB),
        ]);
        const pagesA = resultA.pages;
        const pagesB = resultB.pages;

        if (cancelled) return;

        if (!pagesA.length && !pagesB.length) {
          throw new Error(tVersion("compare.errors.missingPagesBoth"));
        }

        const indexSet = new Set<number>();
        pagesA.forEach((page) => indexSet.add(page.index));
        pagesB.forEach((page) => indexSet.add(page.index));
        const indexes = Array.from(indexSet).sort((a, b) => a - b);

        const pairs: PagePair[] = indexes.map((pageIndex) => {
          const leftPage = pagesA.find((page) => page.index === pageIndex);
          const rightPage = pagesB.find((page) => page.index === pageIndex);
          const name =
            leftPage?.name ??
            rightPage?.name ??
            tVersion("compare.pages.indicator", {
              version: "",
              count: pageIndex + 1,
            });
          return {
            index: pageIndex,
            name,
            left: leftPage,
            right: rightPage,
          };
        });

        const warnings: string[] = [];
        if (!resultA.hasPagesSvg) {
          warnings.push(tVersion("compare.errors.missingPagesA"));
        }
        if (!resultB.hasPagesSvg) {
          warnings.push(tVersion("compare.errors.missingPagesB"));
        }
        if (pagesA.length !== pagesB.length) {
          warnings.push(
            tVersion("compare.errors.pageCountMismatch", {
              countA: pagesA.length,
              countB: pagesB.length,
            }),
          );
        } else {
          const mismatch = pagesA.findIndex(
            (page, idx) => page.name !== pagesB[idx]?.name,
          );
          if (mismatch >= 0) {
            warnings.push(tVersion("compare.errors.pageNameMismatch"));
          }
        }

        setWarning(warnings.length ? warnings.join(" · ") : null);

        if (pairs.length === 0) {
          throw new Error(tVersion("compare.errors.noParsedPages"));
        }

        const pairsWithDiff = pairs.map((pair) => ({
          ...pair,
          smartDiff: generateSmartDiffSvg(pair.left?.svg, pair.right?.svg),
        }));
        setPagePairs(pairsWithDiff);
        setCurrentIndex(0);
        setOffset({ x: 0, y: 0 });
      } catch (err) {
        console.error("加载版本对比失败", err);
        setError(
          err instanceof Error ? err.message : tVersion("compare.status.error"),
        );
        setPagePairs([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    currentVersionA,
    currentVersionB,
    loadVersionSVGFields,
    tVersion,
  ]);

  const currentName = React.useMemo(() => {
    if (!currentPair) return "-";
    return currentPair.name;
  }, [currentPair]);

  const zoomIn = React.useCallback(() => {
    setScale((prev) =>
      Math.min(MAX_SCALE, parseFloat((prev + SCALE_STEP).toFixed(2))),
    );
  }, []);

  const zoomOut = React.useCallback(() => {
    setScale((prev) =>
      Math.max(MIN_SCALE, parseFloat((prev - SCALE_STEP).toFixed(2))),
    );
  }, []);

  const resetView = React.useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const handleWheel = React.useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (event.deltaY < 0) {
        zoomIn();
      } else {
        zoomOut();
      }
    },
    [zoomIn, zoomOut],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    setIsPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerStart.current = {
      x: event.clientX,
      y: event.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning || !pointerStart.current) return;
    const dx = event.clientX - pointerStart.current.x;
    const dy = event.clientY - pointerStart.current.y;
    setOffset({
      x: pointerStart.current.offsetX + dx,
      y: pointerStart.current.offsetY + dy,
    });
  };

  const stopPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsPanning(false);
    pointerStart.current = null;
  };

  const handleSelectPage = (keys: Selection) => {
    const key = extractSingleKey(keys);
    if (key === null) return;
    const nextIndex = Number(key);
    if (Number.isNaN(nextIndex)) return;
    setCurrentIndex(Math.min(Math.max(nextIndex, 0), pagePairs.length - 1));
    setOffset({ x: 0, y: 0 });
  };

  const changeLayout = (next: CompareLayout) => {
    setLayout(next);
    setOffset({ x: 0, y: 0 });
    if (next === "smart") {
      setScale(1);
    }
  };

  // 处理版本选择
  const handleVersionChange = (target: "A" | "B", keys: Selection) => {
    const versionId = extractSingleKey(keys);
    if (versionId === null) return;
    const selectedVersion = versions.find((v) => v.id === String(versionId));
    if (!selectedVersion) return;

    if (target === "A") {
      setCurrentVersionA(selectedVersion);
    } else {
      setCurrentVersionB(selectedVersion);
    }

    // 重置视图状态
    setOffset({ x: 0, y: 0 });
    setCurrentIndex(0);
  };

  // 交换版本 A 和版本 B
  const handleSwapVersions = () => {
    const tempA = currentVersionA;
    setCurrentVersionA(currentVersionB);
    setCurrentVersionB(tempA);
    // 重置视图状态
    setOffset({ x: 0, y: 0 });
    setCurrentIndex(0);
  };

  // 键盘操作
  React.useEffect(() => {
    if (!isOpen) return undefined;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      } else if (event.key === "ArrowLeft") {
        setCurrentIndex((prev) => Math.max(0, prev - 1));
      } else if (event.key === "ArrowRight") {
        setCurrentIndex((prev) => Math.min(pagePairs.length - 1, prev + 1));
      } else if (event.key === "=" || event.key === "+") {
        zoomIn();
      } else if (event.key === "-" || event.key === "_") {
        zoomOut();
      } else if (event.key === "0") {
        resetView();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose, pagePairs.length, resetView, zoomIn, zoomOut]);

  React.useEffect(() => {
    if (!isOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen, tVersion]);

  const currentSmartStats = currentPair?.smartDiff?.stats;
  const currentSmartWarnings = currentPair?.smartDiff?.warnings ?? [];
  const smartDiffCoverageLabel = currentSmartStats
    ? `${Math.round(currentSmartStats.coverage * 1000) / 10}%`
    : null;
  const smartDiffImageSrc =
    layout === "smart" && currentPair?.smartDiff?.svg
      ? createSvgUrl(currentPair.smartDiff.svg)
      : null;

  if (!isOpen || !isPortalReady) return null;

  return createPortal(
    <div
      className="version-compare__overlay"
      role="dialog"
      aria-modal="true"
      aria-label={tVersion("aria.compare.dialog", {
        versionA: formatVersionMeta(currentVersionA, i18n.language),
        versionB: formatVersionMeta(currentVersionB, i18n.language),
      })}
      onClick={onClose}
    >
      <Card.Root
        className="version-compare__container"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 - 独立定位在右上角 */}
        <Button
          className="version-compare__close-button"
          variant="ghost"
          isIconOnly
          aria-label={tVersion("aria.compare.close")}
          onPress={onClose}
        >
          <X className="w-4 h-4" />
        </Button>

        <Card.Header className="version-compare__header">
          {/* 版本 A 选择器 */}
          <Select
            selectedKey={currentVersionA.id}
            onSelectionChange={(keys) => {
              const selection = normalizeSelection(keys);
              if (!selection) return;
              handleVersionChange("A", selection);
            }}
            className="version-compare__version-select"
          >
            <Label>{tVersion("compare.selectors.left")}</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Content>
              <ListBox>
                {versions.map((v) => (
                  <ListBox.Item
                    key={v.id}
                    id={v.id}
                    textValue={formatVersionLabel(v, i18n.language)}
                  >
                    {formatVersionLabel(v, i18n.language)}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Content>
          </Select>

          {/* 交换按钮 */}
          <Button
            variant="ghost"
            isIconOnly
            onPress={handleSwapVersions}
            aria-label={tVersion("aria.compare.swap")}
            className="version-compare__swap-button"
          >
            <ArrowLeftRight className="w-5 h-5" />
          </Button>

          {/* 版本 B 选择器 */}
          <Select
            selectedKey={currentVersionB.id}
            onSelectionChange={(keys) => {
              const selection = normalizeSelection(keys);
              if (!selection) return;
              handleVersionChange("B", selection);
            }}
            className="version-compare__version-select"
          >
            <Label>{tVersion("compare.selectors.right")}</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Content>
              <ListBox>
                {versions.map((v) => (
                  <ListBox.Item
                    key={v.id}
                    id={v.id}
                    textValue={formatVersionLabel(v, i18n.language)}
                  >
                    {formatVersionLabel(v, i18n.language)}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Content>
          </Select>
        </Card.Header>

        {warning && (
          <div className="version-compare__warning">
            <AlertTriangle className="w-4 h-4" />
            <span>{warning}</span>
          </div>
        )}

        <Card.Content className="version-compare__body">
          <div className="version-compare__toolbar">
            <div className="version-compare__toolbar-group">
              <Button
                size="sm"
                variant="ghost"
                onPress={zoomOut}
                isDisabled={scale <= MIN_SCALE}
              >
                <ZoomOut className="w-4 h-4" />
                {tVersion("compare.zoom.out")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onPress={zoomIn}
                isDisabled={scale >= MAX_SCALE}
              >
                <ZoomIn className="w-4 h-4" />
                {tVersion("compare.zoom.in")}
              </Button>
              <Button size="sm" variant="ghost" onPress={resetView}>
                <RotateCcw className="w-4 h-4" />
                {tVersion("compare.zoom.reset")}
              </Button>
              <span className="version-compare__scale">
                {Math.round(scale * 100)}%
              </span>
            </div>

            <div className="version-compare__toolbar-group">
              <Button
                size="sm"
                variant={layout === "split" ? "primary" : "ghost"}
                onPress={() => changeLayout("split")}
              >
                <Columns className="w-4 h-4" />{" "}
                {tVersion("compare.layout.split")}
              </Button>
              <Button
                size="sm"
                variant={layout === "stack" ? "primary" : "ghost"}
                onPress={() => changeLayout("stack")}
              >
                <Rows className="w-4 h-4" /> {tVersion("compare.layout.stack")}
              </Button>
              <Button
                size="sm"
                variant={layout === "overlay" ? "primary" : "ghost"}
                onPress={() => changeLayout("overlay")}
              >
                <SplitSquareHorizontal className="w-4 h-4" />{" "}
                {tVersion("compare.layout.overlay")}
              </Button>
              <Button
                size="sm"
                variant={layout === "smart" ? "primary" : "ghost"}
                onPress={() => changeLayout("smart")}
              >
                <Sparkles className="w-4 h-4" />{" "}
                {tVersion("compare.layout.smart")}
              </Button>
            </div>

            {layout === "overlay" && (
              <div className="version-compare__overlay-slider">
                <label htmlFor="overlayOpacity">
                  {tVersion("compare.layout.overlayOpacity")}
                </label>
                <input
                  id="overlayOpacity"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={overlayOpacity}
                  onChange={(event) =>
                    setOverlayOpacity(parseFloat(event.target.value))
                  }
                />
              </div>
            )}
          </div>

          <div className="version-compare__stage">
            {loading && (
              <div className="version-compare__loading">
                <Spinner size="sm" />
                <span>{tVersion("compare.status.loading")}</span>
              </div>
            )}

            {!loading && error && (
              <div className="version-compare__error">
                <AlertTriangle className="w-5 h-5" />
                <p>{error}</p>
              </div>
            )}

            {!loading && !error && currentPair && (
              <div
                className={`version-compare__canvas version-compare__canvas--${layout}${isPanning ? " version-compare__canvas--panning" : ""}`}
                style={
                  layout === "smart"
                    ? undefined
                    : {
                        transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                      }
                }
                {...(layout === "smart"
                  ? {}
                  : {
                      onPointerDown: handlePointerDown,
                      onPointerMove: handlePointerMove,
                      onPointerUp: stopPan,
                      onPointerLeave: stopPan,
                      onPointerCancel: stopPan,
                      onWheel: handleWheel,
                    })}
              >
                {layout === "split" && (
                  <>
                    <div className="version-compare__panel">
                      {currentPair.left ? (
                        <img
                          src={createSvgUrl(currentPair.left.svg) || undefined}
                          alt={currentPair.left.name}
                          className="version-compare__image"
                          draggable={false}
                        />
                      ) : (
                        <div className="version-compare__placeholder">
                          <Loader2 className="w-5 h-5" />
                          <span>{tVersion("compare.pageStatus.missingA")}</span>
                        </div>
                      )}
                    </div>
                    <div className="version-compare__panel">
                      {currentPair.right ? (
                        <img
                          src={createSvgUrl(currentPair.right.svg) || undefined}
                          alt={currentPair.right.name}
                          className="version-compare__image"
                          draggable={false}
                        />
                      ) : (
                        <div className="version-compare__placeholder">
                          <Loader2 className="w-5 h-5" />
                          <span>{tVersion("compare.pageStatus.missingB")}</span>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {layout === "stack" && (
                  <>
                    <div className="version-compare__panel version-compare__panel--stack">
                      {currentPair.left ? (
                        <img
                          src={createSvgUrl(currentPair.left.svg) || undefined}
                          alt={currentPair.left.name}
                          className="version-compare__image"
                          draggable={false}
                        />
                      ) : (
                        <div className="version-compare__placeholder">
                          <Loader2 className="w-5 h-5" />
                          <span>{tVersion("compare.pageStatus.missingA")}</span>
                        </div>
                      )}
                    </div>
                    <div className="version-compare__panel version-compare__panel--stack">
                      {currentPair.right ? (
                        <img
                          src={createSvgUrl(currentPair.right.svg) || undefined}
                          alt={currentPair.right.name}
                          className="version-compare__image"
                          draggable={false}
                        />
                      ) : (
                        <div className="version-compare__placeholder">
                          <Loader2 className="w-5 h-5" />
                          <span>{tVersion("compare.pageStatus.missingB")}</span>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {layout === "overlay" && (
                  <div className="version-compare__panel version-compare__panel--overlay">
                    {currentPair.left && (
                      <img
                        src={createSvgUrl(currentPair.left.svg) || undefined}
                        alt={`${tVersion("compare.selectors.left")} · ${currentPair.left.name}`}
                        className="version-compare__image version-compare__image--overlay"
                        draggable={false}
                      />
                    )}
                    {currentPair.right && (
                      <img
                        src={createSvgUrl(currentPair.right.svg) || undefined}
                        alt={`${tVersion("compare.selectors.right")} · ${currentPair.right.name}`}
                        className="version-compare__image version-compare__image--overlay"
                        style={{ opacity: overlayOpacity }}
                        draggable={false}
                      />
                    )}
                    {!currentPair.left && (
                      <div className="version-compare__placeholder">
                        <Loader2 className="w-5 h-5" />
                        <span>{tVersion("compare.pageStatus.missingA")}</span>
                      </div>
                    )}
                    {!currentPair.right && (
                      <div className="version-compare__placeholder">
                        <Loader2 className="w-5 h-5" />
                        <span>{tVersion("compare.pageStatus.missingB")}</span>
                      </div>
                    )}
                  </div>
                )}

                {layout === "smart" && (
                  <div className="smart-diff__panel">
                    <div className="smart-diff__visual">
                      <div
                        className={`smart-diff__visual-inner${isPanning ? " smart-diff__visual-inner--panning" : ""}`}
                        style={{
                          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                        }}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={stopPan}
                        onPointerLeave={stopPan}
                        onPointerCancel={stopPan}
                        onWheel={handleWheel}
                      >
                        {smartDiffImageSrc ? (
                          <img
                            src={smartDiffImageSrc || undefined}
                            alt={tVersion("compare.diff.smartResultAlt")}
                            className="smart-diff__image"
                            draggable={false}
                          />
                        ) : (
                          <div className="version-compare__placeholder">
                            <Loader2 className="w-5 h-5" />
                            <span>{tVersion("compare.diff.empty")}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="smart-diff__insights">
                      <div className="smart-diff__insights-header">
                        <h3>{tVersion("compare.diff.statsTitle")}</h3>
                        {smartDiffCoverageLabel && (
                          <span className="smart-diff__coverage-value">
                            {tVersion("compare.diff.coverage", {
                              coverage: smartDiffCoverageLabel,
                            })}
                          </span>
                        )}
                      </div>
                      {currentSmartStats && (
                        <div className="smart-diff__progress">
                          <div className="smart-diff__progress-track">
                            <div
                              className="smart-diff__progress-value"
                              style={{
                                width: `${Math.max(
                                  0,
                                  Math.min(
                                    100,
                                    currentSmartStats.coverage * 100,
                                  ),
                                ).toFixed(1)}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}
                      <div className="smart-diff__stat-grid">
                        <div className="smart-diff__stat smart-diff__stat--match">
                          <span>{tVersion("compare.diff.matched")}</span>
                          <strong>{currentSmartStats?.matched ?? 0}</strong>
                        </div>
                        <div className="smart-diff__stat smart-diff__stat--changed">
                          <span>{tVersion("compare.diff.changed")}</span>
                          <strong>{currentSmartStats?.changed ?? 0}</strong>
                        </div>
                        <div className="smart-diff__stat smart-diff__stat--removed">
                          <span>{tVersion("compare.diff.onlyA")}</span>
                          <strong>{currentSmartStats?.onlyA ?? 0}</strong>
                        </div>
                        <div className="smart-diff__stat smart-diff__stat--added">
                          <span>{tVersion("compare.diff.onlyB")}</span>
                          <strong>{currentSmartStats?.onlyB ?? 0}</strong>
                        </div>
                      </div>

                      <div className="smart-diff__legend">
                        <div>
                          <span className="smart-diff__swatch smart-diff__swatch--match" />
                          {tVersion("compare.diff.legendAligned")}
                        </div>
                        <div>
                          <span className="smart-diff__swatch smart-diff__swatch--added" />
                          {tVersion("compare.diff.legendAddedB")}
                        </div>
                        <div>
                          <span className="smart-diff__swatch smart-diff__swatch--removed" />
                          {tVersion("compare.diff.legendOnlyA")}
                        </div>
                        <div>
                          <span className="smart-diff__swatch smart-diff__swatch--changed" />
                          {tVersion("compare.diff.legendChanged")}
                        </div>
                      </div>

                      {currentSmartWarnings.length > 0 && (
                        <div className="smart-diff__warnings">
                          <AlertTriangle className="w-4 h-4" />
                          <ul>
                            {currentSmartWarnings.map((msg, index) => (
                              <li key={`${msg}-${index}`}>{msg}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </Card.Content>

        <Card.Footer className="version-compare__footer">
          <div className="version-compare__page-meta">
            <TooltipRoot delay={0} closeDelay={0}>
              <span className="version-compare__page-name">{currentName}</span>
              <TooltipContent>
                {tVersion("compare.pages.shortcut")}
              </TooltipContent>
            </TooltipRoot>
            <span className="version-compare__counter">
              {pagePairs.length ? currentIndex + 1 : 0} / {pagePairs.length}
            </span>
          </div>

          <div className="version-compare__page-controls">
            <Button
              size="sm"
              variant="ghost"
              onPress={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              isDisabled={currentIndex <= 0}
            >
              {tVersion("compare.pages.previous")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onPress={() =>
                setCurrentIndex((prev) =>
                  Math.min(pagePairs.length - 1, prev + 1),
                )
              }
              isDisabled={currentIndex >= pagePairs.length - 1}
            >
              {tVersion("compare.pages.next")}
            </Button>

            <Select
              aria-label={tVersion("aria.compare.pageSelect")}
              className="version-compare__select"
              selectedKey={String(currentIndex)}
              onSelectionChange={(keys) => {
                const selection = normalizeSelection(keys);
                if (!selection) return;
                handleSelectPage(selection);
              }}
              isDisabled={!pagePairs.length}
            >
              <Select.Trigger className="version-compare__select-trigger">
                <Select.Value className="version-compare__select-value" />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Content className="version-compare__select-content">
                <ListBox className="version-compare__select-list">
                  {pagePairs.map((pair, index) => (
                    <ListBox.Item
                      key={pair.index}
                      id={String(index)}
                      textValue={pair.name}
                      className="version-compare__select-item"
                    >
                      {index + 1}. {pair.name}
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Content>
            </Select>
          </div>

          <div className="version-compare__summary">
            <p>
              {currentVersionA.semantic_version} vs{" "}
              {currentVersionB.semantic_version} ·{" "}
              {tVersion("compare.pages.indicator", {
                version: "",
                count: pagePairs.length,
              })}
            </p>
            <div className="version-compare__summary-pills">
              {layout === "smart" && currentSmartStats && (
                <span className="version-compare__pill version-compare__pill--smart">
                  {tVersion("compare.diff.coverageShort", {
                    coverage: smartDiffCoverageLabel ?? "",
                  })}
                </span>
              )}
              {warning && (
                <span className="version-compare__pill">{warning}</span>
              )}
            </div>
          </div>

          <Button variant="secondary" onPress={onClose}>
            {tVersion("compare.close")}
          </Button>
        </Card.Footer>
      </Card.Root>
    </div>,
    document.body,
  );
}
