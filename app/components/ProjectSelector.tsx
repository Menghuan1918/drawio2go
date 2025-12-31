"use client";

import type {
  ComponentProps,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  Button,
  Input,
  Label,
  TextField,
  Description,
  Skeleton,
  FieldError,
  TooltipContent,
  TooltipRoot,
} from "@heroui/react";
import { FolderOpen, Plus, Check, Pencil, Trash2, X } from "lucide-react";
import { usePress } from "@react-aria/interactions";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Project } from "../lib/storage/types";
import { useAppTranslation } from "@/app/i18n/hooks";
import { formatVersionTimestamp } from "@/app/lib/format-utils";
import ConfirmDialog from "@/app/components/common/ConfirmDialog";
import { DEFAULT_PROJECT_UUID } from "@/app/lib/storage";

// 虚拟滚动阈值 - 项目数量超过此值时启用虚拟滚动
const VIRTUAL_SCROLL_THRESHOLD = 4;
// 估计每个项目卡片的高度
const ESTIMATED_ITEM_HEIGHT = 72;

type CardRootProps = ComponentProps<typeof Card.Root>;

interface PressableProjectCardProps extends Omit<
  CardRootProps,
  "onPress" | "role" | "tabIndex"
> {
  isActive: boolean;
  ariaLabel: string;
  onPress: () => void;
  children: ReactNode;
}

function PressableProjectCard({
  isActive,
  ariaLabel,
  onPress,
  children,
  ...rest
}: PressableProjectCardProps) {
  const { pressProps } = usePress({ onPress });

  return (
    <Card.Root
      role="button"
      tabIndex={0}
      aria-pressed={isActive}
      aria-label={ariaLabel}
      data-active={isActive}
      {...pressProps}
      {...rest}
    >
      {children}
    </Card.Root>
  );
}

interface PressableIconButtonProps {
  ariaLabel: string;
  onPress: () => void;
  isDisabled?: boolean;
  className?: string;
  children: ReactNode;
}

function PressableIconButton({
  ariaLabel,
  onPress,
  isDisabled,
  className,
  children,
}: PressableIconButtonProps) {
  const handleClick = (event: ReactMouseEvent) => {
    event.stopPropagation();
    if (!isDisabled) {
      onPress();
    }
  };

  const handlePointerDown = (event: ReactPointerEvent) => {
    event.stopPropagation();
  };

  const handleKeyDown = (event: ReactKeyboardEvent) => {
    event.stopPropagation();
    if (!isDisabled && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      onPress();
    }
  };

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={isDisabled}
      className={className}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
    >
      {children}
    </button>
  );
}

interface ProjectSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  currentProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  projects: Project[];
  isLoading: boolean;
  onCreateProject: (name: string, description?: string) => void;
  onUpdateProject?: (
    uuid: string,
    name: string,
    description?: string,
  ) => Promise<void>;
  onDeleteProject?: (uuid: string) => Promise<void>;
}

export default function ProjectSelector({
  isOpen,
  onClose,
  currentProjectId,
  onSelectProject,
  projects,
  isLoading,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
}: ProjectSelectorProps) {
  const { t, i18n } = useAppTranslation("project");
  const { t: tValidation } = useAppTranslation("validation");
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [formErrors, setFormErrors] = useState<{
    name?: string;
    description?: string;
  }>({});

  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editErrors, setEditErrors] = useState<{
    name?: string;
    description?: string;
  }>({});
  const [isEditSaving, setIsEditSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const PROJECT_NAME_MIN = 1;
  const PROJECT_NAME_MAX = 100;
  const PROJECT_DESCRIPTION_MAX = 500;

  const parentRef = useRef<HTMLDivElement>(null);

  const enableVirtualScroll = useMemo(
    () => projects.length > VIRTUAL_SCROLL_THRESHOLD,
    [projects.length],
  );

  const virtualizer = useVirtualizer({
    count: projects.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ITEM_HEIGHT,
    overscan: 5,
    enabled: enableVirtualScroll,
  });

  // 重置表单状态
  useEffect(() => {
    if (!isOpen) {
      setShowNewProjectForm(false);
      setNewProjectName("");
      setNewProjectDescription("");
      setFormErrors({});
      setEditingProjectId(null);
      setEditName("");
      setEditDescription("");
      setEditErrors({});
      setIsEditSaving(false);
      setDeleteTarget(null);
      setIsDeleteDialogOpen(false);
    }
  }, [isOpen]);

  const validateProjectForm = () => {
    const nextErrors: typeof formErrors = {};
    const name = newProjectName.trim();
    const description = newProjectDescription.trim();

    if (!name) {
      nextErrors.name = tValidation("project.nameRequired");
    } else {
      if (name.length < PROJECT_NAME_MIN) {
        nextErrors.name = tValidation("project.nameMinLength", {
          min: PROJECT_NAME_MIN,
        });
      }
      if (name.length > PROJECT_NAME_MAX) {
        nextErrors.name = tValidation("project.nameMaxLength", {
          max: PROJECT_NAME_MAX,
        });
      }
    }

    if (description && description.length > PROJECT_DESCRIPTION_MAX) {
      nextErrors.description = tValidation("project.descriptionMaxLength", {
        max: PROJECT_DESCRIPTION_MAX,
      });
    }

    setFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleCreateProject = () => {
    if (!validateProjectForm()) return;

    onCreateProject(
      newProjectName.trim(),
      newProjectDescription.trim() || undefined,
    );
    setShowNewProjectForm(false);
    setNewProjectName("");
    setNewProjectDescription("");
    setFormErrors({});
  };

  const handleProjectSelect = (projectId: string) => {
    onSelectProject(projectId);
    onClose();
  };

  const validateEditForm = () => {
    const nextErrors: typeof editErrors = {};
    const name = editName.trim();
    const description = editDescription.trim();

    if (!name) {
      nextErrors.name = tValidation("project.nameRequired");
    } else {
      if (name.length < PROJECT_NAME_MIN) {
        nextErrors.name = tValidation("project.nameMinLength", {
          min: PROJECT_NAME_MIN,
        });
      }
      if (name.length > PROJECT_NAME_MAX) {
        nextErrors.name = tValidation("project.nameMaxLength", {
          max: PROJECT_NAME_MAX,
        });
      }
    }

    if (description && description.length > PROJECT_DESCRIPTION_MAX) {
      nextErrors.description = tValidation("project.descriptionMaxLength", {
        max: PROJECT_DESCRIPTION_MAX,
      });
    }

    setEditErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleStartEdit = (project: Project) => {
    setShowNewProjectForm(false);
    setEditingProjectId(project.uuid);
    setEditName(project.name);
    setEditDescription(project.description ?? "");
    setEditErrors({});
  };

  const handleCancelEdit = () => {
    setEditingProjectId(null);
    setEditName("");
    setEditDescription("");
    setEditErrors({});
    setIsEditSaving(false);
  };

  const handleSaveEdit = async (projectUuid: string) => {
    if (!onUpdateProject) return;
    if (isEditSaving) return;
    if (!validateEditForm()) return;

    setIsEditSaving(true);
    try {
      await onUpdateProject(
        projectUuid,
        editName.trim(),
        editDescription.trim() || undefined,
      );
      handleCancelEdit();
    } catch {
      // 错误提示交由调用方（例如页面 Toast）处理，这里保持编辑状态不变
    } finally {
      setIsEditSaving(false);
    }
  };

  const handleRequestDelete = (project: Project) => {
    if (!onDeleteProject) return;
    setDeleteTarget(project);
    setIsDeleteDialogOpen(true);
  };

  const stopPropagation = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
  };

  const overlayPressTargetRef = useRef(false);

  const handleOverlayPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    overlayPressTargetRef.current = event.target === event.currentTarget;
  };

  const { pressProps: overlayPressProps } = usePress({
    onPress: () => {
      if (overlayPressTargetRef.current) {
        onClose();
      }
      overlayPressTargetRef.current = false;
    },
  });

  if (!isOpen) return null;

  const skeletonItems = Array.from({ length: 3 });

  const renderProjectCard = (project: Project) => {
    const isActive = project.uuid === currentProjectId;
    const isEditing = editingProjectId === project.uuid;

    if (isEditing) {
      return (
        <Card.Root
          key={project.uuid}
          className={`project-selector-card ${
            isActive ? "project-selector-card--active" : ""
          }`}
        >
          <Card.Content className="p-4">
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <TextField className="w-full" isRequired>
                    <Label>{t("form.name.label")}</Label>
                    <Input
                      value={editName}
                      onChange={(event) => {
                        setEditName(event.target.value);
                        if (editErrors.name) {
                          setEditErrors((prev) => ({
                            ...prev,
                            name: undefined,
                          }));
                        }
                      }}
                      placeholder={t("form.name.placeholder")}
                      autoFocus
                      maxLength={PROJECT_NAME_MAX}
                    />
                    {editErrors.name && (
                      <FieldError className="mt-1">
                        {editErrors.name}
                      </FieldError>
                    )}
                  </TextField>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={handleCancelEdit}
                    isDisabled={isEditSaving}
                    className="flex items-center gap-1"
                  >
                    <X size={16} />
                    {t("buttons.cancel")}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onPress={() => void handleSaveEdit(project.uuid)}
                    isDisabled={
                      isEditSaving ||
                      !editName.trim() ||
                      !!editErrors.name ||
                      !!editErrors.description
                    }
                    className="flex items-center gap-1"
                  >
                    <Check size={16} />
                    {t("buttons.save")}
                  </Button>
                </div>
              </div>

              <TextField className="w-full">
                <Label>{t("form.description.label")}</Label>
                <Input
                  value={editDescription}
                  onChange={(event) => {
                    setEditDescription(event.target.value);
                    if (editErrors.description) {
                      setEditErrors((prev) => ({
                        ...prev,
                        description: undefined,
                      }));
                    }
                  }}
                  placeholder={t("form.description.placeholder")}
                  maxLength={PROJECT_DESCRIPTION_MAX}
                />
                {editErrors.description && (
                  <FieldError className="mt-1">
                    {editErrors.description}
                  </FieldError>
                )}
              </TextField>

              <p className="project-selector__meta text-xs">
                {t("selector.createdAt", {
                  date: formatVersionTimestamp(
                    project.created_at,
                    "full",
                    i18n.language,
                  ),
                })}
              </p>
            </div>
          </Card.Content>
        </Card.Root>
      );
    }

    const isCurrentProject = project.uuid === currentProjectId;
    const isDefaultProject = project.uuid === DEFAULT_PROJECT_UUID;
    const isDeleteDisabled =
      isCurrentProject || isDefaultProject || !onDeleteProject;

    let deleteDisabledReason: string | null = null;
    if (isCurrentProject) {
      deleteDisabledReason = t("delete.disabled.current");
    } else if (isDefaultProject) {
      deleteDisabledReason = t("delete.disabled.default");
    }

    const deleteButton = (
      <PressableIconButton
        ariaLabel={t("buttons.delete")}
        isDisabled={isDeleteDisabled}
        onPress={() => handleRequestDelete(project)}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-danger transition-colors hover:bg-danger-50 disabled:opacity-50 disabled:hover:bg-transparent"
      >
        <Trash2 size={16} />
        <span>{t("buttons.delete")}</span>
      </PressableIconButton>
    );

    let deleteAction: ReactNode = deleteButton;
    if (deleteDisabledReason) {
      deleteAction = (
        <TooltipRoot delay={0} closeDelay={0}>
          <span
            className="inline-flex"
            onPointerDownCapture={stopPropagation}
            onClickCapture={stopPropagation}
            onKeyDownCapture={stopPropagation}
          >
            {deleteButton}
          </span>
          <TooltipContent placement="top">
            {deleteDisabledReason}
          </TooltipContent>
        </TooltipRoot>
      );
    } else if (isDeleteDisabled) {
      deleteAction = (
        <span
          className="inline-flex"
          onPointerDownCapture={stopPropagation}
          onClickCapture={stopPropagation}
          onKeyDownCapture={stopPropagation}
        >
          {deleteButton}
        </span>
      );
    }

    return (
      <PressableProjectCard
        key={project.uuid}
        className={`project-selector-card cursor-pointer ${
          isActive
            ? "project-selector-card--active"
            : "project-selector-card--inactive"
        }`}
        isActive={isActive}
        ariaLabel={project.name}
        onPress={() => handleProjectSelect(project.uuid)}
      >
        <Card.Content className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold text-accent">
                  {project.name}
                </h3>
                {isActive && <Check size={20} className="text-accent" />}
              </div>
              {project.description && (
                <p className="project-selector__description text-sm">
                  {project.description}
                </p>
              )}
              <p className="project-selector__meta text-xs mt-2">
                {t("selector.createdAt", {
                  date: formatVersionTimestamp(
                    project.created_at,
                    "full",
                    i18n.language,
                  ),
                })}
              </p>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <PressableIconButton
                ariaLabel={t("buttons.edit")}
                isDisabled={!onUpdateProject}
                onPress={() => handleStartEdit(project)}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-accent transition-colors hover:bg-accent/10 disabled:opacity-50 disabled:hover:bg-transparent"
              >
                <Pencil size={16} />
                <span>{t("buttons.edit")}</span>
              </PressableIconButton>

              {deleteAction}
            </div>
          </div>
        </Card.Content>
      </PressableProjectCard>
    );
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("selector.title")}
      onPointerDown={handleOverlayPointerDown}
      {...overlayPressProps}
    >
      <div className="modal-content" style={{ width: "min(800px, 90vw)" }}>
        {/* 标题 */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="modal-title flex items-center gap-2">
            <FolderOpen size={24} />
            {t("selector.title")}
          </h2>
        </div>

        {/* 项目列表 */}
        <div
          ref={parentRef}
          className="flex flex-col gap-3 min-h-0 max-h-[60vh] overflow-y-auto pr-2"
        >
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
            projects.length > 0 &&
            (enableVirtualScroll ? (
              <div
                style={{
                  height: `${virtualizer.getTotalSize()}px`,
                  width: "100%",
                  position: "relative",
                }}
              >
                {virtualizer.getVirtualItems().map((virtualItem) => {
                  const project = projects[virtualItem.index];
                  if (!project) return null;
                  const isLastItem = virtualItem.index === projects.length - 1;

                  return (
                    <div
                      key={project.uuid}
                      data-index={virtualItem.index}
                      ref={virtualizer.measureElement}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualItem.start}px)`,
                        paddingBottom: isLastItem ? 0 : "0.75rem",
                      }}
                    >
                      {renderProjectCard(project)}
                    </div>
                  );
                })}
              </div>
            ) : (
              projects.map((project) => renderProjectCard(project))
            ))}
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
                  onChange={(event) => {
                    setNewProjectName(event.target.value);
                    if (formErrors.name) {
                      setFormErrors((prev) => ({ ...prev, name: undefined }));
                    }
                  }}
                  placeholder={t("form.name.placeholder")}
                  autoFocus
                />
                <Description>{t("form.name.help")}</Description>
                {formErrors.name && (
                  <FieldError className="mt-1">{formErrors.name}</FieldError>
                )}
              </TextField>
              <TextField className="w-full">
                <Label>{t("form.description.label")}</Label>
                <Input
                  value={newProjectDescription}
                  onChange={(event) => {
                    setNewProjectDescription(event.target.value);
                    if (formErrors.description) {
                      setFormErrors((prev) => ({
                        ...prev,
                        description: undefined,
                      }));
                    }
                  }}
                  placeholder={t("form.description.placeholder")}
                />
                <Description>{t("form.description.help")}</Description>
                {formErrors.description && (
                  <FieldError className="mt-1">
                    {formErrors.description}
                  </FieldError>
                )}
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
                  isDisabled={
                    !newProjectName.trim() ||
                    !!formErrors.name ||
                    !!formErrors.description
                  }
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
              isDisabled={Boolean(editingProjectId)}
              className="flex items-center gap-2"
            >
              <Plus size={16} />
              {t("buttons.new")}
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onOpenChange={(open) => {
          setIsDeleteDialogOpen(open);
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        title={t("delete.title")}
        description={
          deleteTarget
            ? t("delete.description", { name: deleteTarget.name })
            : ""
        }
        confirmText={t("buttons.delete")}
        cancelText={t("buttons.cancel")}
        variant="danger"
        onConfirm={async () => {
          if (!deleteTarget || !onDeleteProject) return;
          await onDeleteProject(deleteTarget.uuid);
        }}
      />
    </div>
  );
}
