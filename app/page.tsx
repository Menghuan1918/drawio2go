"use client";

import { useState, useEffect } from "react";
// import DrawioEditor from "./components/DrawioEditor";
import DrawioEditorNative from "./components/DrawioEditorNative"; // 使用原生 iframe 实现
import BottomBar from "./components/BottomBar";
import UnifiedSidebar from "./components/UnifiedSidebar";
import { UPDATE_EVENT, saveDrawioXML } from "./lib/drawio-tools";
import { useDrawioSocket } from "./hooks/useDrawioSocket";

export default function Home() {
  const [diagramXml, setDiagramXml] = useState<string>("");
  const [currentXml, setCurrentXml] = useState<string>("");
  const [settings, setSettings] = useState({ defaultPath: "" });
  const [activeSidebar, setActiveSidebar] = useState<"none" | "settings" | "chat">("none");

  // 初始化 Socket.IO 连接
  const { isConnected } = useDrawioSocket();

  // 加载保存的图表
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedXml = localStorage.getItem("currentDiagram");
      if (savedXml) {
        setDiagramXml(savedXml);
        setCurrentXml(savedXml);
      }

      const savedPath = localStorage.getItem("defaultPath");
      if (savedPath) {
        setSettings({ defaultPath: savedPath });
      }

      // 监听 DrawIO XML 更新事件（由工具函数触发）
      const handleXmlUpdate = (event: Event) => {
        const customEvent = event as CustomEvent<{ xml: string }>;
        if (customEvent.detail?.xml) {
          console.log("🔄 收到 DrawIO 工具触发的 XML 更新事件");
          setDiagramXml(customEvent.detail.xml);
          setCurrentXml(customEvent.detail.xml);
        }
      };

      window.addEventListener(UPDATE_EVENT, handleXmlUpdate);

      return () => {
        window.removeEventListener(UPDATE_EVENT, handleXmlUpdate);
      };
    }
  }, []);

  // 自动保存图表到 localStorage（自动解码 base64）
  const handleAutoSave = (xml: string) => {
    setCurrentXml(xml);
    if (typeof window !== "undefined") {
      saveDrawioXML(xml, { notify: false });
    }
  };

  // 手动保存到文件
  const handleManualSave = async () => {
    if (!currentXml) {
      alert("没有可保存的内容");
      return;
    }

    // 如果在 Electron 环境中,保存到文件系统
    if (typeof window !== "undefined" && window.electron) {
      const result = await window.electron.saveDiagram(
        currentXml,
        settings.defaultPath
      );
      if (result.success) {
        alert(`文件已保存到: ${result.filePath}`);
      } else {
        alert(`保存失败: ${result.message}`);
      }
    } else {
      // 浏览器环境下载文件
      const blob = new Blob([currentXml], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "diagram.drawio";
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // 加载文件
  const handleLoad = async () => {
    if (typeof window !== "undefined" && window.electron) {
      const result = await window.electron.loadDiagram();
      if (result.success && result.xml) {
        setDiagramXml(result.xml);
        setCurrentXml(result.xml);
        saveDrawioXML(result.xml);
      } else if (result.message !== "用户取消打开") {
        alert(`加载失败: ${result.message}`);
      }
    } else {
      // 浏览器环境上传文件
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".drawio";
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const xml = event.target?.result as string;
            setDiagramXml(xml);
            setCurrentXml(xml);
            saveDrawioXML(xml);
          };
          reader.readAsText(file);
        }
      };
      input.click();
    }
  };

  // 设置变更
  const handleSettingsChange = (newSettings: { defaultPath: string }) => {
    setSettings(newSettings);
  };

  // 切换设置侧栏
  const handleToggleSettings = () => {
    setActiveSidebar((prev) => (prev === "settings" ? "none" : "settings"));
  };

  // 切换聊天侧栏
  const handleToggleChat = () => {
    setActiveSidebar((prev) => (prev === "chat" ? "none" : "chat"));
  };

  return (
    <main className="main-container">
      {/* Socket.IO 连接状态指示器 */}
      {!isConnected && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          background: '#ff6b6b',
          color: 'white',
          padding: '8px 16px',
          textAlign: 'center',
          fontSize: '14px',
          zIndex: 9999,
        }}>
          ⚠️ Socket.IO 未连接，AI 工具功能不可用
        </div>
      )}

      {/* DrawIO 编辑器区域 */}
      <div className={`editor-container ${activeSidebar !== "none" ? "sidebar-open" : ""}`}>
        <DrawioEditorNative
          initialXml={diagramXml}
          onSave={handleAutoSave}
        />
      </div>

      {/* 统一侧拉栏 */}
      <UnifiedSidebar
        isOpen={activeSidebar !== "none"}
        activeSidebar={activeSidebar}
        onClose={() => setActiveSidebar("none")}
        onSettingsChange={handleSettingsChange}
      />

      {/* 底部工具栏 */}
      <BottomBar
        onToggleSettings={handleToggleSettings}
        onToggleChat={handleToggleChat}
        onSave={handleManualSave}
        onLoad={handleLoad}
        activeSidebar={activeSidebar}
      />
    </main>
  );
}
