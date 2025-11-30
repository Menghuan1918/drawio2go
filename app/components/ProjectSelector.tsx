"use client";

import { useState, useEffect } from "react";
import {
  Card,
  Button,
  Input,
  Label,
  TextField,
  Description,
  Skeleton,
} from "@heroui/react";
import { FolderOpen, Plus, Check } from "lucide-react";
import type { Project } from "../lib/storage/types";
import { useAppTranslation } from "@/app/i18n/hooks";
import { formatVersionTimestamp } from "@/app/lib/format-utils";

interface ProjectSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  currentProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  projects: Project[];
  isLoading: boolean;
  onCreateProject: (name: string, description?: string) => void;
}

export default function ProjectSelector({
  isOpen,
  onClose,
  currentProjectId,
  onSelectProject,
  projects,
  isLoading,
  onCreateProject,
}: ProjectSelectorProps) {
  const { t, i18n } = useAppTranslation("project");
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");

  // 重置表单状态
  useEffect(() => {
    if (!isOpen) {
      setShowNewProjectForm(false);
      setNewProjectName("");
      setNewProjectDescription("");
    }
  }, [isOpen]);

  const handleCreateProject = () => {
    if (!newProjectName.trim()) {
      return;
    }
    onCreateProject(
      newProjectName.trim(),
      newProjectDescription.trim() || undefined,
    );
    setShowNewProjectForm(false);
    setNewProjectName("");
    setNewProjectDescription("");
  };

  const handleProjectSelect = (projectId: string) => {
    onSelectProject(projectId);
    onClose();
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    // 只有点击遮罩本身（不是内容区域）时才关闭
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const skeletonItems = Array.from({ length: 3 });

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div
        className="modal-content"
        style={{ maxWidth: "800px", minWidth: "600px" }}
      >
        {/* 标题 */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="modal-title flex items-center gap-2">
            <FolderOpen size={24} />
            {t("selector.title")}
          </h2>
        </div>

        {/* 项目列表 */}
        <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-2">
          {isLoading &&
            skeletonItems.map((_, index) => (
              <Skeleton
                key={`project-skeleton-${index}`}
                className="h-20 rounded-xl"
              />
            ))}

          {!isLoading && projects.length === 0 && (
            <div className="empty-state-card text-center">
              <p className="empty-state-card__title">
                {t("selector.empty.title")}
              </p>
              <p className="empty-state-card__description">
                {t("selector.empty.description")}
              </p>
            </div>
          )}

          {!isLoading &&
            projects.map((project) => {
              const isActive = project.uuid === currentProjectId;
              return (
                <Card.Root
                  key={project.uuid}
                  className={`cursor-pointer transition-all ${
                    isActive
                      ? "border-2 border-accent bg-accent/5"
                      : "border border-gray-200 hover:border-accent/50 hover:shadow-md"
                  }`}
                  onClick={() => handleProjectSelect(project.uuid)}
                >
                  <Card.Content className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-lg font-semibold text-accent">
                            {project.name}
                          </h3>
                          {isActive && (
                            <Check size={20} className="text-accent" />
                          )}
                        </div>
                        {project.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {project.description}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 mt-2">
                          {t("selector.createdAt", {
                            date: formatVersionTimestamp(
                              project.created_at,
                              "full",
                              i18n.language,
                            ),
                          })}
                        </p>
                      </div>
                    </div>
                  </Card.Content>
                </Card.Root>
              );
            })}
        </div>

        {/* 新建项目表单 */}
        {showNewProjectForm && (
          <div className="mt-4 p-4 border-2 border-accent/30 rounded-lg bg-accent/5">
            <h3 className="text-md font-semibold text-accent mb-3">
              {t("selector.createTitle")}
            </h3>
            <div className="flex flex-col gap-4">
              <TextField className="w-full" isRequired>
                <Label>{t("form.name.label")}</Label>
                <Input
                  value={newProjectName}
                  onChange={(event) => setNewProjectName(event.target.value)}
                  placeholder={t("form.name.placeholder")}
                  autoFocus
                />
                <Description>{t("form.name.help")}</Description>
              </TextField>
              <TextField className="w-full">
                <Label>{t("form.description.label")}</Label>
                <Input
                  value={newProjectDescription}
                  onChange={(event) =>
                    setNewProjectDescription(event.target.value)
                  }
                  placeholder={t("form.description.placeholder")}
                />
                <Description>{t("form.description.help")}</Description>
              </TextField>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="ghost"
                  onPress={() => setShowNewProjectForm(false)}
                >
                  {t("buttons.cancel")}
                </Button>
                <Button
                  variant="primary"
                  onPress={handleCreateProject}
                  isDisabled={!newProjectName.trim()}
                >
                  {t("buttons.create")}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* 底部操作按钮 */}
        <div className="modal-actions">
          {!showNewProjectForm && (
            <Button
              variant="primary"
              onPress={() => setShowNewProjectForm(true)}
              className="flex items-center gap-2"
            >
              <Plus size={16} />
              {t("buttons.new")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
