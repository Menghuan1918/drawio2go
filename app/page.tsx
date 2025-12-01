"use client";

import { useState, useEffect, useCallback } from "react";
import DrawioEditorNative from "./components/DrawioEditorNative"; // 使用原生 iframe 实现
import TopBar from "./components/TopBar";
import UnifiedSidebar, { type SidebarTab } from "./components/UnifiedSidebar";
import ProjectSelector from "./components/ProjectSelector";
import { useDrawioSocket } from "./hooks/useDrawioSocket";
import { DrawioSelectionInfo } from "./types/drawio-tools";
import { useStorageSettings } from "./hooks/useStorageSettings";
import { useCurrentProject } from "./hooks/useCurrentProject";
import { useStorageProjects } from "./hooks/useStorageProjects";
import { useStorageXMLVersions } from "./hooks/useStorageXMLVersions";
import { useDrawioEditor } from "./hooks/useDrawioEditor";
import { WIP_VERSION } from "./lib/storage/constants";
import { useToast } from "./components/toast";
import { useAppTranslation, useI18n } from "./i18n/hooks";

export default function Home() {
  // 存储 Hook
  const { getDefaultPath } = useStorageSettings();

  // 工程管理 Hook
  const {
    currentProject,
    loading: projectLoading,
    switchProject,
  } = useCurrentProject();

  const {
    projects,
    createProject,
    getAllProjects,
    loading: projectsLoading,
  } = useStorageProjects();

  const { saveXML, getAllXMLVersions, rollbackToVersion } =
    useStorageXMLVersions();

  const { t } = useI18n();
  const { t: tp } = useAppTranslation("page");
  const { push } = useToast();

  // DrawIO 编辑器 Hook
  const { editorRef, loadProjectXml, replaceWithXml } = useDrawioEditor(
    currentProject?.uuid,
  );

  const [diagramXml, setDiagramXml] = useState<string>("");
  const [settings, setSettings] = useState({ defaultPath: "" });
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("chat");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectionInfo, setSelectionInfo] = useState<DrawioSelectionInfo>({
    count: 0,
    cells: [],
  });
  const [isElectronEnv, setIsElectronEnv] = useState<boolean>(false);
  const [showProjectSelector, setShowProjectSelector] =
    useState<boolean>(false);

  // 初始化 Socket.IO 连接
  const { isConnected } = useDrawioSocket(editorRef);

  // 确保项目有 WIP 版本
  const ensureWIPVersion = useCallback(
    async (projectUuid: string) => {
      try {
        const versions = await getAllXMLVersions(projectUuid);
        const wipVersion = versions.find(
          (v) => v.semantic_version === WIP_VERSION,
        );

        if (!wipVersion) {
          const defaultXml =
            '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>';
          await saveXML(defaultXml, projectUuid);
          console.log("✅ 已创建 WIP 版本");
        }
      } catch (error) {
        console.error("❌ 创建 WIP 版本失败:", error);
      }
    },
    [getAllXMLVersions, saveXML],
  );

  // 同步 XML 到 diagramXml 状态
  const syncDiagramXml = useCallback(async () => {
    const xml = await loadProjectXml();
    setDiagramXml(xml);
  }, [loadProjectXml]);

  // 加载当前工程的 XML
  useEffect(() => {
    if (currentProject && !projectLoading) {
      (async () => {
        try {
          // 先确保 WIP 版本存在
          await ensureWIPVersion(currentProject.uuid);
          // 然后加载工程 XML 到编辑器并同步状态
          await syncDiagramXml();
        } catch (error) {
          console.error("初始化工程失败:", error);
        }
      })();
    }
  }, [currentProject, projectLoading, syncDiagramXml, ensureWIPVersion]);

  // 初始化环境检测
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsElectronEnv(Boolean(window.electron));

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

      // 监听 AI 工具触发的 XML 替换事件
      const handleAIXmlReplaced = (event: Event) => {
        const customEvent = event as CustomEvent<{ xml: string }>;
        if (customEvent.detail?.xml && editorRef.current) {
          console.log("🤖 AI 工具更新了 XML，正在加载到编辑器");
          editorRef.current.loadDiagram(customEvent.detail.xml);
        }
      };

      window.addEventListener("ai-xml-replaced", handleAIXmlReplaced);

      return () => {
        window.removeEventListener("ai-xml-replaced", handleAIXmlReplaced);
      };
    }
  }, [getDefaultPath, editorRef]);

  // 监听 DrawIO 合并错误并展示提示
  useEffect(() => {
    const handleMergeError = (event: Event) => {
      const customEvent = event as CustomEvent<{
        error?: unknown;
        message?: string;
      }>;
      const { error, message } = customEvent.detail || {};

      const mergedMessage =
        (typeof message === "string" && message.trim()) ||
        (error instanceof Error && error.message) ||
        (typeof error === "string" && error.trim()) ||
        tp("main.unknownError");

      console.error("[DrawIO] 图表更新失败:", error, message);
      push({
        variant: "danger",
        title: t("toasts.diagramUpdateFailedTitle"),
        description: t("toasts.diagramUpdateFailed", { error: mergedMessage }),
      });
    };

    window.addEventListener("drawio-merge-error", handleMergeError);

    return () => {
      window.removeEventListener("drawio-merge-error", handleMergeError);
    };
  }, [push, t, tp]);

  // 自动保存图表到统一存储层
  const handleAutoSave = async (xml: string) => {
    if (currentProject && typeof window !== "undefined") {
      try {
        await saveXML(xml, currentProject.uuid);
        // 更新 diagramXml 用于手动保存功能
        setDiagramXml(xml);
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
    try {
      // 从编辑器导出当前 XML
      const currentXml = await editorRef.current?.exportDiagram();

      if (!currentXml) {
        push({
          description: t("toasts.noContentToSave"),
          variant: "warning",
        });
        return;
      }

      // 如果在 Electron 环境中,保存到文件系统
      if (typeof window !== "undefined" && window.electron) {
        const result = await window.electron.saveDiagram(
          currentXml,
          settings.defaultPath,
        );
        if (result.success) {
          push({
            description: t("toasts.fileSaved", { filePath: result.filePath }),
            variant: "success",
          });
        } else {
          push({
            description: t("toasts.saveFailed", { error: result.message }),
            variant: "danger",
          });
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
    } catch (error) {
      console.error("手动保存失败:", error);
      push({
        description: t("toasts.saveFailed", { error: String(error) }),
        variant: "danger",
      });
    }
  };

  // 加载文件
  const handleLoad = async () => {
    if (typeof window !== "undefined" && window.electron) {
      const result = await window.electron.loadDiagram();
      if (result.success && result.xml) {
        try {
          console.log("📂 用户手动加载文件，使用完全重载");
          await replaceWithXml(result.xml, true); // 使用 load 动作完全重载
        } catch (error) {
          console.error("加载文件失败:", error);
          push({
            description: t("toasts.loadFailed", { error: String(error) }),
            variant: "danger",
          });
        }
      } else if (result.message !== "用户取消打开") {
        push({
          description: t("toasts.loadFailed", { error: result.message }),
          variant: "danger",
        });
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
            try {
              console.log("📂 用户手动加载文件，使用完全重载");
              await replaceWithXml(xml, true); // 使用 load 动作完全重载
            } catch (error) {
              console.error("加载文件失败:", error);
              push({
                description: t("toasts.loadFailed", { error: String(error) }),
                variant: "danger",
              });
            }
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

  const handleToggleSidebarVisibility = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  const handleSidebarTabChange = (tab: SidebarTab) => {
    setSidebarTab(tab);
    if (!isSidebarOpen) {
      setIsSidebarOpen(true);
    }
  };

  // 版本回滚处理
  const handleVersionRestore = async (versionId: string) => {
    if (!currentProject) return;

    try {
      console.log(`🔄 开始回滚到版本 ${versionId}`);

      // 执行回滚操作（将历史版本覆盖到 WIP）
      await rollbackToVersion(currentProject.uuid, versionId);

      // 重新加载 WIP 到编辑器并同步状态
      await syncDiagramXml();

      console.log("✅ 版本回滚成功");
    } catch (error) {
      console.error("❌ 版本回滚失败:", error);
      push({
        description: t("toasts.versionRollbackFailed"),
        variant: "danger",
      });
    }
  };

  // 工程选择器处理
  const handleOpenProjectSelector = () => {
    setShowProjectSelector(true);
  };

  const handleCloseProjectSelector = () => {
    setShowProjectSelector(false);
  };

  const handleSelectProject = async (projectId: string) => {
    try {
      await switchProject(projectId);
      // 切换工程后会自动触发 useEffect 加载新工程的 XML
    } catch (error) {
      console.error("切换工程失败:", error);
      push({
        description: t("toasts.projectSwitchFailed"),
        variant: "danger",
      });
    }
  };

  const handleCreateProject = async (name: string, description?: string) => {
    try {
      const newProject = await createProject(name, description);
      await getAllProjects(); // 刷新工程列表
      await switchProject(newProject.uuid);
      setShowProjectSelector(false);
    } catch (error) {
      console.error("创建工程失败:", error);
      push({
        description: t("toasts.projectCreateFailed"),
        variant: "danger",
      });
    }
  };

  const selectionLabelText = isElectronEnv
    ? (() => {
        const selectionIdsPreview = selectionInfo.cells
          .map((c) => c.id)
          .slice(0, 3)
          .join(", ");
        const selectionHasMore = selectionInfo.cells.length > 3;

        if (selectionIdsPreview) {
          return tp("selection.summaryWithIds", {
            count: selectionInfo.count,
            ids: selectionIdsPreview,
            ellipsis: selectionHasMore ? "..." : "",
          });
        }

        return tp("selection.summary", { count: selectionInfo.count });
      })()
    : tp("main.webFeatureUnavailable");

  // 如果正在加载项目，显示加载界面
  if (projectLoading && !currentProject) {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5f5f5",
          zIndex: 10000,
        }}
      >
        <div
          style={{
            background: "white",
            padding: "40px",
            borderRadius: "12px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
            textAlign: "center",
            maxWidth: "400px",
          }}
        >
          <div
            style={{
              width: "60px",
              height: "60px",
              border: "4px solid #e0e0e0",
              borderTop: "4px solid #4CAF50",
              borderRadius: "50%",
              margin: "0 auto 20px",
              animation: "spin 1s linear infinite",
            }}
          />
          <h2 style={{ margin: "0 0 10px", fontSize: "20px", color: "#333" }}>
            {tp("main.loadingProject")}
          </h2>
          <p style={{ margin: 0, fontSize: "14px", color: "#666" }}>
            {tp("main.loadingProjectDetail")}
          </p>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </div>
    );
  }

  return (
    <main className={`main-container ${isSidebarOpen ? "sidebar-open" : ""}`}>
      {/* 顶部通知区域：Socket 断连 & DrawIO 合并错误 */}
      {!isConnected && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            padding: "8px 16px",
            zIndex: 9999,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              background: "#ff6b6b",
              color: "white",
              padding: "8px 12px",
              textAlign: "center",
              fontSize: "14px",
              borderRadius: "8px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
              pointerEvents: "auto",
            }}
          >
            {tp("main.socketDisconnected")}
          </div>
        </div>
      )}

      {/* 项目加载失败提示 */}
      {!projectLoading && !currentProject && (
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "white",
            padding: "40px",
            borderRadius: "12px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
            textAlign: "center",
            maxWidth: "500px",
            zIndex: 10000,
          }}
        >
          <div
            style={{
              fontSize: "48px",
              marginBottom: "20px",
            }}
          >
            ⚠️
          </div>
          <h2
            style={{
              margin: "0 0 10px",
              fontSize: "24px",
              color: "#d32f2f",
            }}
          >
            {tp("main.loadingFailed")}
          </h2>
          <p
            style={{
              margin: "0 0 20px",
              fontSize: "14px",
              color: "#666",
              lineHeight: "1.6",
            }}
          >
            {tp("main.loadingFailedLine1")}
            <br />
            {tp("main.loadingFailedLine2")}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: "#4CAF50",
              color: "white",
              border: "none",
              padding: "12px 24px",
              borderRadius: "6px",
              fontSize: "16px",
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(76,175,80,0.3)",
            }}
          >
            {tp("main.reloadPage")}
          </button>
        </div>
      )}

      <TopBar
        selectionLabel={selectionLabelText}
        currentProjectName={currentProject?.name}
        onOpenProjectSelector={handleOpenProjectSelector}
        onLoad={handleLoad}
        onSave={handleManualSave}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={handleToggleSidebarVisibility}
      />

      {/* DrawIO 编辑器区域 */}
      <div
        className={`editor-container ${isSidebarOpen ? "sidebar-open" : ""}`}
      >
        <DrawioEditorNative
          ref={editorRef}
          initialXml={diagramXml}
          onSave={handleAutoSave}
          onSelectionChange={handleSelectionChange}
        />
      </div>

      {/* 统一侧拉栏 */}
      <UnifiedSidebar
        isOpen={isSidebarOpen}
        activeTab={sidebarTab}
        onClose={() => setIsSidebarOpen(false)}
        onTabChange={handleSidebarTabChange}
        onSettingsChange={handleSettingsChange}
        currentProjectId={currentProject?.uuid}
        projectUuid={currentProject?.uuid}
        onVersionRestore={handleVersionRestore}
        editorRef={editorRef}
      />

      {/* 工程选择器 */}
      <ProjectSelector
        isOpen={showProjectSelector}
        onClose={handleCloseProjectSelector}
        currentProjectId={currentProject?.uuid || null}
        onSelectProject={handleSelectProject}
        projects={projects}
        isLoading={projectsLoading}
        onCreateProject={handleCreateProject}
      />
    </main>
  );
}
