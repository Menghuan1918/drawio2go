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
import { DrawioSelectionInfo } from "../types/drawio-tools";
import { debounce } from "@/app/lib/utils";

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
  mergeDiagram: (xml: string) => void;
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

      console.log("🔓 Base64 data URI 已解码");
      return decoded;
    } catch (error) {
      console.error("❌ Base64 解码失败:", error);
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
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isReady, setIsReady] = useState(false);
    const previousXmlRef = useRef<string | undefined>(initialXml);
    const isFirstLoadRef = useRef(true);
    const activeRequestIdRef = useRef<string | undefined>(undefined);

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
    const mergeTimeoutRef = useRef<NodeJS.Timeout | null>(null); // merge 超时定时器
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
          console.warn("⚠️ iframe 未就绪，无法发送 load 命令");
          resolve?.();
          return;
        }

        const loadData = {
          action: "load",
          xml: xml || "",
          autosave: true,
        };
        console.log("📤 发送 load 命令（完全加载）");
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

      console.log(`⏩ 回放 ${queuedLoads.length} 个待执行的 load 请求`);

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

          console.log("⏳ DrawIO 尚未就绪，已缓存 load 请求");
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
          if (iframeRef.current && iframeRef.current.contentWindow && isReady) {
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
                console.warn(`⚠️ ${format} 导出超时 ${EXPORT_TIMEOUT_MS}ms`);
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

            console.log(`📤 发送 export 命令 (${format})`, svgOptions || "");
            iframeRef.current.contentWindow.postMessage(
              JSON.stringify(exportData),
              "*",
            );
          } else {
            resolve("");
          }
        });
      },
      [isReady],
    );

    const exportDiagram = useCallback(
      () => requestExport("xml"),
      [requestExport],
    );
    const exportSVG = useCallback(
      (options?: SVGExportOptions) => requestExport("svg", options),
      [requestExport],
    );

    // 更新图表（使用 merge 动作，保留编辑状态，带超时回退）
    const mergeWithFallback = useCallback(
      (xml: string | undefined) => {
        if (iframeRef.current && iframeRef.current.contentWindow && isReady) {
          const updateData = {
            action: "merge",
            xml: xml || "",
          };
          console.log("🔄 发送 merge 命令（增量更新，保留编辑状态）");

          // 清除之前的超时定时器（如果存在）
          if (mergeTimeoutRef.current) {
            clearTimeout(mergeTimeoutRef.current);
            mergeTimeoutRef.current = null;
          }

          // 发送 merge 命令
          iframeRef.current.contentWindow.postMessage(
            JSON.stringify(updateData),
            "*",
          );

          // 设置 10 秒超时回退机制
          mergeTimeoutRef.current = setTimeout(() => {
            console.warn(
              "⚠️ merge 操作超时（10秒未收到回调），回退到 load 操作",
            );
            loadDiagram(xml);
            mergeTimeoutRef.current = null;
          }, 10000); // 10 秒超时
        }
      },
      [isReady, loadDiagram],
    );

    // 暴露方法给父组件
    useImperativeHandle(
      ref,
      () => ({
        loadDiagram: async (xml: string) => loadDiagram(xml),
        mergeDiagram: (xml: string) => mergeWithFallback(xml),
        exportDiagram,
        exportSVG,
      }),
      [loadDiagram, mergeWithFallback, exportDiagram, exportSVG],
    );

    // 使用 ref 保存最新的函数引用，确保防抖函数始终能访问到最新版本
    const loadDiagramRef = useRef(loadDiagram);
    const mergeWithFallbackRef = useRef(mergeWithFallback);

    useEffect(() => {
      loadDiagramRef.current = loadDiagram;
      mergeWithFallbackRef.current = mergeWithFallback;
    }, [loadDiagram, mergeWithFallback]);

    useEffect(() => {
      const handleAIXmlReplaced = (event: Event) => {
        const detail = (
          event as CustomEvent<{ requestId?: string; isRollback?: boolean }>
        ).detail;
        const isRollback = detail?.isRollback === true;

        if (detail?.requestId) {
          activeRequestIdRef.current = detail.requestId;
        } else {
          activeRequestIdRef.current = undefined;
        }

        if (isRollback) {
          console.log("[DrawIO] 接收到回滚 XML，跳过并发验证链路");
        }
      };

      window.addEventListener("ai-xml-replaced", handleAIXmlReplaced);

      return () => {
        window.removeEventListener("ai-xml-replaced", handleAIXmlReplaced);
      };
    }, []);

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
      console.log("🔵 DrawioEditorNative 组件已挂载");
      console.log("🔵 DrawIO URL:", drawioUrl);

      // 监听来自 iframe 的消息
      const handleMessage = (event: MessageEvent) => {
        // 安全检查：确保消息来自 diagrams.net
        if (!event.origin.includes("diagrams.net")) {
          return;
        }

        try {
          const data = JSON.parse(event.data);
          console.log("📩 收到来自 DrawIO 的消息:", data.event);

          if (data.event === "init") {
            console.log("✅ DrawIO iframe 初始化成功！");
            setIsReady(true);
            replayPendingLoads();

            // 先导出当前 DrawIO 的 XML，用于对比
            console.log("🔍 请求 export 以获取 DrawIO 当前 XML");
            // 使用 setTimeout 确保 setIsReady 状态已更新
            setTimeout(() => {
              requestExport("xml");
            }, 100);

            // 启动 autosave 监测定时器（2秒后检查）
            autosaveTimerRef.current = setTimeout(() => {
              if (
                !autosaveReceivedRef.current &&
                !initializationCompleteRef.current
              ) {
                console.log("⏰ 2秒内未收到 autosave，主动执行 export");
                exportDiagram();
              }
            }, 2000);
          } else if (data.event === "export") {
            console.log("📦 收到 export 响应");

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
              console.log(
                `  🔍 尝试 SVG 格式: ${resolved ? "✅ 成功" : "❌ 失败"}`,
              );
            }

            // 2. 如果 SVG 失败，尝试 XML（如果有 data.xml 字段）
            if (!resolved && decodedXml) {
              resolved = settleExport("xml", decodedXml);
              console.log(
                `  🔍 尝试 XML 格式: ${resolved ? "✅ 成功" : "❌ 失败"}`,
              );
            }

            // 3. 记录失败情况（用于调试）
            if (!resolved) {
              console.warn("⚠️ 无法匹配任何待处理的导出请求");
              console.warn("  响应中的数据:", {
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
                const normalizedInitial = (initialXml || "").trim();

                if (normalizedExported !== normalizedInitial) {
                  console.log("🔄 检测到 XML 不同，执行 load 操作");
                  console.log(
                    `  - 期望 XML 长度: ${normalizedInitial.length} 字符`,
                  );
                  console.log(
                    `  - DrawIO XML 长度: ${normalizedExported.length} 字符`,
                  );
                  loadDiagram(initialXml, true);
                } else {
                  console.log("✅ XML 相同，跳过 load 操作");
                }
                isFirstLoadRef.current = false; // 标记首次加载已完成
                initializationCompleteRef.current = true; // 标记初始化完成
              }
            }
          } else if (data.event === "merge") {
            // 清除 merge 超时定时器
            if (mergeTimeoutRef.current) {
              clearTimeout(mergeTimeoutRef.current);
              mergeTimeoutRef.current = null;
            }

            const requestIdFromPayload =
              typeof data.requestId === "string" ? data.requestId : undefined;
            const requestId =
              requestIdFromPayload ?? activeRequestIdRef.current;

            if (requestIdFromPayload) {
              activeRequestIdRef.current = requestIdFromPayload;
            }

            // 新增：检测 DrawIO 返回的 merge 错误
            if (data.error) {
              console.error("[DrawIO] merge 错误:", data.error);
              window.dispatchEvent(
                new CustomEvent("drawio-merge-error", {
                  detail: {
                    error: data.error,
                    message: data.message,
                    requestId,
                  },
                }),
              );
            }

            console.log("✅ merge 操作完成");
          } else if (data.event === "autosave" || data.event === "save") {
            console.log("💾 DrawIO 保存事件触发");
            autosaveReceivedRef.current = true; // 标记已收到 autosave
            if (onSave && data.xml) {
              onSave(data.xml);
            }
          } else if (data.event === "load") {
            console.log("✅ DrawIO 已加载内容");
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

            onSelectionChange?.(selectionInfo);
          }
        } catch (error) {
          console.error("❌ 解析消息失败:", error);
        }
      };

      window.addEventListener("message", handleMessage);

      return () => {
        console.log("🔴 DrawioEditorNative 组件将卸载");
        window.removeEventListener("message", handleMessage);

        // 清理所有定时器
        if (mergeTimeoutRef.current) {
          clearTimeout(mergeTimeoutRef.current);
          mergeTimeoutRef.current = null;
        }
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
        console.log("🔄 检测到 XML 更新");
        console.log(
          "🔄 之前的 XML:",
          previousXmlRef.current
            ? `存在 (${previousXmlRef.current?.length} 字符)`
            : "不存在",
        );
        console.log(
          "🔄 新的 XML:",
          initialXml ? `存在 (${initialXml?.length} 字符)` : "不存在",
        );
        console.log("🔄 强制重载:", forceReload ? "是" : "否");

        // 如果需要强制重载（如用户手动加载文件），使用 load 动作
        if (forceReload) {
          console.log("🔄 使用 load 动作（完全重载）");
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
      console.log("🌐 iframe onLoad 事件触发");
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
              console.warn("⚠️ 启用 DrawIO 选区监听失败:", result?.message);
            }
          })
          .catch((error) => {
            console.error("❌ 启用 DrawIO 选区监听异常:", error);
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
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              background: "white",
              padding: "20px",
              borderRadius: "8px",
              boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
            }}
          >
            <p>正在加载 DrawIO 编辑器...</p>
          </div>
        )}
      </div>
    );
  },
);

export default DrawioEditorNative;
