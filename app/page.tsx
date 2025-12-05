"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Alert, Button, Spinner } from "@heroui/react";
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
import { createLogger } from "./lib/logger";

const logger = createLogger("Page");

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
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedXmlRef = useRef<string>("");
  const pendingXmlRef = useRef<string | null>(null);

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
          logger.info("已创建 WIP 版本", { projectId: projectUuid });
        }
      } catch (error) {
        logger.error("创建 WIP 版本失败", {
          projectId: projectUuid,
          error,
        });
      }
    },
    [getAllXMLVersions, saveXML],
  );

  // 同步 XML 到 diagramXml 状态
  const syncDiagramXml = useCallback(async () => {
    const xml = await loadProjectXml();
    setDiagramXml(xml);
    lastSavedXmlRef.current = xml;
    pendingXmlRef.current = null;
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
          logger.error("初始化工程失败", {
            projectId: currentProject.uuid,
            error,
          });
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
          logger.error("加载默认路径失败", { error });
        }
      };

      loadDefaultPath();

      // 监听 AI 工具触发的 XML 替换事件
      const handleAIXmlReplaced = (event: Event) => {
        const customEvent = event as CustomEvent<{ xml: string }>;
        if (customEvent.detail?.xml && editorRef.current) {
          logger.info("AI 工具更新了 XML，正在加载到编辑器");
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

      logger.error("[DrawIO] 图表更新失败", {
        error,
        message,
      });
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
  const flushPendingSave = useCallback(
    async (options?: { skipStateUpdate?: boolean }) => {
      if (
        !currentProject ||
        typeof window === "undefined" ||
        !pendingXmlRef.current
      ) {
        return;
      }

      const xmlToSave = pendingXmlRef.current;

      if (xmlToSave === lastSavedXmlRef.current) {
        pendingXmlRef.current = null;
        return;
      }

      try {
        await saveXML(xmlToSave, currentProject.uuid);
        lastSavedXmlRef.current = xmlToSave;
        if (!options?.skipStateUpdate) {
          setDiagramXml(xmlToSave);
        }
      } catch (error) {
        logger.error("自动保存失败", {
          projectId: currentProject.uuid,
          error,
        });
        // 可以在这里添加用户提示，但不中断编辑流程
      } finally {
        pendingXmlRef.current = null;
      }
    },
    [currentProject, saveXML],
  );

  const handleAutoSave = useCallback(
    (xml: string) => {
      if (!currentProject || typeof window === "undefined") return;

      // 清除旧的定时器
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current);
      }

      pendingXmlRef.current = xml;

      // 设置新的防抖定时器（1.5 秒）
      saveDebounceRef.current = setTimeout(() => {
        void flushPendingSave();
      }, 1500);
    },
    [currentProject, flushPendingSave],
  );

  // 组件卸载或工程切换时清理定时器并保存未落盘内容
  useEffect(() => {
    return () => {
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current);
        saveDebounceRef.current = null;
      }
      void flushPendingSave({ skipStateUpdate: true });
    };
  }, [flushPendingSave]);

  // 处理 DrawIO 选区变化
  const handleSelectionChange = (info: DrawioSelectionInfo) => {
    setSelectionInfo(info);
    logger.debug("选中元素详情", {
      projectId: currentProject?.uuid,
      cells: info.cells,
    });
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
      logger.error("手动保存失败", { error });
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
          logger.info("用户手动加载文件，使用完全重载", {
            projectId: currentProject?.uuid,
          });
          await replaceWithXml(result.xml, true); // 使用 load 动作完全重载
        } catch (error) {
          logger.error("加载文件失败", {
            projectId: currentProject?.uuid,
            error,
          });
          push({
            description: t("toasts.loadFailed", { error: String(error) }),
            variant: "danger",
          });
        }
      } else if (result.message !== tp("main.userCanceledOpen")) {
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
              logger.info("用户手动加载文件，使用完全重载", {
                projectId: currentProject?.uuid,
              });
              await replaceWithXml(xml, true); // 使用 load 动作完全重载
            } catch (error) {
              logger.error("加载文件失败", {
                projectId: currentProject?.uuid,
                error,
              });
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
      logger.info("开始回滚版本", {
        projectId: currentProject.uuid,
        versionId,
      });

      // 执行回滚操作（将历史版本覆盖到 WIP）
      await rollbackToVersion(currentProject.uuid, versionId);

      // 重新加载 WIP 到编辑器并同步状态
      await syncDiagramXml();

      logger.info("版本回滚成功", {
        projectId: currentProject.uuid,
        versionId,
      });
    } catch (error) {
      logger.error("版本回滚失败", {
        projectId: currentProject.uuid,
        versionId,
        error,
      });
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
      logger.error("切换工程失败", { projectId, error });
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
      logger.error("创建工程失败", { error });
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
      <div className="loading-overlay">
        <div className="loading-overlay__card">
          <Spinner
            size="xl"
            color="success"
            aria-label={tp("main.loadingProject")}
            className="loading-overlay__spinner"
          />
          <h2 className="loading-overlay__title">
            {tp("main.loadingProject")}
          </h2>
          <p className="loading-overlay__description">
            {tp("main.loadingProjectDetail")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <main className={`main-container ${isSidebarOpen ? "sidebar-open" : ""}`}>
      {/* 项目加载失败提示 */}
      {!projectLoading && !currentProject && (
        <div className="error-overlay">
          <div className="error-overlay__card">
            <div
              className="error-overlay__emoji"
              role="img"
              aria-label="warning"
            >
              ⚠️
            </div>
            <Alert status="danger">
              <Alert.Content className="error-overlay__alert-content">
                <Alert.Title className="error-overlay__title">
                  {tp("main.loadingFailed")}
                </Alert.Title>
                <Alert.Description className="error-overlay__description">
                  {tp("main.loadingFailedLine1")}
                  <br />
                  {tp("main.loadingFailedLine2")}
                </Alert.Description>
              </Alert.Content>
            </Alert>
            <div className="error-overlay__actions">
              <Button
                variant="primary"
                onPress={() => window.location.reload()}
              >
                {tp("main.reloadPage")}
              </Button>
            </div>
          </div>
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
        isSocketConnected={isConnected}
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
