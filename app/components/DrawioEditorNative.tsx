"use client";

import { useRef, useState, useEffect, useCallback } from "react";

interface DrawioEditorNativeProps {
  initialXml?: string;
  onSave?: (xml: string) => void;
  onSelectionChange?: (count: number) => void;
}

export default function DrawioEditorNative({
  initialXml,
  onSave,
  onSelectionChange,
}: DrawioEditorNativeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isReady, setIsReady] = useState(false);
  const previousXmlRef = useRef<string | undefined>(initialXml);
  const selectionChangeRef = useRef(onSelectionChange);

  useEffect(() => {
    selectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  // 构建 DrawIO URL
  const drawioUrl = `https://embed.diagrams.net/?embed=1&proto=json&spin=1&ui=kennedy&libraries=1&saveAndExit=1&noExitBtn=1`;

  // 提取加载数据的函数
  const loadDiagram = useCallback((xml: string | undefined, skipReadyCheck = false) => {
    if (iframeRef.current && iframeRef.current.contentWindow && (isReady || skipReadyCheck)) {
      const loadData = {
        action: 'load',
        xml: xml || '',
        autosave: true
      };
      console.log("📤 发送 load 命令");
      iframeRef.current.contentWindow.postMessage(JSON.stringify(loadData), '*');
    }
  }, [isReady]);

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

          if (selectionChangeRef.current) {
            selectionChangeRef.current(0);
          }

          // 加载初始数据（跳过 ready 检查，因为此时状态还未更新）
          loadDiagram(initialXml, true);
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
        } else if (data.event === 'selectionChanged') {
          const count = Array.isArray(data.cells)
            ? data.cells.filter(Boolean).length
            : typeof data.count === 'number'
              ? data.count
              : 0;

          if (selectionChangeRef.current) {
            selectionChangeRef.current(count);
          }
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

  // 监听 initialXml 的变化，动态加载新内容
  useEffect(() => {
    // 只在 isReady 为 true 且 initialXml 真正变化时才重新加载
    if (isReady && initialXml !== previousXmlRef.current) {
      console.log("🔄 检测到 XML 更新，重新加载");
      console.log("🔄 之前的 XML:", previousXmlRef.current ? "存在" : "不存在");
      console.log("🔄 新的 XML:", initialXml ? "存在" : "不存在");

      loadDiagram(initialXml);
      previousXmlRef.current = initialXml;
    }
  }, [initialXml, isReady, loadDiagram]);

  // iframe 加载事件
  const handleIframeLoad = () => {
    console.log("🌐 iframe onLoad 事件触发");
  };

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
