"use client";

import {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Spinner } from "@heroui/react";
import { DrawioSelectionInfo } from "../types/drawio-tools";
import { debounce } from "@/app/lib/utils";
import { useAppTranslation } from "@/app/i18n/hooks";
import { createLogger } from "@/lib/logger";

const logger = createLogger("DrawioEditorNative");

type DrawioExportFormat = "xml" | "svg";

// SVG 导出选项（根据 DrawIO 官方文档）
export interface SVGExportOptions {
  embedImages?: boolean; // 是否嵌入图片（默认 false，减小文件大小）
  scale?: number; // 缩放比例（默认 1）
  border?: number; // 边框大小（像素，默认 10）
  background?: string; // 背景颜色（默认 #FFFFFF）
}

type PendingExportEntry = {
  resolve: (payload: string) => void;
  timeout: ReturnType<typeof setTimeout>;
};

const EXPORT_TIMEOUT_MS = 20000;

// 暴露给父组件的 ref 接口
export interface DrawioEditorRef {
  loadDiagram: (xml: string) => Promise<void>;
  mergeDiagram: (xml: string, requestId?: string) => void;
  exportDiagram: () => Promise<string>;
  exportSVG: (options?: SVGExportOptions) => Promise<string>;
}

interface DrawioEditorNativeProps {
  initialXml?: string;
  onSave?: (xml: string) => void;
  onSelectionChange?: (info: DrawioSelectionInfo) => void;
  forceReload?: boolean; // 强制完全重载（用于用户手动加载文件等场景）
}

// 从 iframe 接收的原始 DrawIO cell 数据类型
interface RawDrawioCell {
  id?: string;
  type?: string;
  value?: unknown;
  style?: string;
  label?: string;
  geometry?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
}

// 解码 data URI 格式的 base64 内容
// 支持 data:image/svg+xml;base64,... 等格式
// 用于处理 DrawIO export 返回的 data URI（如 SVG 导出）
function decodeBase64DataURI(dataUri: string): string {
  const prefix = "data:image/svg+xml;base64,";

  if (dataUri.startsWith(prefix)) {
    try {
      const base64Content = dataUri.substring(prefix.length);

      // 正确处理 UTF-8 编码：
      // atob() 返回 binary string (Latin-1)，需要转换为 UTF-8
      const binaryString = atob(base64Content);
      const bytes = Uint8Array.from(binaryString, (c) => c.charCodeAt(0));
      const decoded = new TextDecoder("utf-8").decode(bytes);

      logger.debug("Base64 data URI 已解码");
      return decoded;
    } catch (error) {
      logger.error("Base64 解码失败:", error);
      return dataUri;
    }
  }

  return dataUri; // 非 base64 data URI 格式直接返回
}

const DrawioEditorNative = forwardRef<DrawioEditorRef, DrawioEditorNativeProps>(
  function DrawioEditorNative(
    { initialXml, onSave, onSelectionChange, forceReload },
    ref,
  ) {
    const { t: tp } = useAppTranslation("page");
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isReady, setIsReady] = useState(false);
    const isReadyRef = useRef(false);
    const previousXmlRef = useRef<string | undefined>(initialXml);
    const isFirstLoadRef = useRef(true);
    const activeRequestIdRef = useRef<string | undefined>(undefined);
    const initialXmlRef = useRef<string | undefined>(initialXml);
    const onSaveRef = useRef<DrawioEditorNativeProps["onSave"]>(onSave);
    const onSelectionChangeRef =
      useRef<DrawioEditorNativeProps["onSelectionChange"]>(onSelectionChange);

    // 检测初始主题（用于设置 DrawIO URL 参数）
    // 优先读取 localStorage 中的用户偏好，回退到系统主题
    const [initialTheme] = useState<"light" | "dark">(() => {
      if (typeof window === "undefined") return "light";
      try {
        const savedTheme = window.localStorage.getItem("theme");
        if (savedTheme === "dark" || savedTheme === "light") {
          return savedTheme;
        }
      } catch {
        // 无痕模式等环境下读取失败时回退系统主题
      }
      // 回退到系统主题
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    });

    // 新增：export 和 merge 相关的 ref
    const exportedXmlRef = useRef<string | undefined>(undefined); // 存储 export 获取的 XML
    const autosaveReceivedRef = useRef(false); // 是否收到 autosave 事件
    const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null); // autosave 监测定时器
    const initializationCompleteRef = useRef(false); // 标记初始化是否完成
    const pendingExportsRef = useRef<Map<string, PendingExportEntry[]>>(
      new Map(),
    ); // export 回调队列

    // 统一的加载队列：包含 xml 内容和 resolve 回调
    const pendingLoadQueueRef = useRef<
      Array<{ xml: string | undefined; resolve: () => void }>
    >([]);

    const settleExport = (format: string, payload: string) => {
      const normalizedFormat = (format || "xml").toLowerCase();
      const queue = pendingExportsRef.current.get(normalizedFormat);
      if (!queue || queue.length === 0) {
        return false;
      }

      const entry = queue.shift();
      if (entry) {
        clearTimeout(entry.timeout);
        entry.resolve(payload);
      }

      if (queue.length === 0) {
        pendingExportsRef.current.delete(normalizedFormat);
      } else {
        pendingExportsRef.current.set(normalizedFormat, queue);
      }

      return true;
    };

    const flushPendingExports = () => {
      pendingExportsRef.current.forEach((queue) => {
        queue.forEach((entry) => {
          clearTimeout(entry.timeout);
          entry.resolve("");
        });
      });
      pendingExportsRef.current.clear();
    };

    const flushPendingLoads = () => {
      pendingLoadQueueRef.current.forEach(({ resolve }) => resolve());
      pendingLoadQueueRef.current = [];
    };

    // 构建 DrawIO URL（包含主题参数）
    // dark=1 表示深色模式，dark=0 表示浅色模式
    // 运行时切换主题时，DrawIO 会通过 prefers-color-scheme 自动跟随，无需重载 iframe
    const drawioUrl = `https://embed.diagrams.net/?embed=1&proto=json&spin=1&ui=kennedy&libraries=1&saveAndExit=1&noSaveBtn=1&noExitBtn=1&dark=${initialTheme === "dark" ? "1" : "0"}`;

    // 已发送等待响应的 load 回调队列（与 pendingLoadQueueRef 分开管理）
    const sentLoadResolversRef = useRef<Array<() => void>>([]);

    const dispatchLoadCommand = useCallback(
      (xml: string | undefined, resolve?: () => void) => {
        if (!iframeRef.current || !iframeRef.current.contentWindow) {
          logger.warn("iframe 未就绪，无法发送 load 命令");
          resolve?.();
          return;
        }

        const loadData = {
          action: "load",
          xml: xml || "",
          autosave: true,
        };
        logger.debug("发送 load 命令（完全加载）");
        if (resolve) {
          sentLoadResolversRef.current.push(resolve);
        }
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify(loadData),
          "*",
        );
      },
      [],
    );

    const replayPendingLoads = useCallback(() => {
      if (pendingLoadQueueRef.current.length === 0) {
        return;
      }

      const queuedLoads = [...pendingLoadQueueRef.current];
      pendingLoadQueueRef.current = [];

      logger.debug(`回放 ${queuedLoads.length} 个待执行的 load 请求`);

      queuedLoads.forEach(({ xml, resolve }) => {
        dispatchLoadCommand(xml, resolve);
      });
    }, [dispatchLoadCommand]);

    // 首次加载图表（使用 load 动作）
    const loadDiagram = useCallback(
      (xml: string | undefined, skipReadyCheck = false) => {
        return new Promise<void>((resolve) => {
          const iframeWindow =
            iframeRef.current && iframeRef.current.contentWindow;
          const canSend = iframeWindow && (isReady || skipReadyCheck);

          if (canSend) {
            dispatchLoadCommand(xml, resolve);
            return;
          }

          logger.debug("DrawIO 尚未就绪，已缓存 load 请求");
          pendingLoadQueueRef.current.push({ xml, resolve });
        });
      },
      [dispatchLoadCommand, isReady],
    );

    // 导出当前图表的 XML 或 SVG（返回 Promise）
    const requestExport = useCallback(
      (
        format: DrawioExportFormat,
        options?: SVGExportOptions,
      ): Promise<string> => {
        return new Promise((resolve) => {
          if (
            iframeRef.current &&
            iframeRef.current.contentWindow &&
            isReadyRef.current
          ) {
            // SVG 导出默认值（根据官方文档）
            const defaultSvgOptions: SVGExportOptions = {
              embedImages: true,
              scale: 1, // 原始缩放
              border: 10, // 10px 边框，避免裁切
            };

            // 合并用户提供的选项
            const svgOptions =
              format === "svg"
                ? { ...defaultSvgOptions, ...options }
                : undefined;

            const exportData: Record<string, unknown> = {
              action: "export",
              format,
              ...(svgOptions || {}), // 如果是 SVG，合并导出选项
            };

            const formatKey = format.toLowerCase();
            const entry: PendingExportEntry = {
              resolve: (payload: string) => {
                clearTimeout(entry.timeout);
                resolve(payload);
              },
              timeout: setTimeout(() => {
                logger.warn(`${format} 导出超时 ${EXPORT_TIMEOUT_MS}ms`);
                const queue = pendingExportsRef.current.get(formatKey);
                if (queue) {
                  const index = queue.indexOf(entry);
                  if (index > -1) {
                    queue.splice(index, 1);
                  }
                  if (queue.length === 0) {
                    pendingExportsRef.current.delete(formatKey);
                  } else {
                    pendingExportsRef.current.set(formatKey, queue);
                  }
                }
                resolve("");
              }, EXPORT_TIMEOUT_MS),
            };

            const queue = pendingExportsRef.current.get(formatKey) || [];
            queue.push(entry);
            pendingExportsRef.current.set(formatKey, queue);

            logger.debug(`发送 export 命令 (${format})`, svgOptions || "");
            iframeRef.current.contentWindow.postMessage(
              JSON.stringify(exportData),
              "*",
            );
          } else {
            resolve("");
          }
        });
      },
      [],
    );

    const exportDiagram = useCallback(
      () => requestExport("xml"),
      [requestExport],
    );
    const exportSVG = useCallback(
      (options?: SVGExportOptions) => requestExport("svg", options),
      [requestExport],
    );

    // 更新图表（使用 merge 动作，保留编辑状态，超时交由上层控制）
    const mergeWithFallback = useCallback(
      (xml: string | undefined, requestId?: string) => {
        if (iframeRef.current && iframeRef.current.contentWindow && isReady) {
          if (requestId) {
            activeRequestIdRef.current = requestId;
          }

          const updateData = {
            action: "merge",
            xml: xml || "",
            requestId,
          };
          logger.debug("发送 merge 命令（增量更新，保留编辑状态）");

          // 发送 merge 命令
          iframeRef.current.contentWindow.postMessage(
            JSON.stringify(updateData),
            "*",
          );
        }
      },
      [isReady],
    );

    // 暴露方法给父组件
    useImperativeHandle(
      ref,
      () => ({
        loadDiagram: async (xml: string) => loadDiagram(xml),
        mergeDiagram: (xml: string, requestId?: string) =>
          mergeWithFallback(xml, requestId),
        exportDiagram,
        exportSVG,
      }),
      [loadDiagram, mergeWithFallback, exportDiagram, exportSVG],
    );

    // 使用 ref 保存最新的函数引用，确保防抖函数始终能访问到最新版本
    const loadDiagramRef = useRef(loadDiagram);
    const mergeWithFallbackRef = useRef(mergeWithFallback);
    const requestExportRef = useRef(requestExport);
    const exportDiagramRef = useRef(exportDiagram);

    useEffect(() => {
      loadDiagramRef.current = loadDiagram;
      mergeWithFallbackRef.current = mergeWithFallback;
      requestExportRef.current = requestExport;
      exportDiagramRef.current = exportDiagram;
    }, [loadDiagram, mergeWithFallback, requestExport, exportDiagram]);

    useEffect(() => {
      initialXmlRef.current = initialXml;
      onSaveRef.current = onSave;
      onSelectionChangeRef.current = onSelectionChange;
    }, [initialXml, onSave, onSelectionChange]);

    // 防抖的更新函数 - 使用 useMemo 确保只创建一次
    const debouncedUpdate = useMemo(
      () =>
        debounce((xml?: string) => {
          if (isFirstLoadRef.current) {
            // 首次加载使用 load
            loadDiagramRef.current(xml);
            isFirstLoadRef.current = false;
          } else {
            // 后续更新使用 merge（带超时回退）
            mergeWithFallbackRef.current(xml);
          }
        }, 300),
      [], // 空依赖数组，因为使用 ref 来访问最新的函数
    );

    useEffect(() => {
      logger.debug("DrawioEditorNative 组件已挂载");
      logger.debug("DrawIO URL:", drawioUrl);

      // 监听来自 iframe 的消息
      const handleMessage = (event: MessageEvent) => {
        // 安全检查：确保消息来自 diagrams.net
        if (!event.origin.includes("diagrams.net")) {
          return;
        }

        try {
          const data = JSON.parse(event.data);
          logger.debug("收到来自 DrawIO 的消息:", data.event);

          if (data.event === "init") {
            logger.debug("DrawIO iframe 初始化成功！");
            setIsReady(true);
            isReadyRef.current = true;
            replayPendingLoads();

            // 先导出当前 DrawIO 的 XML，用于对比
            logger.debug("请求 export 以获取 DrawIO 当前 XML");
            // 使用 setTimeout 确保 setIsReady 状态已更新
            setTimeout(() => {
              requestExportRef.current("xml");
            }, 100);

            // 启动 autosave 监测定时器（2秒后检查）
            autosaveTimerRef.current = setTimeout(() => {
              if (
                !autosaveReceivedRef.current &&
                !initializationCompleteRef.current
              ) {
                logger.debug("2秒内未收到 autosave，主动执行 export");
                exportDiagramRef.current();
              }
            }, 2000);
          } else if (data.event === "export") {
            logger.debug("收到 export 响应");

            // 读取所有可能的数据字段
            // - data.xml: XML 格式的 DrawIO 源文件
            // - data.data: SVG 等其他格式的导出内容（通常是 data URI）
            const xmlData = typeof data.xml === "string" ? data.xml : "";
            const svgData = typeof data.data === "string" ? data.data : "";

            // 解码数据（处理 base64 data URI）
            const decodedXml = xmlData ? decodeBase64DataURI(xmlData) : "";
            const decodedSvg = svgData ? decodeBase64DataURI(svgData) : "";

            // 智能解析：依次尝试不同格式，直到成功匹配待处理的导出请求
            // 不依赖 data.format 字段，因为 DrawIO 可能不返回该字段
            let resolved = false;

            // 1. 优先尝试 SVG（如果有 data.data 字段）
            if (decodedSvg) {
              resolved = settleExport("svg", decodedSvg);
              logger.debug(`  尝试 SVG 格式: ${resolved ? "成功" : "失败"}`);
            }

            // 2. 如果 SVG 失败，尝试 XML（如果有 data.xml 字段）
            if (!resolved && decodedXml) {
              resolved = settleExport("xml", decodedXml);
              logger.debug(`  尝试 XML 格式: ${resolved ? "成功" : "失败"}`);
            }

            // 3. 记录失败情况（用于调试）
            if (!resolved) {
              logger.warn("无法匹配任何待处理的导出请求");
              logger.warn("  响应中的数据:", {
                hasXml: !!xmlData,
                hasSvg: !!svgData,
                format: data.format,
              });
            }

            // 更新 XML 缓存（用于初始化逻辑）
            if (decodedXml) {
              exportedXmlRef.current = decodedXml;

              if (!initializationCompleteRef.current) {
                const normalizedExported = decodedXml.trim();
                const normalizedInitial = (initialXmlRef.current || "").trim();

                if (normalizedExported !== normalizedInitial) {
                  logger.debug("检测到 XML 不同，执行 load 操作");
                  logger.debug(
                    `  - 期望 XML 长度: ${normalizedInitial.length} 字符`,
                  );
                  logger.debug(
                    `  - DrawIO XML 长度: ${normalizedExported.length} 字符`,
                  );
                  loadDiagramRef.current(initialXmlRef.current, true);
                } else {
                  logger.debug("XML 相同，跳过 load 操作");
                }
                isFirstLoadRef.current = false; // 标记首次加载已完成
                initializationCompleteRef.current = true; // 标记初始化完成
              }
            }
          } else if (data.event === "merge") {
            const requestIdFromPayload =
              typeof data.requestId === "string" ? data.requestId : undefined;
            const requestId =
              requestIdFromPayload ?? activeRequestIdRef.current;

            if (requestIdFromPayload) {
              activeRequestIdRef.current = requestIdFromPayload;
            }

            // 新增：检测 DrawIO 返回的 merge 错误
            if (data.error) {
              logger.error("[DrawIO] merge 错误:", data.error);
              window.dispatchEvent(
                new CustomEvent("drawio-merge-error", {
                  detail: {
                    error: data.error,
                    message: data.message,
                    requestId,
                  },
                }),
              );
            } else {
              window.dispatchEvent(
                new CustomEvent("drawio-merge-success", {
                  detail: { requestId },
                }),
              );
            }

            logger.debug("merge 操作完成");
          } else if (data.event === "autosave" || data.event === "save") {
            logger.debug("DrawIO 保存事件触发");
            autosaveReceivedRef.current = true; // 标记已收到 autosave
            const latestOnSave = onSaveRef.current;
            if (latestOnSave && data.xml) {
              latestOnSave(data.xml);
            }
          } else if (data.event === "load") {
            logger.debug("DrawIO 已加载内容");
            const resolver = sentLoadResolversRef.current.shift();
            resolver?.();
          } else if (data.event === "drawio-selection") {
            // 处理选区信息
            const count = Number(data.count ?? 0) || 0;
            const cells = data.cells || [];

            const selectionInfo: DrawioSelectionInfo = {
              count,
              cells: cells.map((cell: RawDrawioCell) => ({
                id: cell.id || "",
                type: cell.type || "unknown",
                value: cell.value,
                style: cell.style || "",
                label: cell.label || "",
                geometry: cell.geometry || undefined,
              })),
            };

            onSelectionChangeRef.current?.(selectionInfo);
          }
        } catch (error) {
          logger.error("解析消息失败:", error);
        }
      };

      window.addEventListener("message", handleMessage);

      return () => {
        logger.debug("DrawioEditorNative 组件将卸载");
        window.removeEventListener("message", handleMessage);

        // 清理所有定时器
        if (autosaveTimerRef.current) {
          clearTimeout(autosaveTimerRef.current);
          autosaveTimerRef.current = null;
        }

        // 结束未完成的 load/export Promise，避免内存泄漏
        flushPendingLoads();
        flushPendingExports();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 监听 initialXml 的变化，智能更新内容
    useEffect(() => {
      // 只在 isReady 为 true 且 initialXml 真正变化时才更新
      if (isReady && initialXml !== previousXmlRef.current) {
        const normalizedPrevious = (previousXmlRef.current || "").trim();
        const normalizedNext = (initialXml || "").trim();

        // 工程切换/首次挂载时，initialXml 可能先以空字符串完成初始化，稍后才拿到真实 XML。
        // 这种情况下如果走 merge，可能出现合并失败/内容保持空白的风险，因此强制使用 load 完整重载。
        const shouldForceLoadForLateInitialXml =
          !forceReload &&
          initializationCompleteRef.current &&
          !isFirstLoadRef.current &&
          normalizedPrevious === "" &&
          normalizedNext !== "";

        logger.debug("检测到 XML 更新");
        logger.debug(
          "之前的 XML:",
          previousXmlRef.current
            ? `存在 (${previousXmlRef.current?.length} 字符)`
            : "不存在",
        );
        logger.debug(
          "新的 XML:",
          initialXml ? `存在 (${initialXml?.length} 字符)` : "不存在",
        );
        logger.debug("强制重载:", forceReload ? "是" : "否");

        // 如果需要强制重载（如用户手动加载文件），使用 load 动作
        if (forceReload || shouldForceLoadForLateInitialXml) {
          logger.debug("使用 load 动作（完全重载）");
          loadDiagram(initialXml);
          isFirstLoadRef.current = false;
        } else {
          // 否则使用防抖的智能更新函数（首次 load，后续 merge）
          debouncedUpdate(initialXml);
        }

        previousXmlRef.current = initialXml;
      }
    }, [initialXml, isReady, forceReload, loadDiagram, debouncedUpdate]);

    // iframe 加载事件
    const handleIframeLoad = () => {
      logger.debug("iframe onLoad 事件触发");
    };

    useEffect(() => {
      if (!isReady) {
        return;
      }

      if (typeof window === "undefined") {
        return;
      }

      const enableWatcher = window.electron?.enableSelectionWatcher;

      if (enableWatcher) {
        enableWatcher()
          .then((result) => {
            if (!result?.success) {
              logger.warn("启用 DrawIO 选区监听失败:", result?.message);
            }
          })
          .catch((error) => {
            logger.error("启用 DrawIO 选区监听异常:", error);
          });
      }
    }, [isReady]);

    return (
      <div
        className="drawio-container"
        style={{ width: "100%", height: "100%" }}
      >
        <iframe
          ref={iframeRef}
          src={drawioUrl}
          onLoad={handleIframeLoad}
          allow="clipboard-read; clipboard-write"
          title="DrawIO Editor"
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            minWidth: "400px",
            minHeight: "400px",
          }}
        />
        {!isReady && (
          <div className="loading-overlay" role="status" aria-live="polite">
            <div className="loading-overlay__card">
              <Spinner
                size="xl"
                color="success"
                aria-label={tp("main.loadingEditor")}
                className="loading-overlay__spinner"
              />
              <h2 className="loading-overlay__title">
                {tp("main.loadingEditor")}
              </h2>
              <p className="loading-overlay__description">
                {tp("main.loadingProjectDetail")}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  },
);

export default DrawioEditorNative;
