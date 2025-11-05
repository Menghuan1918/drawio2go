"use client";

import { useRef, useState, useEffect, useCallback, useMemo } from "react";

interface DrawioEditorNativeProps {
  initialXml?: string;
  onSave?: (xml: string) => void;
  onSelectionChange?: (count: number) => void;
  forceReload?: boolean; // 强制完全重载（用于用户手动加载文件等场景）
}

// 简化的防抖函数，专门用于 XML 更新场景
// 通过具体的类型定义避免使用 any
function debounceXmlUpdate(
  func: (xml: string | undefined) => void,
  wait: number
): (xml: string | undefined) => void {
  let timeout: NodeJS.Timeout | null = null;
  return function (xml: string | undefined) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      func(xml);
    }, wait);
  };
}

export default function DrawioEditorNative({ initialXml, onSave, onSelectionChange, forceReload }: DrawioEditorNativeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isReady, setIsReady] = useState(false);
  const previousXmlRef = useRef<string | undefined>(initialXml);
  const isFirstLoadRef = useRef(true);

  // 构建 DrawIO URL
  const drawioUrl = `https://embed.diagrams.net/?embed=1&proto=json&spin=1&ui=kennedy&libraries=1&saveAndExit=1&noExitBtn=1`;

  // 首次加载图表（使用 load 动作）
  const loadDiagram = useCallback((xml: string | undefined, skipReadyCheck = false) => {
    if (iframeRef.current && iframeRef.current.contentWindow && (isReady || skipReadyCheck)) {
      const loadData = {
        action: 'load',
        xml: xml || '',
        autosave: true
      };
      console.log("📤 发送 load 命令（首次加载）");
      iframeRef.current.contentWindow.postMessage(JSON.stringify(loadData), '*');
    }
  }, [isReady]);

  // 更新图表（使用 merge 动作，保留编辑状态）
  const updateDiagram = useCallback((xml: string | undefined) => {
    if (iframeRef.current && iframeRef.current.contentWindow && isReady) {
      const updateData = {
        action: 'merge',
        xml: xml || ''
      };
      console.log("🔄 发送 merge 命令（增量更新，保留编辑状态）");
      iframeRef.current.contentWindow.postMessage(JSON.stringify(updateData), '*');
    }
  }, [isReady]);

  // 使用 ref 保存最新的函数引用，确保防抖函数始终能访问到最新版本
  const loadDiagramRef = useRef(loadDiagram);
  const updateDiagramRef = useRef(updateDiagram);

  useEffect(() => {
    loadDiagramRef.current = loadDiagram;
    updateDiagramRef.current = updateDiagram;
  }, [loadDiagram, updateDiagram]);

  // 防抖的更新函数 - 使用 useMemo 确保只创建一次
  const debouncedUpdate = useMemo(
    () => debounceXmlUpdate((xml: string | undefined) => {
      if (isFirstLoadRef.current) {
        // 首次加载使用 load
        loadDiagramRef.current(xml);
        isFirstLoadRef.current = false;
      } else {
        // 后续更新使用 merge
        updateDiagramRef.current(xml);
      }
    }, 300),
    [] // 空依赖数组，因为使用 ref 来访问最新的函数
  );

  useEffect(() => {
    console.log("🔵 DrawioEditorNative 组件已挂载");
    console.log("🔵 DrawIO URL:", drawioUrl);

    // 监听来自 iframe 的消息
    const handleMessage = (event: MessageEvent) => {
      // 安全检查：确保消息来自 diagrams.net
      if (!event.origin.includes('diagrams.net')) {
        return;
      }

      try {
        const data = JSON.parse(event.data);
        console.log("📩 收到来自 DrawIO 的消息:", data.event);

        if (data.event === 'init') {
          console.log("✅ DrawIO iframe 初始化成功！");
          setIsReady(true);

          // 加载初始数据（跳过 ready 检查，因为此时状态还未更新）
          loadDiagram(initialXml, true);
          isFirstLoadRef.current = false; // 标记首次加载已完成
        } else if (data.event === 'autosave' || data.event === 'save') {
          console.log("💾 DrawIO 保存事件触发");
          if (onSave && data.xml) {
            onSave(data.xml);
          }

          // 请求导出 XML
          if (iframeRef.current && iframeRef.current.contentWindow) {
            iframeRef.current.contentWindow.postMessage(JSON.stringify({
              action: 'export',
              format: 'xmlsvg'
            }), '*');
          }
        } else if (data.event === 'export') {
          console.log("📦 收到导出数据");
          if (onSave && data.data) {
            onSave(data.data);
          }
        } else if (data.event === 'load') {
          console.log("✅ DrawIO 已加载内容");
        } else if (data.event === 'drawio-selection') {
          const count = typeof data.count === 'number' ? data.count : Number(data.count ?? 0) || 0;
          onSelectionChange?.(count);
        }
      } catch (error) {
        console.error("❌ 解析消息失败:", error);
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      console.log("🔴 DrawioEditorNative 组件将卸载");
      window.removeEventListener('message', handleMessage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 监听 initialXml 的变化，智能更新内容
  useEffect(() => {
    // 只在 isReady 为 true 且 initialXml 真正变化时才更新
    if (isReady && initialXml !== previousXmlRef.current) {
      console.log("🔄 检测到 XML 更新");
      console.log("🔄 之前的 XML:", previousXmlRef.current ? `存在 (${previousXmlRef.current?.length} 字符)` : "不存在");
      console.log("🔄 新的 XML:", initialXml ? `存在 (${initialXml?.length} 字符)` : "不存在");
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
    <div className="drawio-container" style={{ width: '100%', height: '100%' }}>
      <iframe
        ref={iframeRef}
        src={drawioUrl}
        onLoad={handleIframeLoad}
        allow="clipboard-read; clipboard-write"
        title="DrawIO Editor"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          minWidth: '400px',
          minHeight: '400px'
        }}
      />
      {!isReady && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'white',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
        }}>
          <p>正在加载 DrawIO 编辑器...</p>
        </div>
      )}
    </div>
  );
}
