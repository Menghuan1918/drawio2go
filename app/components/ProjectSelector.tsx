"use client";

import { useState, useEffect } from "react";
import { Card, Button, Input, Label } from "@heroui/react";
import { FolderOpen, Plus, Check } from "lucide-react";
import type { Project } from "../lib/storage/types";

interface ProjectSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  currentProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  projects: Project[];
  onCreateProject: (name: string, description?: string) => void;
}

export default function ProjectSelector({
  isOpen,
  onClose,
  currentProjectId,
  onSelectProject,
  projects,
  onCreateProject,
}: ProjectSelectorProps) {
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
    onCreateProject(newProjectName.trim(), newProjectDescription.trim() || undefined);
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
            选择工程
          </h2>
        </div>

        {/* 工程列表 */}
        <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-2">
          {projects.map((project) => {
            const isActive = project.uuid === currentProjectId;
            return (
              <Card.Root
                key={project.uuid}
                className={`cursor-pointer transition-all ${
                  isActive
                    ? "border-2 border-[#3388BB] bg-[#3388BB]/5"
                    : "border border-gray-200 hover:border-[#3388BB]/50 hover:shadow-md"
                }`}
                onClick={() => handleProjectSelect(project.uuid)}
              >
                <Card.Content className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-semibold text-[#3388BB]">
                          {project.name}
                        </h3>
                        {isActive && (
                          <Check size={20} className="text-[#3388BB]" />
                        )}
                      </div>
                      {project.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {project.description}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-2">
                        创建于:{" "}
                        {new Date(project.created_at).toLocaleDateString(
                          "zh-CN"
                        )}
                      </p>
                    </div>
                  </div>
                </Card.Content>
              </Card.Root>
            );
          })}
        </div>

        {/* 新建工程表单 */}
        {showNewProjectForm && (
          <div className="mt-4 p-4 border-2 border-[#3388BB]/30 rounded-lg bg-[#3388BB]/5">
            <h3 className="text-md font-semibold text-[#3388BB] mb-3">
              新建工程
            </h3>
            <div className="flex flex-col gap-3">
              <div>
                <Label>工程名称 *</Label>
                <Input
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="输入工程名称"
                  className="mt-1"
                  autoFocus
                />
              </div>
              <div>
                <Label>工程描述</Label>
                <Input
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                  placeholder="输入工程描述（可选）"
                  className="mt-1"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="ghost"
                  onPress={() => setShowNewProjectForm(false)}
                >
                  取消
                </Button>
                <Button
                  variant="primary"
                  onPress={handleCreateProject}
                  isDisabled={!newProjectName.trim()}
                >
                  创建
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
              新建工程
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
