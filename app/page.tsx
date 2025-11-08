"use client";

import { useState, useEffect } from "react";
// import DrawioEditor from "./components/DrawioEditor";
import DrawioEditorNative from "./components/DrawioEditorNative"; // 使用原生 iframe 实现
import BottomBar from "./components/BottomBar";
import UnifiedSidebar from "./components/UnifiedSidebar";
import { UPDATE_EVENT, saveDrawioXML, getDrawioXML } from "./lib/drawio-tools";
import { useDrawioSocket } from "./hooks/useDrawioSocket";
import { DrawioSelectionInfo } from "./types/drawio-tools";
import { useStorageSettings } from "./hooks/useStorageSettings";

export default function Home() {
  // 存储 Hook
  const { getDefaultPath } = useStorageSettings();

  const [diagramXml, setDiagramXml] = useState<string>("");
  const [currentXml, setCurrentXml] = useState<string>("");
  const [settings, setSettings] = useState({ defaultPath: "" });
  const [activeSidebar, setActiveSidebar] = useState<
    "none" | "settings" | "chat"
  >("none");
  const [selectionInfo, setSelectionInfo] = useState<DrawioSelectionInfo>({
    count: 0,
    cells: [],
  });
  const [isElectronEnv, setIsElectronEnv] = useState<boolean>(false);
  const [forceReload, setForceReload] = useState<boolean>(false); // 控制是否强制完全重载

  // 初始化 Socket.IO 连接
  const { isConnected } = useDrawioSocket();

  // 加载保存的图表
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsElectronEnv(Boolean(window.electron));

      // 从 IndexedDB 加载图表数据
      const loadInitialData = async () => {
        try {
          const result = await getDrawioXML();
          if (result.success && result.xml) {
            setDiagramXml(result.xml);
            setCurrentXml(result.xml);
          }
        } catch (error) {
          console.error("加载初始图表数据失败:", error);
        }
      };

      loadInitialData();

      // 加载默认路径设置
      const loadDefaultPath = async () => {
        try {
          const savedPath = await getDefaultPath();
          if (savedPath) {
            setSettings({ defaultPath: savedPath });
          }
        } catch (error) {
          console.error("加载默认路径失败:", error);
        }
      };

      loadDefaultPath();

      // 监听 DrawIO XML 更新事件（由工具函数触发）
      // 注意：这里只更新 React 状态，实际的 DrawIO 编辑器更新在 DrawioEditorNative 组件内部完成
      // DrawioEditorNative 会监听 initialXml prop 的变化，并使用 merge 动作增量更新，保留编辑状态
      const handleXmlUpdate = (event: Event) => {
        const customEvent = event as CustomEvent<{ xml: string }>;
        if (customEvent.detail?.xml) {
          console.log("🔄 收到 DrawIO 工具触发的 XML 更新事件，开始更新状态");
          console.log("🔄 新 XML 长度:", customEvent.detail.xml.length);
          setDiagramXml(customEvent.detail.xml);
          setCurrentXml(customEvent.detail.xml);
        }
      };

      window.addEventListener(UPDATE_EVENT, handleXmlUpdate);

      return () => {
        window.removeEventListener(UPDATE_EVENT, handleXmlUpdate);
      };
    }
  }, [getDefaultPath]);

  // 自动保存图表到 IndexedDB（自动解码 base64）
  const handleAutoSave = async (xml: string) => {
    setCurrentXml(xml);
    if (typeof window !== "undefined") {
      try {
        await saveDrawioXML(xml);
      } catch (error) {
        console.error("自动保存失败:", error);
        // 可以在这里添加用户提示，但不中断编辑流程
      }
    }
  };

  // 处理 DrawIO 选区变化
  const handleSelectionChange = (info: DrawioSelectionInfo) => {
    setSelectionInfo(info);
    console.log("🎯 选中元素详情:", JSON.stringify(info.cells, null, 2));
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
        settings.defaultPath,
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
        console.log("📂 用户手动加载文件，触发完全重载");
        setForceReload(true); // 触发完全重载
        await saveDrawioXML(result.xml);

        // 手动触发 UPDATE_EVENT，确保编辑器更新
        window.dispatchEvent(
          new CustomEvent(UPDATE_EVENT, {
            detail: { xml: result.xml },
          }),
        );

        // 重置 forceReload 标志
        setTimeout(() => setForceReload(false), 100);
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
          reader.onload = async (event) => {
            const xml = event.target?.result as string;
            console.log("📂 用户手动加载文件，触发完全重载");
            setForceReload(true); // 触发完全重载
            await saveDrawioXML(xml);

            // 手动触发 UPDATE_EVENT，确保编辑器更新
            window.dispatchEvent(
              new CustomEvent(UPDATE_EVENT, {
                detail: { xml },
              }),
            );

            // 重置 forceReload 标志
            setTimeout(() => setForceReload(false), 100);
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
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            background: "#ff6b6b",
            color: "white",
            padding: "8px 16px",
            textAlign: "center",
            fontSize: "14px",
            zIndex: 9999,
          }}
        >
          ⚠️ Socket.IO 未连接，AI 工具功能不可用
        </div>
      )}

      {/* DrawIO 编辑器区域 */}
      <div
        className={`editor-container ${activeSidebar !== "none" ? "sidebar-open" : ""}`}
      >
        <DrawioEditorNative
          initialXml={diagramXml}
          onSave={handleAutoSave}
          onSelectionChange={handleSelectionChange}
          forceReload={forceReload}
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
        selectionLabel={
          isElectronEnv
            ? `选中了${selectionInfo.count}个对象${
                selectionInfo.cells.length > 0
                  ? ` (IDs: ${selectionInfo.cells
                      .map((c) => c.id)
                      .slice(0, 3)
                      .join(
                        ", ",
                      )}${selectionInfo.cells.length > 3 ? "..." : ""})`
                  : ""
              }`
            : "网页无法使用该功能"
        }
      />
    </main>
  );
}
