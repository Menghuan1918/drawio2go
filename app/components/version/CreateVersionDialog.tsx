"use client";

import React from "react";
import {
  Button,
  TextField,
  Input,
  TextArea,
  Label,
  Description,
  Spinner,
  FieldError,
  RadioGroup,
  Radio,
  Select,
  ListBox,
} from "@heroui/react";
import {
  useStorageXMLVersions,
  type CreateHistoricalVersionResult,
} from "@/app/hooks/useStorageXMLVersions";
import { X, Sparkles } from "lucide-react";
import type { DrawioEditorRef } from "@/app/components/DrawioEditorNative";
import type { XMLVersion } from "@/app/lib/storage/types";
import { WIP_VERSION } from "@/app/lib/storage/constants";
import { isSubVersion } from "@/app/lib/version-utils";
import { useAppTranslation } from "@/app/i18n/hooks";
import { ErrorCodes } from "@/app/errors/error-codes";

type VersionType = "main" | "sub";

const VERSION_DESCRIPTION_MAX = 500;
const SUB_VERSION_MIN = 1;
const SUB_VERSION_MAX = 999;

interface CreateVersionDialogProps {
  projectUuid: string;
  isOpen: boolean;
  onClose: () => void;
  onVersionCreated?: (result: CreateHistoricalVersionResult) => void;
  editorRef: React.RefObject<DrawioEditorRef | null>;
  parentVersion?: string;
}

/**
 * 创建版本对话框组件
 * 提供表单让用户输入版本号和描述，创建新的版本快照
 */
export function CreateVersionDialog({
  projectUuid,
  isOpen,
  onClose,
  onVersionCreated,
  editorRef,
  parentVersion,
}: CreateVersionDialogProps) {
  const { t: tVersion } = useAppTranslation("version");
  const { t: tValidation } = useAppTranslation("validation");
  const [mainVersionInput, setMainVersionInput] = React.useState("");
  const [subVersionInput, setSubVersionInput] = React.useState("");
  const [versionType, setVersionType] = React.useState<VersionType>(
    parentVersion ? "sub" : "main",
  );
  const [selectedParentVersion, setSelectedParentVersion] = React.useState(
    parentVersion ?? "",
  );
  const [description, setDescription] = React.useState("");
  const [error, setError] = React.useState("");
  const [isCreating, setIsCreating] = React.useState(false);
  const [validationError, setValidationError] = React.useState("");
  const [checkingExists, setCheckingExists] = React.useState(false);
  const [parentOptions, setParentOptions] = React.useState<XMLVersion[]>([]);
  const [isLoadingParents, setIsLoadingParents] = React.useState(false);
  const [parentOptionsError, setParentOptionsError] = React.useState<
    string | null
  >(null);
  const [exportProgress, setExportProgress] = React.useState<{
    current: number;
    total: number;
    name?: string;
  } | null>(null);
  const [successMessage, setSuccessMessage] = React.useState("");
  const closeTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  const {
    createHistoricalVersion,
    getRecommendedVersion,
    validateVersion,
    isVersionExists,
    getAllXMLVersions,
  } = useStorageXMLVersions();

  const mapValidationError = React.useCallback(
    (error?: string) => {
      const codeMatch = error?.match(/\[(\d+)\]/);
      const code = codeMatch ? Number(codeMatch[1]) : undefined;

      switch (code) {
        case ErrorCodes.VERSION_NUMBER_EMPTY:
          return tValidation("version.numberRequired");
        case ErrorCodes.VERSION_FORMAT_INVALID:
          return tValidation("version.formatInvalid");
        case ErrorCodes.VERSION_RESERVED:
          return tValidation("version.reservedVersion");
        case ErrorCodes.VERSION_SUB_INVALID:
          return tValidation("version.subVersionInvalid");
        case ErrorCodes.VERSION_SUB_RANGE:
          return tValidation("version.subVersionRange", {
            min: SUB_VERSION_MIN,
            max: SUB_VERSION_MAX,
          });
        case ErrorCodes.VERSION_PARENT_NOT_FOUND: {
          const parentMatch = error?.match(/parent\s+([\d.]+)/i);
          return tValidation("version.parentNotFound", {
            parent: parentMatch?.[1] || "",
          });
        }
        default:
          return error || tValidation("version.formatInvalid");
      }
    },
    [tValidation],
  );

  const effectiveVersionNumber = React.useMemo(() => {
    if (versionType === "sub") {
      const parent = selectedParentVersion.trim();
      const suffix = subVersionInput.trim();
      if (!parent || !suffix) {
        return "";
      }
      return `${parent}.${suffix}`;
    }
    return mainVersionInput.trim();
  }, [versionType, selectedParentVersion, subVersionInput, mainVersionInput]);

  const resetVersionInputs = React.useCallback(() => {
    setMainVersionInput("");
    setSubVersionInput("");
    setSelectedParentVersion(parentVersion ?? "");
    setVersionType(parentVersion ? "sub" : "main");
  }, [parentVersion]);

  const noParentOptions =
    !parentVersion && parentOptions.length === 0 && !isLoadingParents;

  const handleVersionTypeChange = React.useCallback(
    (value: string) => {
      const next = value as VersionType;
      if (parentVersion && next === "main") {
        return;
      }
      setVersionType(next);
      setValidationError("");
      setError("");
    },
    [parentVersion],
  );

  const handleDialogClose = React.useCallback(() => {
    if (isCreating) return;
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setSuccessMessage("");
    setExportProgress(null);
    setError("");
    setValidationError("");
    setCheckingExists(false);
    resetVersionInputs();
    onClose();
  }, [isCreating, onClose, resetVersionInputs]);

  const handleCreate = React.useCallback(async () => {
    setError("");
    setSuccessMessage("");
    setExportProgress(null);

    if (validationError) {
      return;
    }

    if (
      description.trim() &&
      description.trim().length > VERSION_DESCRIPTION_MAX
    ) {
      setValidationError(
        tValidation("version.descriptionMaxLength", {
          max: VERSION_DESCRIPTION_MAX,
        }),
      );
      return;
    }

    if (!effectiveVersionNumber) {
      setValidationError(tValidation("version.numberRequired"));
      return;
    }

    const validation = validateVersion(projectUuid, effectiveVersionNumber);
    if (!validation.valid) {
      const matched = mapValidationError(validation.error);
      setValidationError(matched || tValidation("version.formatInvalid"));
      return;
    }

    try {
      const exists = await isVersionExists(projectUuid, effectiveVersionNumber);
      if (exists) {
        setValidationError(
          tValidation("version.versionExists", {
            version: effectiveVersionNumber,
          }),
        );
        return;
      }
    } catch (err) {
      console.error(
        "[CreateVersionDialog] Failed to check version uniqueness",
        err,
      );
      setValidationError(tValidation("version.uniquenessCheckFailed"));
      return;
    }

    setIsCreating(true);
    try {
      const result = await createHistoricalVersion(
        projectUuid,
        effectiveVersionNumber,
        description.trim() || undefined,
        editorRef,
        {
          onExportProgress: (progress) => {
            setExportProgress({
              current: progress.index + 1,
              total: progress.total,
              name: progress.name,
            });
          },
        },
      );

      onVersionCreated?.(result);

      const successText = result.svgAttached
        ? tVersion("create.status.success", { pageCount: result.pageCount })
        : tVersion("create.status.degraded", { pageCount: result.pageCount });
      setSuccessMessage(successText);

      if (versionType === "sub") {
        setSubVersionInput("");
      } else {
        setMainVersionInput("");
      }
      setDescription("");
      setValidationError("");
      setExportProgress(null);

      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
      closeTimerRef.current = setTimeout(() => {
        setSuccessMessage("");
        handleDialogClose();
      }, 1400);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : tVersion("create.status.error"),
      );
    } finally {
      setIsCreating(false);
      setExportProgress(null);
    }
  }, [
    validationError,
    effectiveVersionNumber,
    description,
    validateVersion,
    mapValidationError,
    projectUuid,
    isVersionExists,
    createHistoricalVersion,
    editorRef,
    onVersionCreated,
    handleDialogClose,
    versionType,
    tValidation,
    tVersion,
  ]);

  const handleRecommend = React.useCallback(async () => {
    try {
      if (versionType === "sub") {
        const parent = selectedParentVersion?.trim();
        if (!parent) {
          setError(tVersion("create.status.parentRequired"));
          return;
        }
        const recommended = await getRecommendedVersion(projectUuid, parent);
        const prefix = `${parent}.`;
        const suffix = recommended.startsWith(prefix)
          ? recommended.slice(prefix.length)
          : "";
        setSubVersionInput(suffix);
      } else {
        const recommended = await getRecommendedVersion(projectUuid);
        setMainVersionInput(recommended);
      }
      setError("");
    } catch (err) {
      console.error(
        "[CreateVersionDialog] Failed to get recommended version",
        err,
      );
      setError(tValidation("version.recommendedVersionFailed"));
    }
  }, [
    versionType,
    selectedParentVersion,
    projectUuid,
    getRecommendedVersion,
    tVersion,
    tValidation,
  ]);

  React.useEffect(() => {
    if (isOpen && projectUuid) {
      setSuccessMessage("");
      setExportProgress(null);
    }
  }, [isOpen, projectUuid]);

  React.useEffect(() => {
    if (!isOpen || !projectUuid) {
      return;
    }

    const shouldPrefillMain =
      versionType === "main" && !mainVersionInput.trim();
    const shouldPrefillSub =
      versionType === "sub" &&
      !subVersionInput.trim() &&
      !!selectedParentVersion;

    if (!shouldPrefillMain && !shouldPrefillSub) {
      return;
    }

    let isMounted = true;
    getRecommendedVersion(
      projectUuid,
      versionType === "sub" ? selectedParentVersion : undefined,
    )
      .then((recommended) => {
        if (!isMounted) return;
        if (versionType === "sub") {
          const prefix = `${selectedParentVersion}.`;
          const suffix = recommended.startsWith(prefix)
            ? recommended.slice(prefix.length)
            : "";
          setSubVersionInput(suffix);
        } else {
          setMainVersionInput(recommended);
        }
      })
      .catch((err) => {
        console.error(
          "[CreateVersionDialog] Failed to prefill recommended version",
          err,
        );
      });

    return () => {
      isMounted = false;
    };
  }, [
    isOpen,
    projectUuid,
    versionType,
    selectedParentVersion,
    subVersionInput,
    mainVersionInput,
    getRecommendedVersion,
  ]);

  React.useEffect(() => {
    if (versionType === "sub") {
      if (!selectedParentVersion) {
        setValidationError(tValidation("version.parentRequired"));
        setCheckingExists(false);
        return;
      }

      const suffix = subVersionInput.trim();
      if (!suffix) {
        setValidationError(tValidation("version.subVersionRequired"));
        setCheckingExists(false);
        return;
      }

      if (!/^\d+$/.test(suffix)) {
        setValidationError(tValidation("version.subVersionNumeric"));
        setCheckingExists(false);
        return;
      }
    }

    if (!effectiveVersionNumber) {
      setValidationError("");
      setCheckingExists(false);
      return;
    }

    const validation = validateVersion(projectUuid, effectiveVersionNumber);
    if (!validation.valid) {
      const matched = mapValidationError(validation.error);
      setValidationError(matched || tValidation("version.formatInvalid"));
      setCheckingExists(false);
      return;
    }

    const currentVersion = effectiveVersionNumber;
    const timer = setTimeout(async () => {
      setCheckingExists(true);
      try {
        const exists = await isVersionExists(projectUuid, currentVersion);
        if (currentVersion === effectiveVersionNumber) {
          if (exists) {
            setValidationError(
              tValidation("version.versionExists", {
                version: effectiveVersionNumber,
              }),
            );
          } else {
            setValidationError("");
          }
        }
      } catch (err) {
        console.error(
          "[CreateVersionDialog] Version uniqueness check failed",
          err,
        );
        setValidationError(tValidation("version.uniquenessCheckFailed"));
      } finally {
        setCheckingExists(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [
    effectiveVersionNumber,
    versionType,
    selectedParentVersion,
    subVersionInput,
    projectUuid,
    validateVersion,
    isVersionExists,
    mapValidationError,
    tValidation,
  ]);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "Enter" &&
        !isCreating &&
        effectiveVersionNumber &&
        !validationError &&
        !checkingExists
      ) {
        e.preventDefault();
        handleCreate();
      } else if (e.key === "Escape" && !isCreating) {
        e.preventDefault();
        handleDialogClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isOpen,
    isCreating,
    effectiveVersionNumber,
    validationError,
    checkingExists,
    handleCreate,
    handleDialogClose,
  ]);

  React.useEffect(() => {
    if (!isOpen) {
      setError("");
      setValidationError("");
      setSuccessMessage("");
      setExportProgress(null);
      setDescription("");
      setCheckingExists(false);
      resetVersionInputs();
    }
  }, [isOpen, resetVersionInputs]);

  React.useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    if (parentVersion) {
      setVersionType("sub");
      setSelectedParentVersion(parentVersion);
    }
  }, [parentVersion]);

  React.useEffect(() => {
    if (!isOpen) return;
    if (versionType !== "sub") return;
    if (selectedParentVersion) return;

    if (parentOptions.length > 0) {
      setSelectedParentVersion(parentOptions[0].semantic_version);
    }
  }, [isOpen, versionType, parentOptions, selectedParentVersion]);

  React.useEffect(() => {
    if (!isOpen || !projectUuid) {
      return;
    }

    let isMounted = true;
    setIsLoadingParents(true);
    setParentOptionsError(null);

    getAllXMLVersions(projectUuid)
      .then((versions) => {
        if (!isMounted) return;
        const filtered = versions.filter(
          (version) =>
            version.semantic_version !== WIP_VERSION &&
            !isSubVersion(version.semantic_version),
        );
        setParentOptions(filtered);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("加载主版本列表失败:", err);
        setParentOptions([]);
        setParentOptionsError(tVersion("create.status.parentLoadFailed"));
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingParents(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, projectUuid, getAllXMLVersions, tVersion]);

  if (!isOpen) return null;

  return (
    <div className="dialog-overlay" onClick={handleDialogClose}>
      <div className="dialog-container" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3 className="text-lg font-semibold">{tVersion("create.title")}</h3>
          <Button
            size="sm"
            variant="ghost"
            isIconOnly
            aria-label={tVersion("aria.viewer.close")}
            onPress={handleDialogClose}
            isDisabled={isCreating}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="dialog-content">
          <RadioGroup
            className="w-full"
            value={versionType}
            orientation="horizontal"
            onChange={handleVersionTypeChange}
            isDisabled={isCreating}
          >
            <Label>{tVersion("create.versionType.label")}</Label>
            <Description className="mt-2">
              {tVersion("create.versionType.description")}
            </Description>
            <Radio value="main" isDisabled={!!parentVersion}>
              <Radio.Content>
                <Label>{tVersion("create.versionType.main.label")}</Label>
                <Description className="text-xs text-default-500">
                  {tVersion("create.versionType.main.description")}
                </Description>
              </Radio.Content>
            </Radio>
            <Radio value="sub">
              <Radio.Content>
                <Label>{tVersion("create.versionType.sub.label")}</Label>
                <Description className="text-xs text-default-500">
                  {tVersion("create.versionType.sub.description")}
                </Description>
              </Radio.Content>
            </Radio>
          </RadioGroup>

          {versionType === "sub" && (
            <Select
              className="w-full mt-4"
              value={selectedParentVersion || null}
              onChange={(value) => {
                if (typeof value === "string") {
                  setSelectedParentVersion(value);
                }
              }}
              isDisabled={isCreating || !!parentVersion}
            >
              <Label>{tVersion("create.parent.label")}</Label>
              <Select.Trigger className="mt-2 flex w-full items-center justify-between rounded-md border border-default-200 bg-content1 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
                <Select.Value className="text-sm leading-6 text-foreground" />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Content className="rounded-2xl border border-default-200 bg-content1 p-2 shadow-2xl">
                <ListBox className="flex flex-col gap-1">
                  {parentOptions.map((version) => (
                    <ListBox.Item
                      key={version.id}
                      id={version.semantic_version}
                      textValue={`v${version.semantic_version} - ${
                        version.description?.trim() ||
                        tVersion("card.labels.noDescription")
                      }`}
                      className="select-item flex items-center justify-between rounded-xl px-3 py-2 text-sm text-foreground hover:bg-primary-50"
                    >
                      <span className="font-medium text-foreground">
                        v{version.semantic_version} -{" "}
                        {version.description?.trim()
                          ? version.description
                          : tVersion("card.labels.noDescription")}
                      </span>
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Content>
              {parentOptionsError ? (
                <FieldError className="mt-2">{parentOptionsError}</FieldError>
              ) : isLoadingParents ? (
                <Description className="mt-2 flex items-center gap-2 text-default-500">
                  <Spinner size="sm" />
                  {tVersion("create.parent.loading")}
                </Description>
              ) : noParentOptions ? (
                <FieldError className="mt-2">
                  {tVersion("create.parent.empty")}
                </FieldError>
              ) : (
                <Description className="mt-2 text-default-500">
                  {parentVersion
                    ? tVersion("create.parent.locked", {
                        version: parentVersion,
                      })
                    : tVersion("create.parent.filterHint")}
                </Description>
              )}
            </Select>
          )}

          <TextField
            className="w-full mt-4"
            isRequired
            isInvalid={!!validationError}
          >
            <Label>
              {versionType === "sub"
                ? tVersion("create.versionNumber.labelSub")
                : tVersion("create.versionNumber.labelMain")}
            </Label>
            <div
              className={`mt-2 flex gap-2 ${versionType === "sub" ? "items-center" : ""}`}
            >
              {versionType === "sub" ? (
                <>
                  <span className="min-w-[120px] rounded-md border border-dashed border-default-200 bg-default-100 px-3 py-2 text-sm text-default-600">
                    {selectedParentVersion
                      ? `${selectedParentVersion}.`
                      : tVersion("create.parent.noneSelected")}
                  </span>
                  <Input
                    value={subVersionInput}
                    onChange={(e) =>
                      setSubVersionInput(e.target.value.replace(/\D/g, ""))
                    }
                    placeholder="1"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="flex-1"
                    disabled={isCreating || !selectedParentVersion}
                  />
                </>
              ) : (
                <Input
                  value={mainVersionInput}
                  onChange={(e) => setMainVersionInput(e.target.value)}
                  placeholder={tVersion("create.versionNumber.placeholder")}
                  className="flex-1"
                  disabled={isCreating}
                />
              )}
              <Button
                size="sm"
                variant="secondary"
                onPress={handleRecommend}
                isDisabled={
                  isCreating ||
                  (versionType === "sub" && !selectedParentVersion)
                }
              >
                <Sparkles className="w-3.5 h-3.5" />
                {tVersion("create.versionNumber.recommend")}
              </Button>
            </div>
            {checkingExists ? (
              <Description className="mt-2 flex items-center gap-2 text-blue-600">
                <Spinner size="sm" />
                {tVersion("create.versionNumber.checking")}
              </Description>
            ) : validationError ? (
              <FieldError className="mt-2">{validationError}</FieldError>
            ) : effectiveVersionNumber ? (
              <Description className="mt-2 text-green-600">
                {tVersion("create.versionNumber.available", {
                  version: effectiveVersionNumber,
                })}
              </Description>
            ) : versionType === "sub" ? (
              <Description className="mt-2">
                {tVersion("create.versionNumber.inputSubHint", {
                  full: selectedParentVersion
                    ? `${selectedParentVersion}.${tVersion("create.versionNumber.autoFilled")}`
                    : tVersion("create.versionNumber.autoFilled"),
                })}
              </Description>
            ) : (
              <Description className="mt-2">
                {tVersion("create.versionNumber.description")}
              </Description>
            )}
          </TextField>

          <TextField className="w-full mt-4">
            <Label>{tVersion("create.description.label")}</Label>
            <TextArea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={tVersion("create.description.placeholder")}
              rows={4}
              className="mt-2"
              disabled={isCreating}
            />
            <Description className="mt-2">
              {tVersion("create.description.helper")}
            </Description>
          </TextField>

          {error && (
            <div className="error-message mt-4">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {successMessage && !isCreating && (
            <div className="success-message mt-4 text-sm text-green-600">
              {successMessage}
            </div>
          )}

          {isCreating && (
            <div className="mt-4 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">
              {exportProgress?.total ? (
                <span>
                  {tVersion("create.status.exporting", {
                    current: exportProgress.current,
                    total: exportProgress.total,
                  })}
                  {exportProgress.name ? `（${exportProgress.name}）` : ""}...
                </span>
              ) : (
                <span>{tVersion("create.status.exportingMessage")}</span>
              )}
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <Button
            variant="secondary"
            onPress={handleDialogClose}
            isDisabled={isCreating}
          >
            {tVersion("create.buttons.cancel")}
          </Button>
          <Button
            variant="primary"
            onPress={handleCreate}
            isDisabled={
              !effectiveVersionNumber ||
              isCreating ||
              !!validationError ||
              checkingExists
            }
          >
            {isCreating ? (
              <>
                <Spinner size="sm" />
                <span className="ml-2">
                  {tVersion("create.buttons.creating")}
                </span>
              </>
            ) : (
              tVersion("create.buttons.create")
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
